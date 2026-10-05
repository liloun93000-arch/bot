const fs=require('fs');const B='/home/claude/mrdoob/three.js/build/';
let core=fs.readFileSync(B+'three.core.js','utf8'), mod=fs.readFileSync(B+'three.module.js','utf8');
function proc(src){
  const ex=new Set(),exFrom=[];
  src=src.replace(/^export\s*\{([^}]*)\}\s*(from\s*['"][^'"]+['"])?\s*;?\s*$/gm,(m,list,from)=>{
    list.split(',').map(s=>s.trim()).filter(Boolean).forEach(s=>{const p=s.split(/\s+as\s+/);(from?exFrom:[...[]]).push&&0; if(from) exFrom.push(p.length>1?p:[p[0],p[0]]); else ex.add(p.length>1?p[1]+':'+p[0]:p[0]);});
    return '';});
  let imp='';
  src=src.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"];?\s*$/gm,(m,l)=>{imp+=l+',';return '';});
  src=src.replace(/^export\s+(const|let|var|function|class)\s/gm,(m,k)=>k+' ');
  return {src,ex:[...ex],exFrom,imp};
}
const c=proc(core), m=proc(mod);
const cnames=c.ex.map(s=>s.includes(':')?s.split(':')[0]:s);
let out='const __C=(function(){\n'+c.src+'\nreturn {'+c.ex.map(s=>s.includes(':')?s:s).join(',')+'};\n})();\n';
const impList=m.imp.split(',').map(s=>s.trim()).filter(Boolean).map(s=>{const p=s.split(/\s+as\s+/);return p.length>1?p[0]+':'+p[1]:p[0];});
out+='const __M=(function(){\nconst {'+impList.join(',')+'}=__C;\n'+m.src+'\nreturn {'+m.ex.join(',')+'};\n})();\n';
out='(function(){\n'+out+'window.THREE=Object.assign({},__C,__M);\n})();\n';
fs.writeFileSync(process.argv[2],out);console.log((out.length/1024|0)+'KB',m.exFrom.length);
