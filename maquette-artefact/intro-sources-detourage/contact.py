import sys
from PIL import Image, ImageDraw
names={'walk':['w1','w2','w3','w4','arr'],'turn':['profg','q34g','back','q34d','profd'],'pose':['p11','p12','p13','p14','p15','p16','p17','p18']}
for k in 'LJ':
    allc=[n for t in names for n in names[t]]
    W=sum(Image.open(f'cell_{k}_{n}.png').width+6 for n in allc[:10])
    sheet=Image.new('RGB',(1900,2*440),(90,140,90))
    x=0;y=0
    for i,n in enumerate(allc):
        im=Image.open(f'cell_{k}_{n}.png')
        if x+im.width>1900: x=0;y+=430
        sheet.paste(im,(x,y),im); ImageDraw.Draw(sheet).text((x+3,y+3),n,fill=(255,255,0)); x+=im.width+6
    sheet.save(f'contact_{k}.png')
