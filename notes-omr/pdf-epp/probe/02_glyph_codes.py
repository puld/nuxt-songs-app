# Пробник 2: коды глифов музыкальных шрифтов + координаты; линии стана.
# Запуск: .venv/bin/python probe/02_glyph_codes.py [file.pdf]
import sys, collections
import pymupdf

BASE = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr/pdf-epp/"
path = sys.argv[1] if len(sys.argv) > 1 else BASE + "051.pdf"

doc = pymupdf.open(path)
print(f"=== {path.rsplit('/',1)[-1]} ===")
codes = collections.defaultdict(collections.Counter)   # font -> code counter
samples = collections.defaultdict(list)                # (font, code) -> [(x, y, size)]
for pno, page in enumerate(doc):
    d = page.get_text("rawdict")
    for block in d["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                f = span["font"]
                if not f.startswith("Opus"):
                    continue
                for ch in span["chars"]:
                    c = ord(ch["c"])
                    codes[f][c] += 1
                    if len(samples[(f, c)]) < 3:
                        x, y = ch["origin"]
                        samples[(f, c)].append((pno, round(x, 1), round(y, 1), round(span["size"], 1)))

for f in sorted(codes):
    print(f"\n--- {f} (total {sum(codes[f].values())}) ---")
    for c, n in codes[f].most_common(25):
        s = samples[(f, c)][:2]
        print(f"  code {c:5d} (U+{c:04X}) x{n:4d}  samples={s}")

# линии стана: горизонтальные линии, сгруппированные по y
print("\n--- horizontal lines (page 0) ---")
page = doc[0]
ys = []
for dr in page.get_drawings():
    for item in dr["items"]:
        if item[0] == "l":
            p1, p2 = item[1], item[2]
            if abs(p1.y - p2.y) < 0.5 and abs(p1.x - p2.x) > 100:
                ys.append((round(p1.y, 2), round(p1.x, 1), round(p2.x, 1)))
ys.sort()
prev = None
for y, x1, x2 in ys:
    gap = "" if prev is None else f"  dy={round(y - prev, 2)}"
    print(f"  y={y}  x=[{x1}..{x2}]{gap}")
    prev = y
doc.close()
