import asyncio,sys
from playwright.async_api import async_playwright
async def main(n,angs):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg=await b.new_page(viewport={"width":500,"height":700}); pg.on("console",lambda m:print('c:',m.text)); pg.on("pageerror",lambda e:print('E',e))
        for a in angs:
            await pg.goto(f'http://localhost:8765/view.html?n={n}&a={a}'); await pg.wait_for_function('window.done===true',timeout=60000)
            await pg.screenshot(path=f'v_{n}_{a}.png')
        await b.close()
asyncio.run(main(sys.argv[1],sys.argv[2:]))
