# 產生程式圖示：一幅風景照片＋圖層＋小柯機器人（頭盔造型，與其他小柯系列一致）
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024


def layer():
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))


img = layer()
# 後面兩張錯開的圖層
for i, (col, ang) in enumerate((((255, 190, 90, 255), 14), ((120, 210, 170, 255), 7))):
    lay = layer()
    ImageDraw.Draw(lay).rounded_rectangle((120, 90, 800, 700), 56, fill=col)
    img = Image.alpha_composite(img, lay.rotate(ang, resample=Image.BICUBIC, center=(460, 400)))

sh = layer()
ImageDraw.Draw(sh).rounded_rectangle((90, 130, 800, 800), 60, fill=(0, 0, 0, 150))
img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(28)))

# 照片：天空、太陽、山、湖
ph = layer()
d = ImageDraw.Draw(ph)
x0, y0, x1, y1 = 84, 100, 776, 760
for y in range(y0, y1):
    t = (y - y0) / (y1 - y0)
    d.line((x0, y, x1, y), fill=(int(70 + 180 * t), int(150 + 80 * t), int(245 - 60 * t), 255))
d.ellipse((540, 170, 680, 310), fill=(255, 226, 120, 255))
d.polygon([(x0, 640), (280, 340), (430, 520), (560, 400), (x1, 650), (x1, y1), (x0, y1)], fill=(64, 130, 110, 255))
d.polygon([(280, 340), (232, 392), (270, 380), (300, 402), (328, 392)], fill=(240, 246, 250, 255))
d.polygon([(x0, 700), (x1, 660), (x1, y1), (x0, y1)], fill=(36, 92, 140, 255))
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((x0, y0, x1, y1), 52, fill=255)
ph.putalpha(Image.composite(ph.getchannel('A'), Image.new('L', (S, S), 0), mask))
img = Image.alpha_composite(img, ph)
fr = layer()
ImageDraw.Draw(fr).rounded_rectangle((x0, y0, x1, y1), 52, outline=(255, 255, 255, 255), width=20)
img = Image.alpha_composite(img, fr)

# 小柯機器人
rb = layer()
r = ImageDraw.Draw(rb)
cx, cy = 700, 680
r.line((cx, cy - 250, cx, cy - 190), fill=(90, 100, 120, 255), width=18)
r.ellipse((cx - 34, cy - 290, cx + 34, cy - 222), fill=(255, 196, 40, 255))
r.rounded_rectangle((cx - 262, cy - 70, cx - 210, cy + 80), 22, fill=(40, 120, 220, 255))
r.rounded_rectangle((cx + 210, cy - 70, cx + 262, cy + 80), 22, fill=(40, 120, 220, 255))
r.ellipse((cx - 230, cy - 210, cx + 230, cy + 220), fill=(70, 150, 240, 255))
r.ellipse((cx - 214, cy - 196, cx + 214, cy + 200), fill=(240, 246, 255, 255))
r.rounded_rectangle((cx - 170, cy - 110, cx + 170, cy + 90), 90, fill=(24, 36, 64, 255))
for ex in (cx - 72, cx + 72):
    r.arc((ex - 46, cy - 50, ex + 46, cy + 30), 200, 340, fill=(90, 230, 255, 255), width=22)
r.arc((cx - 50, cy + 10, cx + 50, cy + 70), 20, 160, fill=(90, 230, 255, 255), width=14)
r.ellipse((cx - 160, cy + 40, cx - 110, cy + 80), fill=(255, 140, 160, 200))
r.ellipse((cx + 110, cy + 40, cx + 160, cy + 80), fill=(255, 140, 160, 200))
# 手上拿著畫筆
r.line((cx - 250, cy + 240, cx - 120, cy + 110), fill=(232, 150, 60, 255), width=26)
r.polygon([(cx - 136, cy + 92), (cx - 100, cy + 128), (cx - 62, cy + 54)], fill=(240, 70, 90, 255))
os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
rb.crop((cx - 280, cy - 300, cx + 280, cy + 260)).resize((192, 192), Image.LANCZOS).save(os.path.join(ROOT, 'build', 'robot.png'))
sh2 = layer()
ImageDraw.Draw(sh2).ellipse((cx - 230, cy - 180, cx + 250, cy + 260), fill=(0, 0, 0, 120))
img = Image.alpha_composite(img, sh2.filter(ImageFilter.GaussianBlur(24)))
img = Image.alpha_composite(img, rb)

os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
img.save(os.path.join(ROOT, 'build', 'icon.png'))
img.save(os.path.join(ROOT, 'build', 'icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('ok')
