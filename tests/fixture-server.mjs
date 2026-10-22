import path from 'node:path';
import {createServer} from '../server/app.mjs';
import {makeFixture,fixturePassword} from './fixtures.mjs';
const fixture=await makeFixture();
const app=await createServer({vaultPath:fixture.vault,statePath:fixture.state,publicOrigin:'http://localhost:4312',clientDir:path.resolve('dist/client'),initialPassword:fixturePassword});
await app.listen({host:'127.0.0.1',port:4312});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>app.close().then(fixture.cleanup).then(()=>process.exit(0)));
