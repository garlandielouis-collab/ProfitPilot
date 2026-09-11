const fs=require('fs'),path=require('path');
const schema=JSON.parse(fs.readFileSync('pp_schema.json','utf8'));
const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
 if(['node_modules','.next','.git','.claude','.clone','tall','tmp'].includes(e.name))continue;
 const p=path.join(d,e.name);
 if(e.isDirectory())walk(p); else if(/\.tsx?$/.test(e.name))files.push(p);
}})('.');

const FILTERS=/\.(eq|neq|gt|gte|lt|lte|is|in|like|ilike|order)\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
const SELECT=/\.select\(\s*[`'"]([^`'"]*)[`'"]/g;
const out=[];
for(const f of files){
 const src=fs.readFileSync(f,'utf8');
 const re=/\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)/g;
 let m;
 while((m=re.exec(src))){
  const table=m[1], cols=schema[table];
  const start=m.index+m[0].length;
  const nxt=src.indexOf('.from(',start);
  const win=src.slice(start, nxt===-1?start+900:Math.min(nxt,start+900));
  const line=src.slice(0,m.index).split('\n').length;
  if(!cols){out.push([f,line,table,'TABLE INEXISTANTE']);continue;}
  const bad=new Set();
  let fm;FILTERS.lastIndex=0;
  while((fm=FILTERS.exec(win))) if(!cols.includes(fm[2])) bad.add('filtre:'+fm[2]);
  SELECT.lastIndex=0;
  const sm=SELECT.exec(win);
  if(sm){
   // on ignore les select() contenant une ressource imbriquée ou un alias
   const body=sm[1];
   if(!/[()]/.test(body)&&!body.includes(':')&&body.trim()!=='*'){
    for(const c of body.split(',').map(s=>s.trim()).filter(Boolean))
     if(!cols.includes(c)) bad.add('select:'+c);
   }
  }
  if(bad.size) out.push([f,line,table,[...bad].join(' ')]);
 }
}
out.forEach(r=>console.log(`${r[0]}:${r[1]}  ${r[2]}  ${r[3]}`));
console.log('\ntotal :',out.length);
