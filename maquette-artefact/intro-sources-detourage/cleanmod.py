import numpy as np
from scipy import ndimage as ndi
def clean(a, lo=0.18, hi=0.62, fill=True):
    a=a.astype(np.float32)/255
    s=np.clip((a-lo)/(hi-lo),0,1); s=s*s*(3-2*s)
    m=s>0.5
    lab,n=ndi.label(m)
    if n>1:
        sizes=ndi.sum(m,lab,range(1,n+1)); keep=1+int(np.argmax(sizes))
        m2=lab==keep
        # garde aussi les gros morceaux voisins (>6 % du principal)
        for i,sz in enumerate(sizes,1):
            if sz>0.06*sizes.max(): m2|=lab==i
        m=m2
    if fill:
        f=ndi.binary_fill_holes(m)
        s=np.where(f&(s<1), np.maximum(s,0.0), s)
        # intérieur plein (évite les trous semi-transparents sur le noir)
        er=ndi.binary_erosion(f,iterations=3)
        s=np.where(er,1.0,s)
    s=np.where(ndi.binary_dilation(m,iterations=2),s,0)
    return (s*255).astype(np.uint8)
