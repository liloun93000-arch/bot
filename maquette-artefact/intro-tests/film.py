import asyncio,sys,time,json
from playwright.async_api import async_playwright
D='/tmp/claude-0/-home-claude/f32c9d5d-51dc-59e6-9c7d-a5ae0e8f5c09/scratchpad/intro/'
W=int(sys.argv[1]) if len(sys.argv)>1 else 390
JS="""()=>{const o=document.querySelector('.aj-intro');if(!o)return null;const O=o.getBoundingClientRect();
const out={st:o.dataset.state,O:[O.left,O.top,O.right,O.bottom],p:[]};
for(const pp of document.querySelectorAll('.pp')){if(pp.style.opacity!=='1')continue;
 const im=[...pp.querySelectorAll('.pp-img')].filter(i=>parseFloat(i.style.opacity)>0.5)[0];if(!im)continue;
 const r=im.getBoundingClientRect();const fl=getComputedStyle(document.querySelector('.aj-intro-floor')).top;
 out.p.push({w:r.width,h:r.height,l:r.left,r:r.right,t:r.top,b:r.bottom,src:[...pp.querySelectorAll('.pp-img')].indexOf(im)});}
const b=document.querySelector('.aj-bub');out.B=b&&b.style.visibility!=='hidden'?[...Object.values(b.getBoundingClientRect().toJSON())]:null;return out}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        ctx=await b.new_context(viewport={"width":max(W,360)+40,"height":900},device_scale_factor=1)
        pg=await ctx.new_page(); errs=[]
        pg.on("pageerror",lambda e:errs.append(str(e)))
        await pg.goto('file://'+D+'demo.html')
        await pg.click(f'#widths button[data-w="{W}"]') if W!=390 else None
        rec=[];t0=time.time();seen=False;n=0
        loc=pg.locator('#phone')
        while time.time()-t0<45:
            r=await pg.evaluate(JS)
            if r is None:
                if seen: break
                await pg.wait_for_timeout(50);continue
            seen=True
            r['t']=round(time.time()-t0,3); rec.append(r)
            await loc.screenshot(path=D+f'fr/{n:04d}.png',type='png'); r['n']=n; n+=1
        json.dump(rec,open(D+f'fr/rec_{W}.json','w'))
        print('frames',n,'err',errs)
        await b.close()
asyncio.run(main())
