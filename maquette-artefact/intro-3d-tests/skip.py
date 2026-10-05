import asyncio
from playwright.async_api import async_playwright
D='/tmp/claude-0/-home-claude/f32c9d5d-51dc-59e6-9c7d-a5ae0e8f5c09/scratchpad/intro/'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg=await (await b.new_context(viewport={"width":390,"height":844})).new_page(); errs=[]
        pg.on("console",lambda m: errs.append(m.type+':'+m.text[:200]) if m.type in('error','warning') and 'TUNNEL' not in m.text else None)
        pg.on("pageerror",lambda e:errs.append('PE '+str(e)))
        await pg.add_init_script('window.__AJ_FORCE=1')
        await pg.goto('file://'+D+'dash8.html'); await pg.wait_for_timeout(2500)
        for rnd in (1,2):
            await pg.fill('#idf','a'); await pg.fill('#pw','b'); await pg.click('#loginForm button[type=submit]')
            await pg.wait_for_selector('.aj-intro:not(.aj-intro3d-pre)',timeout=60000)
            await pg.wait_for_timeout(4000)
            st=await pg.evaluate("document.querySelector('.aj-intro')?.dataset.state")
            await pg.screenshot(path=D+f'sk{rnd}_a.png')
            await pg.click('.aj-intro-skip'); await pg.wait_for_timeout(900)
            gone=await pg.evaluate("!document.querySelector('.aj-intro')")
            canv=await pg.evaluate("document.querySelectorAll('canvas').length")
            print('round',rnd,'state',st,'overlay gone',gone,'canvases',canv,'bubbles',await pg.evaluate("document.querySelectorAll('.aj-bub').length"))
            await pg.screenshot(path=D+f'sk{rnd}_b.png')
            # dashboard cliquable ?
            await pg.click('.burger'); await pg.wait_for_timeout(600)
            print(' drawer open',await pg.evaluate("document.getElementById('drawer').classList.contains('on')"))
            await pg.evaluate("location.hash='connexion'"); await pg.wait_for_timeout(800)
        print(errs)
        await b.close()
asyncio.run(main())
