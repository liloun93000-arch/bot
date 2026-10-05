import numpy as np, json
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
from cleanmod import clean
CUTS={'walk':[198,365,520,690],'turn':[128,256,383,508],'pose':[198,395,585,775,955,1130,1325]}
NAMES={'walk':['w1','w2','w3','w4','arr'],'turn':['profg','q34g','back','q34d','profd'],'pose':['p11','p12','p13','p14','p15','p16','p17','p18']}
R={'walk':(10,40,878,430),'turn':(892,40,1526,430),'pose':(10,520,1526,940)}
U='/root/.claude/uploads/f32c9d5d-51dc-59e6-9c7d-a5ae0e8f5c09/'
F={'L':'16c66058-image.jpg','J':'57f59ff1-image.jpg'}
out={}
for k in 'LJ':
    big=Image.open(U+F[k]).convert('RGB')
    for t in CUTS:
        c=Image.open(f'c_{k}_{t}.png'); m=np.asarray(Image.open(f'm_{k}_{t}.png')).astype(float)
        W=c.width; xs=[0]
        for e in CUTS[t]:
            w=m[:,max(0,e-35):e+35].sum(0); xs.append(max(0,e-35)+int(np.argmin(w)))
        xs.append(W)
        for i,nm in enumerate(NAMES[t]):
            x0,x1=xs[i],xs[i+1]
            ca=clean(np.asarray(Image.fromarray(m[:,x0:x1].astype(np.uint8))))
            # ne garder que le plus gros bloc connecté + ses voisins
            bb=Image.fromarray(ca).getbbox()
            if not bb: print('EMPTY',k,nm); continue
            cr=c.crop((x0,0,x1,c.height)).crop(bb); al=Image.fromarray(ca).crop(bb)
            im=cr.convert('RGBA'); im.putalpha(al)
            im.save(f'cell_{k}_{nm}.png'); out[f'{k}_{nm}']=[x0,x1,bb]
            print(k,nm,(x0,x1),bb,im.size)
json.dump(out,open('cells.json','w'))
