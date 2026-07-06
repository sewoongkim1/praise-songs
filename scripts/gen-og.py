# og-cover.png 배경만 남색 -> 보라색으로 (카드+로고는 원본 유지)
from PIL import Image, ImageDraw

SRC = r"C:\Projects\praise-songs\og-cover-navy.png"   # 원본(백업)
OUT = r"C:\Projects\praise-songs\og-cover.png"

img = Image.open(SRC).convert("RGB")
W, H = img.size
px = img.load()

# 1) 크림색(밝은) 카드 영역의 bounding box 찾기
minx, miny, maxx, maxy = W, H, 0, 0
for y in range(0, H, 2):
    for x in range(0, W, 2):
        r, g, b = px[x, y]
        if r > 200 and g > 195 and b > 175:  # 크림/화이트 카드
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
print("카드 bbox:", minx, miny, maxx, maxy)

# 2) 보라색 대각 그라디언트 배경
c1 = (92, 45, 145)   # 밝은 보라 (top-left)  #5C2D91
c2 = (48, 24, 92)    # 짙은 보라 (bottom-right) #30185C
bg = Image.new("RGB", (W, H))
bp = bg.load()
for y in range(H):
    for x in range(W):
        t = (x / W + y / H) / 2.0
        bp[x, y] = (
            int(c1[0] + (c2[0]-c1[0])*t),
            int(c1[1] + (c2[1]-c1[1])*t),
            int(c1[2] + (c2[2]-c1[2])*t),
        )

# 3) 카드 모양(둥근 사각형) 마스크 — 이 안은 원본 유지, 밖은 보라 배경
mask = Image.new("L", (W, H), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([minx, miny, maxx, maxy], radius=42, fill=255)

out = Image.composite(img, bg, mask)
out.save(OUT, "PNG")
print("완료:", OUT, out.size)
