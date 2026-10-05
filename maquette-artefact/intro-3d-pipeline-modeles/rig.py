import numpy as np,json,sys
from scipy import sparse
from PIL import Image
def seg_dist(P,a,b):
    a=np.array(a,float);b=np.array(b,float);ab=b-a;t=np.clip(((P-a)@ab)/(ab@ab),0,1)
    return np.linalg.norm(P-(a+t[:,None]*ab),axis=1),t
def build(name,hair=False,T=None,raw=None):
    if raw is None:
        d=np.load(f'{name}_lo.npz'); P=d['pos'].astype(np.float64); uv=d['uv']; idx=d['idx']
    else:
        P,uv,idx=raw; P=P.astype(np.float32); d=None
    n=len(P)
    # bones: name,parent,head,tail(for weights),radius
    B=[]
    def add(nm,par,head,tail,r): B.append(dict(name=nm,parent=par,head=head,tail=tail,r=r))
    add('hips',None,(0,-0.30,0),(0,-0.18,0),0.20)
    add('spine','hips',(0,-0.18,0),(0,0.12,0),0.22)
    add('chest','spine',(0,0.12,0),(0,0.45,0),0.25)
    add('neck','chest',(0,0.45,0),(0,0.55,0),0.12)
    add('head','neck',(0,0.55,0),(0,0.90,0.0),0.26)
    for s,sx in (('A',1),('B',-1)):
        add('upperarm'+s,'chest',(sx*0.30,0.42,0),(sx*0.37,0.14,0),0.075)
        add('forearm'+s,'upperarm'+s,(sx*0.37,0.14,0),(sx*0.38,-0.10,0),0.07)
        add('hand'+s,'forearm'+s,(sx*0.38,-0.10,0),(sx*0.38,-0.27,0.02),0.06)
        add('thigh'+s,'hips',(sx*0.15,-0.30,0),(sx*0.16,-0.62,0),0.16)
        add('shin'+s,'thigh'+s,(sx*0.16,-0.62,0),(sx*0.17,-0.82,0),0.13)
        add('foot'+s,'shin'+s,(sx*0.17,-0.82,0),(sx*0.17,-0.93,0.17),0.12)
    if hair:
        add('hair1','head',(0,0.62,-0.12),(0,0.45,-0.22),0.2)
        add('hair2','hair1',(0,0.45,-0.22),(0,0.25,-0.27),0.2)
        add('hair3','hair2',(0,0.25,-0.27),(0,0.02,-0.22),0.2)
    if T:
        for b in B:
            for k in('head','tail'): b[k]=tuple(np.array(b[k])+np.array(T.get(b['name'],(0,0,0))))
    nb=len(B); S=np.zeros((n,nb))
    for i,b in enumerate(B):
        if b['name'].startswith('hair'): S[:,i]=9; continue
        dd,_=seg_dist(P,b['head'],b['tail']); S[:,i]=dd-b['r']
    # hair classification by colour
    tex=np.asarray(Image.open(f'{name}_base.jpg').convert('RGB')).astype(int); H,W=tex.shape[:2]
    px=np.clip((uv[:,0]*(W-1)).astype(int),0,W-1); py=np.clip((uv[:,1]*(H-1)).astype(int),0,H-1); col=tex[py,px]
    hairmask=np.zeros(n,bool)
    if hair:
        r,g,bl=col[:,0],col[:,1],col[:,2]
        colhair=(r>55)&(r-g>30)&~((r>190)&(bl>140))
        # coiffure : derrière / sur les côtés du buste, sous le haut de la tête
        hairmask=colhair&(P[:,1]<0.74)&(P[:,1]>0.0)&(np.abs(P[:,0])<0.36)&((P[:,2]<-0.03)|((np.abs(P[:,0])>0.1)&(P[:,2]<0.3)&(P[:,1]>0.25)))
        # le long du visage : seulement sous l'oreille
        hairmask&=~((P[:,1]>0.6)&(P[:,2]>0.0))
    W_=np.exp(-np.maximum(S-S.min(1,keepdims=True),0)/0.03).astype(np.float32)
    W_[hairmask,:]=0
    if hair:
        i1=[b['name'] for b in B].index('hair1')
        hy=np.clip((0.70-P[:,1])/0.62,0,1)   # 0 haut -> 1 bas
        h=np.zeros((n,3)); 
        x=hy*2.0
        h[:,0]=np.clip(1-np.abs(x-0.0),0,1); h[:,1]=np.clip(1-np.abs(x-1.0),0,1); h[:,2]=np.clip(x-1.0,0,1)
        hd=[b['name'] for b in B].index('head')
        # haut des cheveux : reste lié à la tête
        top=np.clip((P[:,1]-0.55)/0.12,0,1)
        for k in range(3): W_[hairmask,i1+k]=(h[hairmask,k]*(1-top[hairmask]))
        W_[hairmask,hd]=top[hairmask]+ (1-top[hairmask])*np.clip(1-x[hairmask],0,1)*0.0
        W_[hairmask]/= W_[hairmask].sum(1,keepdims=True)+1e-9
    W_/=W_.sum(1,keepdims=True)+1e-9
    names=[b['name'] for b in B]
    r_,g_,b_=col[:,0],col[:,1],col[:,2]
    skin=(r_>140)&(r_>g_*1.15)&(g_>b_*1.1)&(g_>70)&(r_<255)
    armskin=skin&(np.abs(P[:,0])>0.27)&(P[:,1]<0.12)&(P[:,1]>-0.40)
    allow=np.zeros((n,len(B)),np.float32)
    for sd in 'AB':
        sel=armskin&((P[:,0]>0)==(sd=='A'))
        for nm in ('forearm','hand'): allow[sel,names.index(nm+sd)]=1
    # lissage sur le maillage
    a=np.concatenate([idx[:,0],idx[:,1],idx[:,2],idx[:,1],idx[:,2],idx[:,0]]);b2=np.concatenate([idx[:,1],idx[:,2],idx[:,0],idx[:,0],idx[:,1],idx[:,2]])
    A=sparse.coo_matrix((np.ones(len(a)),(a,b2)),shape=(n,n)).tocsr(); A.data[:]=1; A=sparse.diags(1/np.asarray(A.sum(1)).ravel())@A
    for _ in range(4):
        W_=0.5*W_+0.5*(A@W_)
        W_[armskin]*=allow[armskin]; W_/=W_.sum(1,keepdims=True)+1e-9
    dm=W_.argmax(1); ix={nm:i for i,nm in enumerate(names)}
    for sd in 'AB':
        arm=[ix['upperarm'+sd],ix['forearm'+sd],ix['hand'+sd]]; low=[ix['forearm'+sd],ix['hand'+sd]]
        inlow=np.isin(dm,low); keepm=np.zeros(len(B),np.float32); keepm[arm]=1
        W_[inlow]*=keepm
        rest=~np.isin(dm,arm); W_[np.ix_(rest,low)]=0
    W_/=W_.sum(1,keepdims=True)+1e-9
    if raw is not None: return B,W_
    order=np.argsort(-W_,1)[:,:4]; w4=np.take_along_axis(W_,order,1); w4/=w4.sum(1,keepdims=True)
    return B,order.astype(np.uint8),w4.astype(np.float32),d
def save(name,B,ji,jw,d):
    pos,nor,uv,idx=d['pos'],d['nor'],d['uv'],d['idx']; n=len(pos)
    open(f'{name}_mesh.bin','wb').write(pos.astype('<f4').tobytes()+nor.astype('<f4').tobytes()+uv.astype('<f4').tobytes()+idx.astype('<u4').tobytes()+ji.astype('u1').tobytes()+jw.astype('<f4').tobytes())
    json.dump(dict(n=n,t=len(idx),bones=[dict(name=b['name'],parent=b['parent'],pos=[float(x) for x in b['head']]) for b in B]),open(f'{name}_mesh.json','w'))
if __name__=='__main__':
    for nm,h in (('jacob',False),('lilou',True)):
        B,ji,jw,d=build(nm,h); save(nm,B,ji,jw,d); print(nm,len(B),'bones')
