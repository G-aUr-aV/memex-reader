export const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function termsFor(query = '') {
  return [...new Set([...query.matchAll(/"([^"]+)"|(\S+)/gu)].map(m=>(m[1]||m[2]).toLowerCase()))].slice(0,12);
}
export const patternFor = terms => terms.length ? new RegExp(`(${terms.map(escapeRegex).sort((a,b)=>b.length-a.length).join('|')})`,'giu') : null;
export const slug = value => value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/\s+/g,'-') || 'section';

export function markdownEnhancements() {
  return tree => {
    const ids = new Map();
    const textOf=node=>node.value||node.children?.map(textOf).join('')||'';
    const visit = node => {
      if(node.type==='heading') {
        const base=slug(textOf(node));const count=ids.get(base)||0;ids.set(base,count+1);
        node.data={...node.data,hProperties:{...node.data?.hProperties,id:base+(count?`-${count}`:'')}};
      }
      if(node.type==='blockquote'&&node.children?.[0]?.type==='paragraph') {
        const first=node.children[0].children?.[0];const match=first?.type==='text'&&/^\[!([\w-]+)\][+-]?\s*/.exec(first.value);
        if(match){node.data={hProperties:{'data-callout':match[1]}};first.value=first.value.slice(match[0].length);}
      }
      if(!node.children)return;
      node.children=node.children.flatMap(child=>{
        if(child.type!=='text'){visit(child);return [child];}
        const output=[];let start=0;
        for(const m of child.value.matchAll(/(!?)\[\[([^\]\n]+)\]\]/g)) {
          if(m.index>start)output.push({type:'text',value:child.value.slice(start,m.index)});
          const [target,...labels]=m[2].split('|');
          const label=labels.join('|')||target.split('#')[0]||target;
          output.push({type:'link',url:'/__wiki?target='+encodeURIComponent(target),children:[{type:'text',value:(m[1]?'Embedded: ':'')+label}]});
          start=m.index+m[0].length;
        }
        if(start<child.value.length)output.push({type:'text',value:child.value.slice(start)});
        return output.length?output:[child];
      });
    };
    visit(tree);
  };
}
export function highlightedMarkdown({terms=[],lineOffset=0}={}) {
  return tree=>{
    const regex=patternFor(terms);
    if(!regex)return;
    const visit=node=>{
      if(!node.children||['script','style','mark'].includes(node.tagName))return;
      node.children=node.children.flatMap(child=>{
        if(child.type!=='text'){visit(child);return [child];}
        const pieces=[];let cursor=0;
        for(const match of child.value.matchAll(regex)){
          if(match.index>cursor)pieces.push({type:'text',value:child.value.slice(cursor,match.index)});
          const line=(child.position?.start.line||1)+lineOffset+child.value.slice(0,match.index).split('\n').length-1;
          pieces.push({type:'element',tagName:'mark',properties:{'data-search-match':true,'data-source-line':line},children:[{type:'text',value:match[0]}]});
          cursor=match.index+match[0].length;
        }
        if(cursor<child.value.length)pieces.push({type:'text',value:child.value.slice(cursor)});
        return pieces.length?pieces:[child];
      });
    };visit(tree);
  };
}
