import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './app.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4311);
if(!process.env.VAULT_PATH||!process.env.STATE_PATH)throw new Error('Set VAULT_PATH and STATE_PATH to absolute paths outside the repository.');
if(!path.isAbsolute(process.env.VAULT_PATH)||!path.isAbsolute(process.env.STATE_PATH))throw new Error('Use absolute vault and state paths.');
const app=await createServer({vaultPath:process.env.VAULT_PATH,statePath:process.env.STATE_PATH,publicOrigin:process.env.PUBLIC_ORIGIN||`http://localhost:${port}`,clientDir:path.join(root,'dist/client')});
await app.listen({port,host:'127.0.0.1'});
console.log(`Memex reader listening on loopback port ${port}; ${app.vaultIndex.files.size} notes indexed. Credentials stay in private state.`);
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>app.close().then(()=>process.exit(0)));
