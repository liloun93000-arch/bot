import numpy as np, sys
from PIL import Image
sys.path.insert(0,'/tmp/mat')
from mat import matte
U='/root/.claude/uploads/f32c9d5d-51dc-59e6-9c7d-a5ae0e8f5c09/'
S={'L':Image.open(U+'16c66058-image.jpg').convert('RGB'),'J':Image.open(U+'57f59ff1-image.jpg').convert('RGB')}
R={'walk':(10,40,878,430),'turn':(892,40,1526,430),'pose':(10,520,1526,940)}
for k,im in S.items():
    for t,b in R.items():
        c=im.crop(b)
        # matte in halves for resolution
        W=c.width
        parts=[]
        n=2 if W>700 else 1
        if t=='pose': n=3
        m=Image.new('L',c.size)
        step=W//n
        for i in range(n):
            x0=max(0,i*step-25); x1=min(W,(i+1)*step+25)
            mm=matte(c.crop((x0,0,x1,c.height)).resize(((x1-x0)*3,c.height*3),Image.LANCZOS)).resize((x1-x0,c.height),Image.LANCZOS)
            mm=np.asarray(mm).astype(float)
            cur=np.asarray(m).astype(float)
            cur[:,x0:x1]=np.maximum(cur[:,x0:x1],mm)
            m=Image.fromarray(cur.astype(np.uint8))
        m.save(f'm_{k}_{t}.png'); c.save(f'c_{k}_{t}.png')
        print(k,t,c.size)
