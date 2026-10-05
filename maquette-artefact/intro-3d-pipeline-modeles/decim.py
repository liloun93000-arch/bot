import numpy as np,sys,time
from scipy import sparse
from scipy.sparse.csgraph import connected_components
from parse import load
import rig
from PIL import Image
def run(f,name,N,tex=1024):
    t=time.time(); pos,nor,uv,idx,j,img=load(f)
    nv=len(pos)
    hair=(name=='lilou')
    img(0).convert('RGB').resize((tex,tex),Image.LANCZOS).save(f'{name}_base.jpg',quality=88)
    B,Wf=rig.build(name,hair,raw=(pos,uv,idx)); print('weights',Wf.shape,time.time()-t)
    dom=Wf.argmax(1).astype(np.int64)
    nm=[b['name'] for b in B]; lowa=np.isin(dom,[i for i,x in enumerate(nm) if x.startswith('forearm') or x.startswith('hand')])
    keep=(lowa[idx[:,0]]==lowa[idx[:,1]])&(lowa[idx[:,1]]==lowa[idx[:,2]]); print('cut faces',(~keep).sum()); idx=idx[keep]
    # charts
    a=np.concatenate([idx[:,0],idx[:,0],idx[:,1]]);b=np.concatenate([idx[:,1],idx[:,2],idx[:,2]])
    g=sparse.coo_matrix((np.ones(len(a)),(a,b)),shape=(nv,nv))
    nc,chart=connected_components(g,directed=False)
    print(name,'charts',nc,time.time()-t)
    mn,mx=pos.min(0),pos.max(0); h=mx[1]-mn[1]; cs=h/N
    cell=np.floor((pos-mn)/cs).astype(np.int64)
    dims=(cell.max(0)+1)
    ckey=((cell[:,0]*dims[1]+cell[:,1])*dims[2]+cell[:,2])*len(B)+dom
    # cluster id by cell (positions) and by (cell,chart) (uv)
    ucell,cinv=np.unique(ckey,return_inverse=True)
    pair=cinv.astype(np.int64)*nc+chart
    upair,pinv=np.unique(pair,return_inverse=True)
    cnt=np.bincount(cinv,minlength=len(ucell)).astype(np.float64)
    P=np.stack([np.bincount(cinv,pos[:,k],len(ucell)) for k in range(3)],1)/cnt[:,None]
    Nn=np.stack([np.bincount(cinv,nor[:,k],len(ucell)) for k in range(3)],1); Nn/=np.linalg.norm(Nn,axis=1,keepdims=True)+1e-9
    pc=np.bincount(pinv,minlength=len(upair)).astype(np.float64)
    UV=np.stack([np.bincount(pinv,uv[:,k],len(upair)) for k in range(2)],1)/pc[:,None]
    Wc=np.stack([np.bincount(pinv,Wf[:,k],len(upair)) for k in range(Wf.shape[1])],1)/pc[:,None]
    cell_of_pair=(upair//nc).astype(np.int64)
    # faces -> pair verts
    f=pinv[idx]
    ok=(cell_of_pair[f[:,0]]!=cell_of_pair[f[:,1]])&(cell_of_pair[f[:,1]]!=cell_of_pair[f[:,2]])&(cell_of_pair[f[:,0]]!=cell_of_pair[f[:,2]])
    f=f[ok]
    # dedupe faces
    s=np.sort(f,1); _,u=np.unique(s,axis=0,return_index=True); f=f[np.sort(u)]
    # drop unused
    used=np.unique(f); remap=-np.ones(len(upair),np.int64); remap[used]=np.arange(len(used)); f=remap[f]
    V=P[cell_of_pair[used]].astype(np.float32); NN=Nn[cell_of_pair[used]].astype(np.float32); UVo=UV[used].astype(np.float32)
    print(name,'N',N,'verts',len(V),'tris',len(f),time.time()-t)
    Wu=Wc[used]; order=np.argsort(-Wu,1)[:,:4]; w4=np.take_along_axis(Wu,order,1); w4=w4/w4.sum(1,keepdims=True)
    np.savez(f'{name}_lo.npz',pos=V,nor=NN,uv=UVo,idx=f.astype(np.uint32),ji=order.astype(np.uint8),jw=w4.astype(np.float32))
    import rig as R; R.save(name,B,order.astype(np.uint8),w4.astype(np.float32),dict(pos=V,nor=NN,uv=UVo,idx=f.astype(np.uint32)))
if __name__=='__main__':
    run(sys.argv[1],sys.argv[2],int(sys.argv[3]))
