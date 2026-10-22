import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { VaultIndex } from './vault.mjs';
import { Auth } from './auth.mjs';

const bad=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const text=(value,min=0,max=300)=>{if(typeof value!=='string'||value.length<min||value.length>max)throw bad('Invalid input.');return value;};
export async function createServer({vaultPath,statePath,publicOrigin,clientDir,initialPassword}) {
  const origin=new URL(publicOrigin);
  if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin.');
  const vault=new VaultIndex(vaultPath);await vault.initialize();
  const auth=new Auth(statePath);await auth.initialize(initialPassword);
  const app=Fastify({logger:false,bodyLimit:8192,requestTimeout:15000});
  await app.register(cookie);await app.register(rateLimit,{global:false});
  app.setErrorHandler((error,_req,reply)=>{
    const status=error.statusCode>=400&&error.statusCode<=599?error.statusCode:500;
    reply.code(status).send({error:{code:status===401?'SIGN_IN_REQUIRED':status===404?'NOT_FOUND':status===429?'TOO_MANY_ATTEMPTS':status>=500?'SERVER_ERROR':'REQUEST_INVALID',message:status>=500?'The reader could not complete this request. Please try again.':error.message,...(error.choices?{choices:error.choices}:{})}});
  });
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin').header('X-Robots-Tag','noindex, nofollow, noarchive')
      .header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(req.url==='/healthz'||req.url==='/readyz')return;
    if(req.headers.host!==origin.host)throw bad('Open Memex using its configured server address.',403);
    reply.header('Cache-Control','no-store');
    if(!['GET','HEAD'].includes(req.method)) {
      if(req.headers.origin!==origin.origin)throw bad('This request came from a different website.',403);
      if(req.headers['content-type']?.split(';')[0]!=='application/json')throw bad('Send this action as JSON.',415);
    }
    if(!req.url.startsWith('/api/')||req.url.split('?')[0]==='/api/session'||req.url.split('?')[0]==='/api/login')return;
    req.ownerSession=auth.session(req.cookies.memex_session);
    if(!req.ownerSession)throw bad('Sign in to read your vault.',401);
    if(!['GET','HEAD'].includes(req.method)&&req.headers['x-memex-csrf']!==req.ownerSession.csrf)throw bad('Refresh the page before trying again.',403);
  });
  const cookieOptions={path:'/',httpOnly:true,sameSite:'strict',secure:origin.protocol==='https:',maxAge:86400};
  const sessionData=session=>({authenticated:!!session,username:session?auth.owner.username:null,csrf:session?.csrf||null});
  app.get('/api/session',req=>sessionData(auth.session(req.cookies.memex_session)));
  app.post('/api/login',{config:{rateLimit:{max:10,timeWindow:'15 minutes'}}},async(req,reply)=>{
    const session=await auth.login(text(req.body?.username,1,100),text(req.body?.password,1,256));
    if(req.cookies.memex_session)auth.sessions.delete(req.cookies.memex_session);
    reply.setCookie('memex_session',session.id,cookieOptions);return sessionData(session);
  });
  app.post('/api/logout',async(req,reply)=>{auth.sessions.delete(req.cookies.memex_session);reply.clearCookie('memex_session',{path:'/'});return {ok:true};});
  app.post('/api/password',async req=>{await auth.changePassword(req.cookies.memex_session,text(req.body?.currentPassword,1,256),text(req.body?.newPassword,12,256));return {ok:true};});
  app.get('/api/search',async req=>{
    const q=text(req.query.q??'',0,160);const area=req.query.area??'all';const sort=req.query.sort??'relevance';
    if(!['all','engineering','learning','personal'].includes(area)||!['relevance','updated','title'].includes(sort))throw bad('Choose a valid area and sort order.');
    const offset=Number(req.query.offset??0),limit=Number(req.query.limit??30);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)throw bad('Invalid page size.');
    return vault.search({q,area,sort,offset,limit});
  });
  app.get('/api/file',req=>vault.document(text(req.query.path,1,1000),text(req.query.q??'',0,160)));
  app.get('/api/resolve',req=>vault.resolve(text(req.query.target,1,1000),text(req.query.from??'',0,1000)));
  app.get('/api/stats',()=>vault.stats());
  app.get('/api/asset',async(req,reply)=>{const image=await vault.asset(text(req.query.path,1,1000));return reply.type(image.type).send(image.data);});
  app.get('/healthz',()=>({status:'ok'}));
  app.get('/readyz',async(_req,reply)=>{try{await import('node:fs/promises').then(fs=>fs.access(vaultPath));return {ready:!!vault.indexedAt};}catch{return reply.code(503).send({ready:false});}});
  app.get('/robots.txt',(_req,reply)=>reply.type('text/plain').send('User-agent: *\nDisallow: /\n'));
  if(clientDir) {
    await app.register(staticFiles,{root:path.resolve(clientDir),index:'index.html',dotfiles:'deny',maxAge:0});
    app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:{code:'NOT_FOUND',message:'Unknown reader action.'}}):reply.sendFile('index.html'));
  }
  app.addHook('onClose',()=>vault.close());
  app.decorate('vaultIndex',vault);
  return app;
}
