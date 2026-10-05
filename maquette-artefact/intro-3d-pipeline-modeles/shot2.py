import asyncio,sys,json,urllib.parse
from playwright.async_api import async_playwright
async def main(n,a,pose,out):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg=await b.new_page(viewport={"width":500,"height":700}); pg.on("pageerror",lambda e:print('E',e))
        await pg.goto(f'http://localhost:8765/view.html?n={n}&a={a}&pose={urllib.parse.quote(pose)}'); await pg.wait_for_function('window.done===true',timeout=60000)
        await pg.screenshot(path=out); await b.close()
asyncio.run(main(*sys.argv[1:5]))
