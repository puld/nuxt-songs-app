# Пробник 3: рендер вырезок вокруг глифов Opus для визуального опознания кодов.
# Запуск: .venv/bin/python probe/03_render_glyphs.py
import collections
import pymupdf

BASE = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr/pdf-epp/"
OUT = "/private/tmp/claude-502/-Users-l-romanov-workspace-my-nuxt-songs-app/40dba977-185a-43ac-ade2-c2042b19f8ff/scratchpad/glyphs/"
import os
os.makedirs(OUT, exist_ok=True)

doc = pymupdf.open(BASE + "051.pdf")
page = doc[0]
d = page.get_text("rawdict")
seen = collections.Counter()
for block in d["blocks"]:
    if block["type"] != 0:
        continue
    for line in block["lines"]:
        for span in line["spans"]:
            f = span["font"]
            if not f.startswith("Opus") or "Chords" in f:
                continue
            for ch in span["chars"]:
                c = ord(ch["c"])
                key = (f, c)
                if seen[key] >= 2:
                    continue
                seen[key] += 1
                x, y = ch["origin"]
                clip = pymupdf.Rect(x - 25, y - 30, x + 30, y + 25)
                pix = page.get_pixmap(clip=clip, dpi=200)
                pix.save(f"{OUT}{f}_{c:04X}_{seen[key]}_x{int(x)}y{int(y)}.png")
print("saved to", OUT)
print(sorted(seen))
