import asyncio,time
from playwright.async_api import async_playwright
D='/tmp/claude-0/-home-claude/f32c9d5d-51dc-59e6-9c7d-a5ae0e8f5c09/scratchpad/intro/'
JS="""()=>{const o=document.querySelector('.aj-intro');if(!o)return null;const O=o.getBoundingClientRect();
const b=document.querySelector('.aj-bub');const B=b&&b.style.visibility!=='hidden'?b.getBoundingClientRect():null;
const heads=[...document.querySelectorAll('.pp')].filter(p=>p.style.opacity==='1').map(p=>{const v=[...p.querySelectorAll('.pp-img')].find(x=>parseFloat(x.style.opacity)>0.5);if(!v)return null;const r=v.getBoundingClientRect();const cx=(r.left+r.right)/2,hw=r.width*0.3;return {l:cx-hw,r:cx+hw,t:r.top,b:r.top+r.height*0.33,fl:r.left,full:[r.left,r.right,r.top,r.bottom]}}).filter(Boolean);
return {O:[O.left,O.top,O.right,O.bottom],B:B&&[B.left,B.top,B.right,B.bottom],heads,state:o.dataset.state,sw:document.documentElement.scrollWidth}}"""
async def run(w):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        ctx=await b.new_context(viewport={"width":max(w,360)+40,"height":900},device_scale_factor=1)
        pg=await ctx.new_page(); errs=[]
        pg.on("pageerror",lambda e:errs.append(str(e)))
        await pg.goto('file://'+D+'demo.html')
        await pg.click(f'#widths button[data-w="{w}"]')
        bad=[];t0=time.time();seen=set();clipped=[]
        while time.time()-t0<40:
            r=await pg.evaluate(JS)
            if r is None:
                if seen: break
                await pg.wait_for_timeout(100);continue
            seen.add(r['state'])
            O=r['O']
            if r['B']:
                B=r['B']
                if B[0]<O[0]-0.5 or B[2]>O[2]+0.5 or B[1]<O[1]+40: bad.append((r['state'],'bubble hors écran',B,O))
                for h in r['heads']:
                    # chevauchement bulle / tête (tête = tiers haut de la vue)
                    if B[0]<h['r'] and B[2]>h['l'] and B[1]<h['b'] and B[3]-14>h['t']:
                        bad.append((r['state'],'bulle sur visage',[round(x) for x in B],[round(x) for x in (h['l'],h['t'],h['r'],h['b'])]))
            for h in r['heads']:
                f=h['full']
                if r['state'] in ('JACOB_FACE_USER','MESSAGE_1','MESSAGE_2','CALL_LILOU','JACOB_TALKS_TO_LILOU') and (f[0]<O[0]-1 or f[1]>O[2]+1): clipped.append((r['state'],[round(x) for x in f]))
            await pg.wait_for_timeout(90)
        print(w,'états',len(seen),'| problèmes',len(bad),bad[:3],'| coupés',clipped[:2],'| err',errs)
        await b.close()
async def main():
    await asyncio.gather(*[run(w) for w in [320,360,375,390,414,430]])
asyncio.run(main())
