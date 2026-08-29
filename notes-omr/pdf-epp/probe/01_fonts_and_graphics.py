# Пробник 1: какие шрифты в текстовом слое и что лежит в графике.
# Запуск: .venv/bin/python probe/01_fonts_and_graphics.py [файлы...]
import sys, collections
import pymupdf

DEFAULT = ["001.pdf", "051.pdf", "418.pdf", "775.pdf", "1228.pdf", "1603a.pdf", "2314.pdf", "196a.pdf"]
BASE = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr/pdf-epp/"

def probe(path):
    doc = pymupdf.open(path)
    print(f"\n=== {path.rsplit('/',1)[-1]}  pages={len(doc)} ===")
    font_glyphs = collections.Counter()
    font_sizes = collections.defaultdict(collections.Counter)
    for page in doc:
        d = page.get_text("rawdict")
        for block in d["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    f = span["font"]
                    font_glyphs[f] += len(span["chars"])
                    font_sizes[f][round(span["size"], 1)] += len(span["chars"])
    for f, n in font_glyphs.most_common():
        sizes = ", ".join(f"{s}:{c}" for s, c in font_sizes[f].most_common(4))
        print(f"  font {f:35s} glyphs={n:5d}  sizes[{sizes}]")

    # графика: drawings
    hlines = 0
    other = collections.Counter()
    for page in doc:
        for dr in page.get_drawings():
            for item in dr["items"]:
                op = item[0]
                if op == "l":
                    p1, p2 = item[1], item[2]
                    if abs(p1.y - p2.y) < 0.5 and abs(p1.x - p2.x) > 50:
                        hlines += 1
                    else:
                        other["line"] += 1
                elif op == "re":
                    r = item[1]
                    if r.height < 2 and r.width > 50:
                        hlines += 1
                    else:
                        other["rect"] += 1
                else:
                    other[op] += 1
    print(f"  drawings: long-horiz-lines={hlines}, other={dict(other)}")
    # изображения
    imgs = sum(len(p.get_images()) for p in doc)
    print(f"  images: {imgs}")
    doc.close()

files = sys.argv[1:] or [BASE + f for f in DEFAULT]
for f in files:
    try:
        probe(f)
    except Exception as e:
        print(f"{f}: ERROR {e}")
