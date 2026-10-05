const fs=require('fs'),path=require('path');
const ts=require('/home/claude/.npm-global/lib/node_modules/typescript');
const D=__dirname+'/';
const order=['config','clock','layout','characters','puppet','bubble','session','timeline','engine','sprites.generated'];
let out='';
for(const m of order){
  let src=fs.readFileSync(D+m+'.ts','utf8');
  let js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;
  js=js.replace(/^import[\s\S]*?from\s+["'][^"']+";?\s*$/gm,'').replace(/^export \{[^}]*\};?\s*$/gm,'').replace(/^export (async function|function|class|const|let|var) /gm,'$1 ');
  out+='/* ── '+m+' ── */\n'+js+'\n';
}
fs.writeFileSync(D+'bundle.js','(function(){\n'+out+'\nwindow.AJIntro={mountIntro,SPRITES,resetIntroSession,hasSeenIntro,STATES,DIALOGUE,TIMING,computeLayout};\n})();\n');
console.log('bundle',(out.length/1024|0)+'KB');
