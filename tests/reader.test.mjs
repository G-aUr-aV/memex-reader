import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../server/app.mjs';
import {VaultIndex,termsFor} from '../server/vault.mjs';
import {makeFixture,fixturePassword} from './fixtures.mjs';

test('search groups literal matches by file, preserves physical line numbers and filters/sorts',async t=>{
  const f=await makeFixture();const index=new VaultIndex(f.vault);await index.initialize();t.after(async()=>{index.close();await f.cleanup();});
  const results=index.search({q:'MEMORY'});
  assert.equal(results.files,4);assert.equal(results.matches,17);assert.equal(results.results[0].matches,6);
  assert.equal(results.results[0].snippets[0].line,14);assert.match(results.results[0].snippets[0].text,/Memory gives/);
  assert.equal(index.search({q:'memory',area:'engineering'}).files,1);
  assert.equal(index.search({q:'"future self" memory'}).files,1);
  assert.equal(index.search({q:'memory (.+)'}).files,0);
  assert.equal(index.search({q:'PUBLIC_ORIGIN'}).files,1);
  assert.equal(index.search({q:'a+b'}).files,1);
  assert.equal(index.search({q:'memory',offset:1,limit:2}).results.length,2);
  assert.deepEqual(termsFor('"future self" MEMORY memory'),['future self','memory']);
  assert.throws(()=>termsFor('a'.repeat(161)),/160/);
});

test('index is read-only, omits dotfiles/config/symlinks and never runs frontmatter code',async t=>{
  const f=await makeFixture();t.after(f.cleanup);
  await fs.writeFile(path.join(f.vault,'AGENTS.md'),'hidden-owner-configuration');
  await fs.mkdir(path.join(f.vault,'.memex'));await fs.writeFile(path.join(f.vault,'.memex','private.md'),'hidden-private-state');
  await fs.writeFile(path.join(f.root,'private.md'),'hidden-symlink-target');await fs.symlink(path.join(f.root,'private.md'),path.join(f.vault,'wiki','bad-link.md'));
  await fs.writeFile(path.join(f.vault,'wiki','engine.md'),'---javascript\n({title:(globalThis.__MEMEX_EXECUTED=true,"unsafe")})\n---\n# Safe fallback');
  const index=new VaultIndex(f.vault);await index.initialize();t.after(()=>index.close());
  assert.equal(globalThis.__MEMEX_EXECUTED,undefined);
  for(const word of ['hidden-owner-configuration','hidden-private-state','hidden-symlink-target'])assert.equal(index.search({q:word}).files,0);
  assert.throws(()=>index.document('../private.md'),/not available/);
  const original=await fs.readFile(path.join(f.vault,'wiki/learning/concepts/connected-note.md'),'utf8');
  const doc=index.document('wiki/learning/concepts/connected-note.md','memory');
  assert.equal(doc.backlinks.length,2);assert.equal(doc.outgoing.length,1);
  assert.equal(await fs.readFile(path.join(f.vault,'wiki/learning/concepts/connected-note.md'),'utf8'),original);
  assert.equal(index.resolve('connected-note').path,'wiki/learning/concepts/connected-note.md');
  await fs.writeFile(path.join(f.vault,'wiki','Alias Name.md'),'---\naliases: [Friendly title]\n---\n# A name with spaces');await index.refresh();
  assert.equal(index.resolve('Alias%20Name.md').path,'wiki/Alias Name.md');
  assert.equal(index.resolve('Friendly title').path,'wiki/Alias Name.md');
});

test('refresh picks up edits and removals, and keeps last-good content after a failed scan',async t=>{
  const f=await makeFixture();const index=new VaultIndex(f.vault);await index.initialize();t.after(async()=>{index.close();await f.cleanup();});
  await fs.writeFile(path.join(f.vault,'wiki','new.md'),'# New idea\nA distinct zebrafish thought.');await index.refresh();
  assert.equal(index.search({q:'zebrafish'}).files,1);
  await fs.unlink(path.join(f.vault,'wiki','new.md'));await index.refresh();assert.equal(index.search({q:'zebrafish'}).files,0);
  await fs.rename(f.vault,f.vault+'-moved');await assert.rejects(index.refresh());assert.equal(index.search({q:'memory'}).files,4);await fs.rename(f.vault+'-moved',f.vault);
});

test('HTTP contract enforces authentication, origins, CSRF, safe lookup and password rotation',async t=>{
  const f=await makeFixture();const app=await createServer({vaultPath:f.vault,statePath:f.state,publicOrigin:'https://reader.example.test',initialPassword:fixturePassword});
  t.after(async()=>{await app.close();await f.cleanup();});
  const request=(method,url,body,headers={})=>app.inject({method,url,payload:body,headers:{host:'reader.example.test',...(body?{origin:'https://reader.example.test','content-type':'application/json'}:{}),...headers}});
  assert.equal((await request('GET','/readyz')).statusCode,200);
  assert.equal((await request('GET','/api/search?q=memory')).statusCode,401);
  assert.equal((await request('GET','/api/session',undefined,{host:'wrong.example'})).statusCode,403);
  assert.equal((await request('POST','/api/login',{username:'owner',password:fixturePassword},{origin:'https://wrong.example'})).statusCode,403);
  const login=await request('POST','/api/login',{username:'owner',password:fixturePassword});assert.equal(login.statusCode,200);
  assert.match(login.headers['set-cookie'],/HttpOnly/);assert.match(login.headers['set-cookie'],/Secure/);assert.match(login.headers['set-cookie'],/SameSite=Strict/);
  const cookie=login.cookies[0].name+'='+login.cookies[0].value;const csrf=login.json().csrf;const headers={cookie,'x-memex-csrf':csrf};
  const results=await request('GET','/api/search?q=memory',undefined,headers);assert.equal(results.statusCode,200);assert.equal(results.json().matches,17);
  assert.equal((await request('GET','/api/search?q=x&limit=999',undefined,headers)).statusCode,400);
  assert.equal((await request('GET','/api/file?path=../../etc/passwd',undefined,headers)).statusCode,404);
  assert.equal((await request('GET','/api/asset?path=../owner.json',undefined,headers)).statusCode,404);
  assert.equal((await request('POST','/api/logout',{}, {cookie})).statusCode,403);
  const second=await request('POST','/api/login',{username:'owner',password:fixturePassword});
  assert.equal((await request('POST','/api/password',{currentPassword:fixturePassword,newPassword:'Changed-synthetic-passphrase'},headers)).statusCode,200);
  assert.equal((await request('GET','/api/stats',undefined,{cookie:second.cookies[0].name+'='+second.cookies[0].value})).statusCode,401);
  await assert.rejects(fs.access(path.join(f.state,'initial-login.txt')));
  assert.equal((await request('POST','/api/login',{username:'owner',password:fixturePassword})).statusCode,401);
  assert.equal((await request('POST','/api/login',{username:'owner',password:'Changed-synthetic-passphrase'})).statusCode,200);
  assert.equal((await request('POST','/api/logout',{},headers)).statusCode,200);
  assert.equal((await request('GET','/api/stats',undefined,headers)).statusCode,401);
});
