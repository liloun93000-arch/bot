// Assemble le moteur 3D (sans l'ancien moteur 2D) en un seul IIFE : window.AJIntro3
const fs=require('fs');
const ts=require('/home/claude/.npm-global/lib/node_modules/typescript');
const D=__dirname+'/';
const order=['config','clock','bubble','session','config3d','models.generated','can3d','model3d','character3d','stage3d','timeline3d','engine3d'];
let out='';
for(const m of order){
  let src=fs.readFileSync(D+m+'.ts','utf8');
  let js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;
  js=js.replace(/^import[\s\S]*?from\s+["'][^"']+";?\s*$/gm,'').replace(/^export \{[^}]*\};?\s*$/gm,'').replace(/^export (async function|function|class|const|let|var) /gm,'$1 ');
  out+='/* ── '+m+' ── */\n'+js+'\n';
}
const body='(function(){\nconst THREE=window.THREE;\n'+out+'\nwindow.AJIntro3={mountIntro3D,canRun3D,preload:preloadModels,Intro3DUnavailable};\n})();\n';
fs.writeFileSync(D+'app3d.js',body);
new Function(body);
console.log('app3d',(body.length/1024|0)+'KB');
