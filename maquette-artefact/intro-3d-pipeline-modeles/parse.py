import struct,json,numpy as np,io,sys
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
def load(f):
    d=open(f,'rb').read(); l=struct.unpack('<I',d[12:16])[0]; j=json.loads(d[20:20+l]); off=20+l
    bl=struct.unpack('<I',d[off:off+4])[0]; bin_=d[off+8:off+8+bl]
    def acc(i):
        a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]
        dt={5126:np.float32,5125:np.uint32,5123:np.uint16}[a['componentType']]; n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        o=bv.get('byteOffset',0)+a.get('byteOffset',0)
        return np.frombuffer(bin_,dt,a['count']*n,o).reshape(-1,n) if n>1 else np.frombuffer(bin_,dt,a['count'],o)
    p=j['meshes'][0]['primitives'][0]
    pos=acc(p['attributes']['POSITION']); nor=acc(p['attributes']['NORMAL']); uv=acc(p['attributes']['TEXCOORD_0']); idx=acc(p['indices']).reshape(-1,3)
    def img(i):
        bv=j['bufferViews'][j['images'][i]['bufferView']]; return Image.open(io.BytesIO(bin_[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]))
    mat=j['materials'][0]; print(json.dumps(mat)[:400]); print([ (t['source']) for t in j['textures']])
    return pos,nor,uv,idx,j,img
if __name__=='__main__':
    for f,n in [('Meshy_AI_Masked_Street_Kid_1005103813_texture.glb','jacob'),('Meshy_AI_Lilou_Streetstyle_Dol_1005104910_texture.glb','lilou')]:
        pos,nor,uv,idx,j,img=load(f); print(n,pos.shape,idx.shape,uv.min(0),uv.max(0))
        for i in range(3):
            im=img(i); print(' img',i,im.size,im.mode); im.convert('RGB').resize((512,512)).save(f'{n}_tex{i}.png')
