import sys
from PIL import Image
d=sys.argv[1];out=sys.argv[2];ids=[int(x) for x in sys.argv[3].split(',')];h=int(sys.argv[4]) if len(sys.argv)>4 else 560
ims=[Image.open('%s/%03d.png'%(d,i)) for i in ids];ims=[i.resize((int(i.width*h/i.height),h)) for i in ims]
W=Image.new('RGB',(sum(i.width for i in ims),h));x=0
for i in ims:W.paste(i,(x,0));x+=i.width
W.save(out)
