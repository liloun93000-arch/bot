import asyncio,sys,json
from playwright.async_api import async_playwright
D='/tmp/claude-0/-home-claude/f32c9d5d-51dc-59e6-9c7d-a5ae0e8f5c09/scratchpad/intro/'
W=int(sys.argv[1]) if len(sys.argv)>1 else 390
H=int(sys.argv[2]) if len(sys.argv)>2 else 844
STEP=int(sys.argv[3]) if len(sys.argv)>3 else 8
MAXN=int(sys.argv[4]) if len(sys.argv)>4 else 260
OUT=sys.argv[5] if len(sys.argv)>5 else 'fr4'
FILE=sys.argv[6] if len(sys.argv)>6 else 'dash8.html'
import os;os.makedirs(D+OUT,exist_ok=True)
for f in os.listdir(D+OUT): os.remove(D+OUT+'/'+f)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        ctx=await b.new_context(viewport={"width":W,"height":H},device_scale_factor=1)
        pg=await ctx.new_page(); errs=[]
        pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.on("console",lambda m: errs.append(m.type+':'+m.text[:300]) if m.type in('error','warning') else None)
        await pg.add_init_script('window.__AJ_FIXED=1/30;window.__AJ_K=30;window.__AJ_FORCE=1')
        await pg.goto('file://'+D+FILE)
        await pg.wait_for_timeout(1800)
        await pg.screenshot(path=D+OUT+'/login.png')
        await pg.fill('#idf','jacob'); await pg.fill('#pw','secret')
        await pg.wait_for_timeout(800)
        await pg.click('#loginForm button[type=submit]')
        await pg.wait_for_function("window.__ajIntroHandle",timeout=90000)
        rec=[];seen=False
        for n in range(MAXN):
            await pg.evaluate("new Promise(r=>{const t0=window.__ajIntroHandle.stats().t;window.__AJ_K=%d;const w=()=>{if(!document.querySelector('.aj-intro')||window.__ajIntroHandle.stats().t>=t0+%d/30-1e-6){requestAnimationFrame(()=>r())}else requestAnimationFrame(w)};requestAnimationFrame(w)})"%(STEP,STEP))
            st=await pg.evaluate("[document.querySelector('.aj-intro')?.dataset.state||'none',window.__ajIntroHandle.stats().t]")
            rec.append(st)
            print(n,st,flush=True)
            if st[0]!='none': seen=True
            if st[0]=='none' and seen: break
            await pg.screenshot(path=D+OUT+f'/{n:03d}.png')
        json.dump(rec,open(D+OUT+'/rec.json','w'))
        print('n',n,'ERR',errs[:8])
        print([(i,r[0],round(r[1],1)) for i,r in enumerate(rec) if i==0 or rec[i-1][0]!=r[0]])
        await pg.wait_for_timeout(200)
        await pg.screenshot(path=D+OUT+'/after.png')
        await b.close()
asyncio.run(main())
