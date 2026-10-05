import numpy as np,json,sys
def export(name,extra=None):
    d=np.load(f'{name}_lo.npz'); pos,nor,uv,idx=d['pos'],d['nor'],d['uv'],d['idx']
    open(f'{name}_mesh.bin','wb').write(pos.astype('<f4').tobytes()+nor.astype('<f4').tobytes()+uv.astype('<f4').tobytes()+idx.astype('<u4').tobytes())
    json.dump(dict(n=len(pos),t=len(idx)),open(f'{name}_mesh.json','w'))
for n in ['jacob','lilou']: export(n)
