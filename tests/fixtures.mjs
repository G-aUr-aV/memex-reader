import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const fixturePassword='Synthetic-reader-passphrase-2026';
export async function makeFixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'memex-reader-test-'));
  const vault=path.join(root,'vault');const state=path.join(root,'state');
  await fs.mkdir(vault);
  const add=async(relative,title,domain,type,updated,entries)=>{
    const lines=Array(85).fill('');
    ['---',`title: "${title}"`,`domain: ${domain}`,`type: ${type}`,`updated: ${updated}`,'---',`# ${title}`].forEach((line,i)=>lines[i]=line);
    for(const [line,value]of Object.entries(entries))lines[Number(line)-1]=value;
    const target=path.join(vault,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,lines.join('\n'));
  };
  await add('wiki/learning/concepts/connected-note.md','How memory becomes knowledge','learning','concept','2026-10-18',{
    11:'> [!summary] A useful idea stays connected.',
    14:'Memory gives us the material; connections turn it into knowledge.',
    22:'## A useful note is connected',
    37:'Returning to a note strengthens memory and reveals new connections.',
    46:'## Keep the source close',
    50:'Write a small explanation so that memory stays useful.',
    60:'A short reference can make memory more durable.',
    70:'Connect memory to a source you can revisit.',
    79:'See [[reading-workflow|A practical reading workflow]].',
    82:'<img src="missing" onerror="globalThis.__reader_unsafe=true">',
    83:'<script>globalThis.__reader_unsafe=true</script>',
  });
  await add('wiki/engineering/concepts/lasting-note.md','Designing a lasting memory','engineering','concept','2026-10-12',{
    8:'Local-first files give you durable memory that is not tied to a single app.',
    20:'## Keep files portable',
    26:'Notes stay in Markdown. See [[connected-note|The connected note]].',
    62:'A well-connected set of notes forms a memory that grows more valuable over time.',
    70:'Use a small index to bring memory into view.',
    80:'Keep memory close to its original sources.',
    84:'Configure `PUBLIC_ORIGIN` before enabling a proxy. Literal code tokens like a+b remain searchable.',
  });
  await add('wiki/learning/methods/reading-workflow.md','A practical reading workflow','learning','method','2026-09-28',{
    12:'Reading is a conversation with your future self, and memory makes it durable.',
    26:'## Read, reflect, connect',
    32:'Capture a clear idea and follow [[connected-note|the connected note]].',
    49:'Capture what stands out, then link it to related ideas to strengthen memory.',
    60:'A reading session is useful when memory gains a new connection.',
    70:'Return to memory after a little time has passed.',
  });
  await add('wiki/personal/reflections/connected-ideas.md','The value of a connected note','personal','reflection','2026-10-04',{
    7:'A single note is useful, but a network of notes helps memory reach further.',
    28:'Over time, these connections form a memory that supports deeper understanding.',
  });
  return {root,vault,state,cleanup:()=>fs.rm(root,{recursive:true,force:true})};
}
