import numpy as np, onnxruntime as ort, sys
from PIL import Image
sess=ort.InferenceSession('/tmp/mat/isnet-general-use.onnx',providers=['CPUExecutionProvider'])
def matte(im):
    im=im.convert('RGB'); w,h=im.size
    s=1024/max(w,h); nw,nh=int(w*s),int(h*s)
    r=im.resize((nw,nh),Image.LANCZOS)
    canvas=Image.new('RGB',(1024,1024),(0,0,0)); ox,oy=(1024-nw)//2,(1024-nh)//2; canvas.paste(r,(ox,oy))
    a=np.asarray(canvas).astype(np.float32)/255.0
    a=(a-0.5)/1.0
    t=a.transpose(2,0,1)[None]
    out=sess.run(None,{sess.get_inputs()[0].name:t})[0][0,0]
    out=(out-out.min())/(out.max()-out.min()+1e-8)
    m=Image.fromarray((out*255).astype(np.uint8)).crop((ox,oy,ox+nw,oy+nh)).resize((w,h),Image.LANCZOS)
    return m
if __name__=='__main__':
    src,box,dst=sys.argv[1],list(map(int,sys.argv[2].split(','))),sys.argv[3]
    im=Image.open(src).convert('RGB').crop(box)
    m=matte(im); rgba=im.copy(); rgba.putalpha(m); rgba.save(dst)
