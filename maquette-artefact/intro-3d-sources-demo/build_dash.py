"""Dashboard (maquette) + intro 3D jouée par-dessus après « Se connecter ».
Usage : python3 build_dash.py <dashboard-v7.html> <sortie.html>"""
import sys,re
src=open(sys.argv[1],encoding='utf-8').read()
D=__file__.rsplit('/',1)[0]+'/'
three=open(D+'three.iife.min.js',encoding='utf-8').read()
app=open(D+'app3d.js',encoding='utf-8').read()
css=open(D+'intro.css',encoding='utf-8').read()
assert '</script>' not in three.lower() and '</script>' not in app.lower()
old='if(id==="loginForm"){go("vue");return}'
assert old in src
src=src.replace(old,'if(id==="loginForm"){go("vue");if(window.__ajIntroStart)window.__ajIntroStart();return}')
old2='window.addEventListener("hashchange",route);\nroute();'
assert old2 in src
# Parcours demandé : on arrive sur la connexion (identifiants) → « Se connecter » → dashboard + intro par-dessus.
src=src.replace(old2,'window.addEventListener("hashchange",route);\nif(!location.hash){try{history.replaceState(null,"","#connexion")}catch(e){}}\nroute();')
loader='''<script>
/* ── Intro Jacob & Lilou (3D) : jouée PAR-DESSUS le dashboard après « Se connecter ».
   Le moteur est préchargé pendant la saisie des identifiants ; si l'appareil est trop faible, le dashboard s'ouvre directement. ── */
(function(){
  var p=null;
  function forced(){return !!window.__AJ_FORCE||/intro3d=1/.test(location.search+location.hash)}
  function inject(id){var s=document.createElement("script");s.textContent=document.getElementById(id).textContent;document.head.appendChild(s)}
  function load(){
    if(p)return p;
    p=new Promise(function(res){setTimeout(function(){
      try{if(!window.THREE)inject("aj3d-three");if(!window.AJIntro3)inject("aj3d-app")}catch(e){console.warn("intro3d",e)}
      res(!!window.AJIntro3&&(window.AJIntro3.canRun3D()||forced()))},0)});
    return p}
  window.__ajIntroPreload=function(){return load().then(function(ok){return ok?window.AJIntro3.preload():0}).catch(function(){})};
  window.__ajIntroStart=function(){
    load().then(function(ok){
      if(!ok)return;
      var A=window.AJIntro3;
      return A.mountIntro3D({mode:"fixed",remember:false,force:forced()}).then(function(h){window.__ajIntroHandle=h});
    }).catch(function(e){console.warn("intro3d indisponible → dashboard direct",e&&e.message)});
  };
  document.addEventListener("focusin",function(e){var t=e.target;if(t&&(t.id==="idf"||t.id==="pw"))window.__ajIntroPreload()});
  if(location.hash==="#connexion"||!location.hash)setTimeout(window.__ajIntroPreload,1200);
})();
</script>
<script type="text/plain" id="aj3d-three">'''+three+'''</script>
<script type="text/plain" id="aj3d-app">'''+app+'''</script>
'''
src=src.replace('</body>',loader+'</body>')
src=src.replace('</style>\n</head>','</style>\n<style id="aj3d-css">'+css+'</style>\n</head>',1)
assert 'aj3d-css' in src
open(sys.argv[2],'w',encoding='utf-8').write(src)
print('ok',len(src)//1024,'KB')
