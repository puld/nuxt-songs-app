# Пробник 5: узкие вырезки одиночных глифов OpusStd в 001.pdf для точного опознания.
# Запуск: .venv/bin/python probe/05_render_001.py
import collections, os
import pymupdf

BASE = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr/pdf-epp/"
OUT = "/private/tmp/claude-502/-Users-l-romanov-workspace-my-nuxt-songs-app/40dba977-185a-43ac-ade2-c2042b19f8ff/scratchpad/glyphs001/"
os.makedirs(OUT, exist_ok=True)

doc = pymupdf.open(BASE + "001.pdf")
page = doc[0]
d = page.get_text("rawdict")
seen = collections.Counter()
for block in d["blocks"]:
    if block["type"] != 0:
        continue
    for line in block["lines"]:
        for span in line["spans"]:
            f = span["font"]
            if f not in ("OpusStd", "OpusSpecialStd"):
                continue
            for ch in span["chars"]:
                c = ord(ch["c"])
                key = (f, c)
                if seen[key] >= 2:
                    continue
                seen[key] += 1
                x, y = ch["origin"]
                # узкий клип: глиф + чуть контекста
                clip = pymupdf.Rect(x - 8, y - 14, x + 14, y + 10)
                pix = page.get_pixmap(clip=clip, dpi=300)
                pix.save(f"{OUT}{f}_{c:04X}_{seen[key]}.png")
print("saved", len(seen), "codes to", OUT)
