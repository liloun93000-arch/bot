import numpy as np,json,zlib,base64,io
from PIL import Image
OUT={}
YS=0.952
for nm in ['jacob','lilou']:
    d=np.load(f'{nm}_lo.npz'); meta=json.load(open(f'{nm}_mesh.json'))
    pos=d['pos'].copy(); pos[:,1]+=YS
    n=len(pos); assert n<65535
    q=np.round(pos*16384).astype('<i2')
    nor=np.round(d['nor']*127).astype('i1')
    uv=np.clip(np.round(d['uv']*65535),0,65535).astype('<u2')
    ji=d['ji'].astype('u1'); jw=np.round(d['jw']*255).astype('u1')
    idx=d['idx'].astype('<u2')
    raw=q.tobytes()+nor.tobytes()+uv.tobytes()+ji.tobytes()+jw.tobytes()+idx.tobytes()
    z=zlib.compress(raw,9)
    bones=[dict(n=b['name'],p=b['parent'],x=round(b['pos'][0],4),y=round(b['pos'][1]+YS,4),z=round(b['pos'][2],4)) for b in meta['bones']]
    im=Image.open(f'{nm}_base.jpg').convert('RGB'); buf=io.BytesIO(); im.save(buf,'WEBP',quality=82,method=6); 
    print(nm,n,len(idx),'raw',len(raw)//1024,'KB z',len(z)//1024,'KB tex',len(buf.getvalue())//1024,'KB')
    OUT[nm]=dict(n=n,t=len(idx),bones=bones,mesh=base64.b64encode(z).decode(),tex='data:image/webp;base64,'+base64.b64encode(buf.getvalue()).decode())
ts='/** Généré par scripts/pack.py à partir des modèles 3D (Meshy) allégés et rigués. Ne pas éditer. */\nexport interface PackedModel { n: number; t: number; bones: { n: string; p: string | null; x: number; y: number; z: number }[]; mesh: string; tex: string }\nexport const MODELS: Record<"jacob" | "lilou", PackedModel> = '+json.dumps(OUT)+';\n'
open('models.generated.ts','w').write(ts); print(len(ts)//1024,'KB')
