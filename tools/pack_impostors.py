"""
把 render_impostors.py 渲出来的一张张公告板照片拼成一张图集（impostors.webp），网页里所有树、灌木、草丛一次 draw call 画完。
每张照片四周留 6 像素的空白，免得贴图缩小（mipmap）时相邻照片的颜色渗过来。

用法：python tools/pack_impostors.py <render_impostors 的输出目录> <public/assets/impostors>
输出 impostors.webp 和 impostors.json：每张照片的实际宽高（米）和在图集里的 uv 范围 [u0, v0, u1, v1]（v 朝上，和 three.js 一致）。
"""
import sys, os, json, glob
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
skip = tuple(sys.argv[3].split(',')) if len(sys.argv) > 3 else ()
meta = json.load(open(os.path.join(src, 'impostors.json')))
items = []
for f in sorted(glob.glob(os.path.join(src, '*.webp'))):
    name = os.path.basename(f)[:-5]
    if name not in meta or name.startswith(skip): continue
    items.append((name, Image.open(f).convert('RGBA')))
items.sort(key=lambda t: -t[1].size[1])

W, PAD = 2048, 6
x = y = row_h = 0
placed = []
for name, im in items:
    w, h = im.size
    if x + w + PAD * 2 > W: x, y, row_h = 0, y + row_h, 0
    placed.append((name, im, x + PAD, y + PAD))
    x += w + PAD * 2; row_h = max(row_h, h + PAD * 2)
H = 1
while H < y + row_h: H *= 2

atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
out_meta = {}
for name, im, px, py in placed:
    atlas.alpha_composite(im, (px, py))
    w, h = im.size
    out_meta[name] = {**meta[name], 'uv': [round(px / W, 5), round(1 - (py + h) / H, 5), round((px + w) / W, 5), round(1 - py / H, 5)]}
os.makedirs(out, exist_ok=True)
atlas.save(os.path.join(out, 'impostors.webp'), 'WEBP', quality=86, method=6)
json.dump(out_meta, open(os.path.join(out, 'impostors.json'), 'w'), separators=(',', ':'))
print(f'atlas {W}x{H}, {len(placed)} images')
