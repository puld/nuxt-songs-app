# Пробник 6: демо вычисления высоты звука по y головки и линиям стана (001.pdf, первый стан).
# Запуск: .venv/bin/python probe/06_pitch_demo.py
import pymupdf

BASE = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr/pdf-epp/"
doc = pymupdf.open(BASE + "001.pdf")
page = doc[0]

# линии станов
ys = sorted({round(p1.y, 2) for dr in page.get_drawings() for it in dr["items"]
             if it[0] == "l"
             for p1, p2 in [(it[1], it[2])]
             if abs(p1.y - p2.y) < 0.5 and abs(p1.x - p2.x) > 100})
# группируем в пятёрки
staves = [ys[i:i + 5] for i in range(0, len(ys), 5)]
top = staves[0]
line_gap = (top[4] - top[0]) / 4
bottom_line = top[4]
print(f"staff1 lines: {top}, gap={line_gap:.2f}")

# головки œ (0x153) в полосе первого стана
heads = []
d = page.get_text("rawdict")
for block in d["blocks"]:
    if block["type"] != 0:
        continue
    for line in block["lines"]:
        for span in line["spans"]:
            if span["font"] != "OpusStd":
                continue
            for ch in span["chars"]:
                if ord(ch["c"]) == 0x153:
                    x, y = ch["origin"]
                    if top[0] - 4 * line_gap < y < top[4] + 4 * line_gap:
                        heads.append((x, y))
heads.sort()

# ступень: 0 = нижняя линия (E4 в скрипичном), +1 за каждую полулинию вверх
STEPS = ["E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"]
LOW = ["D4", "C4", "B3", "A3"]
print(f"{len(heads)} heads in staff 1; first 14:")
for x, y in heads[:14]:
    half = (bottom_line - y) / (line_gap / 2)
    step = round(half)
    name = STEPS[step] if 0 <= step < len(STEPS) else (LOW[-step - 1] if -len(LOW) <= step < 0 else f"step{step}")
    print(f"  x={x:6.1f} y={y:6.2f} half-steps={half:5.2f} -> {name}")

# рендер первого стана для сверки глазами
clip = pymupdf.Rect(30, top[0] - 20, 320, top[4] + 20)
out = "/private/tmp/claude-502/-Users-l-romanov-workspace-my-nuxt-songs-app/40dba977-185a-43ac-ade2-c2042b19f8ff/scratchpad/staff1.png"
page.get_pixmap(clip=clip, dpi=250).save(out)
print("render:", out)
