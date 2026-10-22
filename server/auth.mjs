import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive=promisify(scrypt);
const digest=(password,salt)=>derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
export class Auth {
  constructor(state) {this.state=state;this.sessions=new Map();}
  async initialize(initialPassword) {
    await fs.mkdir(this.state,{recursive:true,mode:0o700});
    const st=await fs.lstat(this.state);
    if(!st.isDirectory()||st.isSymbolicLink())throw new Error('Account state must be an ordinary directory.');
    this.file=path.join(this.state,'owner.json');
    try {
      const stat=await fs.lstat(this.file);if(stat.isSymbolicLink())throw new Error('Account state cannot be a symlink.');
      this.owner=JSON.parse(await fs.readFile(this.file,'utf8'));
      if(typeof this.owner.username!=='string'||!/^([a-f0-9]{48})$/.test(this.owner.salt)||!/^([a-f0-9]{128})$/.test(this.owner.hash))throw new Error('Invalid owner account.');
    } catch(error) {
      if(error.code!=='ENOENT')throw error;
      const password=initialPassword||randomBytes(24).toString('base64url');
      const salt=randomBytes(24).toString('hex');
      this.owner={username:'owner',salt,hash:(await digest(password,salt)).toString('hex')};
      const login=path.join(this.state,'initial-login.txt');
      await fs.writeFile(login,`Memex reader owner login\nUsername: owner\nPassword: ${password}\n\nChange the password in Account after signing in.\n`,{flag:'wx',mode:0o600});
      try {await fs.writeFile(this.file,JSON.stringify(this.owner)+'\n',{flag:'wx',mode:0o600});}
      catch(error){await fs.unlink(login).catch(()=>{});throw error;}
    }
  }
  async verify(username,password) {
    const actual=await digest(password,this.owner.salt);
    if(!timingSafeEqual(actual,Buffer.from(this.owner.hash,'hex'))||username!==this.owner.username)throw fail('Check your username and password.',401);
  }
  async login(username,password) {
    await this.verify(username,password);
    for(const [key,s] of this.sessions)if(s.expiresAt<Date.now())this.sessions.delete(key);
    if(this.sessions.size>=1000)this.sessions.delete(this.sessions.keys().next().value);
    const session={id:randomBytes(32).toString('hex'),csrf:randomBytes(32).toString('hex'),expiresAt:Date.now()+86400000};
    this.sessions.set(session.id,session);return session;
  }
  session(id) {const session=this.sessions.get(id);if(session&&session.expiresAt>Date.now())return session;this.sessions.delete(id);return null;}
  async changePassword(id,current,password) {
    await this.verify(this.owner.username,current);
    const salt=randomBytes(24).toString('hex');
    const owner={username:this.owner.username,salt,hash:(await digest(password,salt)).toString('hex')};
    const temp=this.file+'.'+randomBytes(8).toString('hex')+'.tmp';
    await fs.writeFile(temp,JSON.stringify(owner)+'\n',{flag:'wx',mode:0o600});await fs.rename(temp,this.file);this.owner=owner;
    for(const key of this.sessions.keys())if(key!==id)this.sessions.delete(key);
    await fs.unlink(path.join(this.state,'initial-login.txt')).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
}
