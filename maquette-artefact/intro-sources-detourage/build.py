import numpy as np, json, io, base64
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
REF=600   # px d'une hauteur "sol -> sommet de la tete" pour les deux personnages
SEC={'w':['arr'],'t':['profg','q34g','back','q34d','profd'],'p':['p13','p14','p16','p17','p18']}
def sec(n): return 'w' if n in('w1','w2','w3','w4','arr') else ('t' if n in SEC['t'] else 'p')
def load(k,n):
    im=Image.open(f'cell_{k}_{n}.png').convert('RGBA'); a=np.asarray(im)[:,:,3]
    m=a>128
    m=ndi.binary_opening(m,structure=np.ones((3,3)),iterations=2)
    lab,c=ndi.label(m)
    if c>1:
        sz=ndi.sum(m,lab,range(1,c+1)); keep=lab==(1+int(np.argmax(sz)))
        for i,s in enumerate(sz,1):
            if s>0.08*sz.max(): keep|=lab==i
        m=keep
    if (k,n)==('J','q34g'): m[:,:int(m.shape[1]*0.13)]&=False
    m=ndi.binary_opening(m,structure=np.ones((1,13)))
    rgb0=np.asarray(im)[:,:,:3].astype(int); H0=m.shape[0]
    lum=(rgb0[:,:,0]*.3+rgb0[:,:,1]*.59+rgb0[:,:,2]*.11); smear=(rgb0[:,:,2]-rgb0[:,:,1]>40)&(lum<150)
    bandmask=np.zeros_like(m); bandmask[int(H0*.86):]=True
    m=m&~(smear&bandmask)
    m=ndi.binary_opening(m,structure=np.ones((3,3)),iterations=2)
    lab,c=ndi.label(m)
    if c>1:
        sz=ndi.sum(m,lab,range(1,c+1)); m=lab==(1+int(np.argmax(sz)))
    m=ndi.binary_dilation(m,iterations=1)
    al=np.where(m,np.asarray(im)[:,:,3],0).astype(np.uint8)
    # evite un liseré dur : adoucit la bordure
    al=np.asarray(Image.fromarray(al).filter(ImageFilter.GaussianBlur(0.6)))
    al=np.where(m|(al>40),al,0).astype(np.uint8)
    rgb=np.asarray(im)[:,:,:3]
    out=Image.fromarray(np.dstack([rgb,al]),'RGBA'); bb=out.getbbox(); out=out.crop(bb)
    return out
def stats(im):
    a=np.asarray(im)[:,:,3]>128; h,w=a.shape
    ys,xs=np.nonzero(a)
    top,bot=ys.min(),ys.max()+1
    rows=lambda f0,f1: a[int(f0*h):max(int(f0*h)+1,int(f1*h))]
    def mx(r):
        yy,xx=np.nonzero(r); return xx.mean() if len(xx) else w/2
    return dict(h=bot-top,torso=mx(rows(.08,.45)),feet=mx(rows(.93,1.0)))
def flip_text(im,boxes):
    f=im.transpose(Image.FLIP_LEFT_RIGHT); arr=np.asarray(f).copy(); H,W=arr.shape[:2]
    r,g,b,a=[arr[:,:,i].astype(int) for i in range(4)]
    pink=(r>190)&(b>110)&(g<150)&(a>200)&(r-g>90)
    for (y0,y1) in boxes:
        z=np.zeros_like(pink); z[int(y0*H):int(y1*H)]=pink[int(y0*H):int(y1*H)]
        z=ndi.binary_dilation(z,structure=np.ones((5,9)))
        lab,c=ndi.label(z)
        if not c: continue
        sz=ndi.sum(z,lab,range(1,c+1)); i=1+int(np.argmax(sz)); 
        ys,xs=np.nonzero(lab==i)
        X0,X1,Y0,Y1=max(0,xs.min()+3),min(W,xs.max()-3),max(0,ys.min()+2),min(H,ys.max()-2)
        print('  flip',(X0,X1,Y0,Y1))
        arr[Y0:Y1,X0:X1]=arr[Y0:Y1,X0:X1][:,::-1]
    return Image.fromarray(arr,'RGBA')
LIST={'J':{'w1':0,'w2':0,'w3':0,'w4':0,'arr':0,'q34g':0,'profd':0,'p11':0,'p12':0,'p13':0,'p14':0,'p17':0},
      'L':{'w1':1,'w2':1,'w3':1,'w4':1,'arr':0,'q34d':0,'p16':0,'p17':0}}
KEY={'J':'jacob','L':'lilou'}
meta={}; sprites={}
for k in 'JL':
    st={n:stats(load(k,n)) for n in set(list(LIST[k])+sum(SEC.values(),[]))}
    fac={s:REF/np.median([st[n]['h'] for n in SEC[s]]) for s in SEC}
    print(k,{s:round(fac[s],3) for s in fac},{n:st[n]['h'] for n in st})
    for n,mir in LIST[k].items():
        im=load(k,n); s=stats(im)
        if mir: im=flip_text(im,[(0.0,0.13),(0.27,0.5)]); s['torso']=im.width-s['torso']; s['feet']=im.width-s['feet']
        f=fac[sec(n)]*1.0
        nw,nh=round(im.width*f),round(im.height*f)
        # recadre : les ailes Lanczos
        big=im.resize((nw,nh),Image.LANCZOS)
        rgb=big.convert('RGB').filter(ImageFilter.UnsharpMask(1.0,45,2)); rgb.putalpha(big.getchannel('A'))
        # la base de pixel dont la hauteur "reelle" est s['h']*f ; le bas de l'image = sol
        buf=io.BytesIO(); rgb.save(buf,'WEBP',quality=74,method=6,alpha_quality=88); b=buf.getvalue()
        kind='walk' if n.startswith('w') else 'stand'
        anchor=s['torso'] if kind=='walk' else s['feet']
        sprites[f'{KEY[k]}.{n}']=dict(w=nw,h=nh,ax=round(anchor*f,1),tx=round(s['torso']*f,1),fx=round(s['feet']*f,1),src='data:image/webp;base64,'+base64.b64encode(b).decode())
        rgb.save(f'final_{KEY[k]}_{n}.png'); print(KEY[k],n,nw,nh,len(b)//1024,'KB')
ts='/** Généré par scripts de détourage des planches HD (marche, vues, poses). Ne pas éditer à la main.\n * Toutes les images sont normalisées : REF_PX pixels = hauteur sol → sommet de la tête, pour les DEUX personnages. */\nimport type { SpriteSet } from "./characters";\n\nexport const REF_PX = %d;\n\nexport const SPRITES: SpriteSet = {\n'%REF
for k,v in sprites.items():
    ts+=f'  "{k}": {{ w: {v["w"]}, h: {v["h"]}, ax: {v["ax"]}, tx: {v["tx"]}, fx: {v["fx"]}, src: "{v["src"]}" }},\n'
ts+='};\n'
open('sprites.generated.ts','w').write(ts); print(len(ts)//1024,'KB module')
