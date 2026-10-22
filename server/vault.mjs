import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const ROOTS = new Set(['wiki', 'notes', 'raw', 'inbox', 'journal', 'outputs']);
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
export const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function termsFor(query = '') {
  if (query.length > 160) throw Object.assign(new Error('Use a search of 160 characters or fewer.'), {statusCode:400});
  return [...new Set([...query.matchAll(/"([^"]+)"|(\S+)/gu)].map(m => (m[1] || m[2]).toLowerCase()))].slice(0, 12);
}
export const patternFor = terms => terms.length ? new RegExp(terms.map(escapeRegex).sort((a,b)=>b.length-a.length).join('|'), 'giu') : null;
export function plain(text) {
  return text.replace(/!?(\[\[)([^\]\n]+)\]\]/g, (_, _bracket, value) => value.split('|').at(-1).split('#')[0])
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^\s*(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/g, '')
    .replace(/\[![\w-]+\]/g, '').replace(/[`*~]/g, '').trim();
}
const string = value => typeof value === 'string' ? value : '';
const date = value => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
export function headingsFor(body) {
  let fenced = false;
  const counts = new Map();
  return body.split('\n').flatMap(line => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const m = !fenced && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) return [];
    const title = plain(m[2]);
    const base = slug(title);
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    return [{level:m[1].length, title, id:base + (count ? `-${count}` : '')}];
  });
}
export const slug = value => value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g,'-') || 'section';

export class VaultIndex {
  constructor(root) { this.root = path.resolve(root); this.files = new Map(); this.assets = new Map(); this.indexedAt = null; this.refreshing = null; }
  async initialize() {
    const st = await fs.lstat(this.root);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Vault must be an ordinary directory.');
    await this.refresh();
    this.timer = setInterval(() => this.refresh().catch(() => { this.refreshError = true; }), 5000);
    this.timer.unref();
  }
  close() { clearInterval(this.timer); }
  refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.scan().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async scan() {
    const next = new Map(); const assets = new Map();
    const walk = async relative => {
      const entries = await fs.readdir(path.join(this.root, relative), {withFileTypes:true});
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        if (!relative && entry.name !== 'Home.md' && !ROOTS.has(entry.name)) continue;
        if (entry.isDirectory()) { await walk(rel); continue; }
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext !== '.md' && !IMAGES.has(ext)) continue;
        const st = await fs.lstat(path.join(this.root, rel));
        if (!st.isFile() || st.isSymbolicLink() || st.size > (ext === '.md' ? 2 : 10) * 1024 * 1024) continue;
        if (IMAGES.has(ext)) { assets.set(rel, {size:st.size, ext}); continue; }
        const previous = this.files.get(rel);
        if (previous && previous.mtime === st.mtimeMs && previous.size === st.size) { next.set(rel, previous); continue; }
        const handle = await fs.open(path.join(this.root, rel), constants.O_RDONLY | constants.O_NOFOLLOW);
        let raw;
        try { raw = await handle.readFile('utf8'); } finally { await handle.close(); }
        let parsed;
        // Only plain YAML frontmatter is supported. Gray-matter also ships a
        // JavaScript engine; never let a file select or execute that engine.
        try { parsed = /^---\r?\n/.test(raw) ? matter(raw) : {data:{},content:raw}; } catch { parsed = {data:{},content:raw}; }
        const body = parsed.content;
        const metadata = parsed.data || {};
        const title = string(metadata.title) || /^#\s+(.+)$/m.exec(body)?.[1] || path.basename(rel, '.md');
        const area = ['engineering','learning','personal'].find(d => rel.split('/').includes(d)) || (['engineering','learning','personal'].includes(metadata.domain) ? metadata.domain : 'other');
        const lineOffset = raw.slice(0, raw.length-body.length).split('\n').length-1;
        const lines = body.split('\n').map((text, index) => ({line: index + lineOffset + 1, text:plain(text),titleLine:/^#\s/.test(text)})).filter(x => x.text && !/^(```|~~~|---)/.test(x.text));
        const aliases = Array.isArray(metadata.aliases) ? metadata.aliases.filter(x=>typeof x==='string') : string(metadata.aliases) ? [metadata.aliases] : [];
        const links = [...body.matchAll(/!?\[\[([^\]\n]+)\]\]/g)].map(m=>m[1].split('|')[0]);
        next.set(rel, {path:rel,title:plain(title).slice(0,300),area,type:string(metadata.type)||'note',updated:date(metadata.updated)||date(st.mtimeMs),summary:string(metadata.summary),status:string(metadata.status),confidence:string(metadata.confidence),aliases,body,bodyLineOffset:lineOffset,lines,links,mtime:st.mtimeMs,size:st.size,headings:headingsFor(body)});
      }
    };
    await walk('');
    this.files = next; this.assets = assets; this.indexedAt = new Date().toISOString(); this.refreshError = false;
  }
  meta(file) {
    const {path,title,area,type,updated,summary,status,confidence} = file;
    return {path,title,area,type,updated,summary,status,confidence};
  }
  search({q='', area='all', sort='relevance', offset=0, limit=30}={}) {
    const terms = termsFor(q.trim());
    const pattern = patternFor(terms);
    let totalMatches = 0;
    const results = [];
    for (const file of this.files.values()) {
      if (area !== 'all' && file.area !== area) continue;
      const text = [file.title, ...file.aliases, ...file.lines.map(x=>x.text)].join('\n').toLowerCase();
      if (!terms.every(t=>text.includes(t))) continue;
      const snippets = []; let matches = 0; let matchedLines = 0;
      if (pattern) {
        for (const item of file.lines) {
          const hits = [...item.text.matchAll(pattern)];
          if (!hits.length) continue;
          matches += hits.length;
          if(item.titleLine)continue;
          matchedLines++;
          if (snippets.length < 24) {
            let start = item.text.length <= 220 ? 0 : Math.max(0, hits[0].index-70);
            if(start>0)while(start<hits[0].index && !/\s/.test(item.text[start-1]))start++;
            const end = Math.min(item.text.length, Math.max(start+220, hits[0].index+hits[0][0].length));
            snippets.push({line:item.line,text:(start?'…':'')+item.text.slice(start,end)+(end<item.text.length?'…':'')});
          }
        }
        // Titles can come from filenames/frontmatter rather than a body heading.
        if (!matches) matches = [...file.title.matchAll(pattern)].length || [...file.aliases.join(' ').matchAll(pattern)].length;
      }
      totalMatches += matches;
      const titleScore = terms.reduce((sum,t)=>sum+(file.title.toLowerCase().includes(t)?40:0)+(file.aliases.some(a=>a.toLowerCase().includes(t))?20:0),0);
      results.push({...this.meta(file),matches,matchedLines,snippets,score:titleScore+Math.min(matches,25)});
    }
    results.sort((a,b)=> sort === 'title' ? a.title.localeCompare(b.title) : sort === 'updated' || !terms.length ? b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title) : b.score-a.score || b.updated.localeCompare(a.updated));
    return {files:results.length,total:results.length,matches:totalMatches,offset,limit,query:q.trim(),terms,indexedAt:this.indexedAt,results:results.slice(offset,offset+limit).map(({score,...file})=>file)};
  }
  resolve(target, from='') {
    let raw = target.split('|')[0];
    try { raw=decodeURIComponent(raw); } catch { /* retain malformed literal names */ }
    const hash = raw.indexOf('#');
    let name = (hash < 0 ? raw : raw.slice(0,hash)).replace(/\.md$/i,'');
    const heading = hash < 0 ? '' : raw.slice(hash+1);
    if (!name && this.files.has(from)) return {path:from,heading};
    const lower = name.toLowerCase();
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(from), name+'.md'));
    for (const candidate of [name+'.md',relative]) if (this.files.has(candidate)) return {path:candidate,heading};
    const candidates = [...this.files.values()].filter(f=>[f.path.replace(/\.md$/i,''),path.posix.basename(f.path,'.md'),f.title,...f.aliases].some(x=>x.toLowerCase()===lower));
    if (candidates.length === 1) return {path:candidates[0].path,heading};
    if (candidates.length > 1) throw Object.assign(new Error('Several notes have this name. Choose a note below.'),{statusCode:409,choices:candidates.map(f=>this.meta(f))});
    throw Object.assign(new Error('This linked note is not available in the reader.'),{statusCode:404});
  }
  document(relative, q='') {
    const file = this.files.get(relative);
    if (!file) throw Object.assign(new Error('This note is not available. It may have moved.'),{statusCode:404});
    const backlinks=[]; const outgoing=[];
    for (const other of this.files.values()) if (other.path !== relative && other.links.some(target=>{try{return this.resolve(target,other.path).path===relative;}catch{return false;}})) backlinks.push(this.meta(other));
    for (const target of new Set(file.links)) {try{const resolved=this.resolve(target,relative);if(resolved.path!==relative)outgoing.push({...this.meta(this.files.get(resolved.path)),heading:resolved.heading});}catch{/* unresolved links remain visible in the note */}}
    return {file:this.meta(file),body:file.body,bodyLineOffset:file.bodyLineOffset,backlinks,outgoing:outgoing.filter((f,i,all)=>all.findIndex(x=>x.path===f.path)===i),headings:file.headings,terms:termsFor(q)};
  }
  stats() { return {files:this.files.size,areas:Object.fromEntries(['engineering','learning','personal','other'].map(area=>[area,[...this.files.values()].filter(f=>f.area===area).length])),indexedAt:this.indexedAt}; }
  async asset(relative) {
    const entry=this.assets.get(relative);
    if (!entry) throw Object.assign(new Error('Image not available.'),{statusCode:404});
    const handle=await fs.open(path.join(this.root,relative),constants.O_RDONLY|constants.O_NOFOLLOW);
    try {return {data:await handle.readFile(),type:({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'})[entry.ext]};} finally {await handle.close();}
  }
}
