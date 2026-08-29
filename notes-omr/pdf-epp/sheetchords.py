# -*- coding: utf-8 -*-
"""Аккорды с нотного листа Эппа: что напечатано над каким слогом.

OMR тут не нужен — и аккорды, и подтекстовка лежат в текстовом слое PDF, и
слои различаются **шрифтом**: аккорды набраны `OpusChords`, подтекстовка —
`PetersburgCyrillic`, заголовок — тем же шрифтом в Bold, ноты — `Opus`.
Шрифт надёжнее любой регулярки: «A» встречается и в заголовке, и в фамилии
автора, а `OpusChords` не содержит ничего, кроме аккордов.

Привязка чисто геометрическая: аккорд стоит над нотой, нота над слогом,
поэтому аккорд относится к слогу с ближайшим x в строке подтекстовки под ним.
Лист устроен системами: несколько нотных станов, под ними строки
подтекстовки — по одной на куплет («1. Слу - шай - те…»). Аккорды печатаются
один раз на систему и относятся сразу ко **всем** куплетам: нота общая, слог
у каждого свой.
"""
import re, os
from collections import Counter, defaultdict
import pymupdf
from headings import fix

HERE = os.path.dirname(os.path.abspath(__file__))
CYR = re.compile(r"[А-Яа-яЁё]")
NUMBERED = re.compile(r"^(\d+)\.")
ROW_TOL = 3.0      # разброс y внутри одной строки
SYSTEM_GAP = 24.0  # разрыв между строками подтекстовки разных систем

# Немецкая нотация → английская, принятая в сборнике: H — си, B — си-бемоль.
GERMAN = {"H": "B", "B": "Bb", "Es": "Eb", "As": "Ab", "Des": "Db",
          "Ges": "Gb", "Ces": "Cb", "Fis": "F#", "Cis": "C#", "Gis": "G#",
          "Dis": "D#", "Ais": "A#", "His": "B#", "Eis": "E#", "Fes": "Fb",
          "Eses": "D", "Heses": "A"}
NOTE = re.compile(r"^(Fis|Cis|Gis|Dis|Ais|His|Eis|Fes|Heses|Eses|Des|Ges|Ces|Es|As|[A-H])")

# Лигатуры шрифта OpusChords. Читаются из **сырого** текста: `fix()` чинит
# кириллицу подтекстовки, а музыкальному шрифту только вредит — «º» после неё
# становится «є», «Ø» превращается в «Ш».
LIGATURES = [("\u0152„\u0160", "maj"), ("„\u02c6\u02c6", "add"),
             ("\u2039", "m"), ("\u201c", "sus"), ("\u00d87", "m7b5"),
             ("\u00d8", "m7b5"), ("\u00ba", "dim"), ("&", "+")]

# Хвост аккорда после корня. Перечислен целиком, а не «что угодно»: у Эппа
# встречаются обрезки и знаки, которым в тексте песни делать нечего, и лучше
# не проставить аккорд, чем напечатать над слогом мусор.
TAIL = re.compile(
    r"^(m|dim|m7b5|\+)?"
    r"(maj7|maj9|13|11|7|9|6|5|4|2)?"
    r"(?:\((?:sus|add)?(?:[#b]?\d{1,2})\))?"
    r"(?:sus[24]?)?$")


def to_english(raw):
    """Обозначение из шрифта OpusChords в нотацию сборника. None — не разобрано."""
    s = raw.strip()
    for a, b in LIGATURES:
        s = s.replace(a, b)
    parts = s.split("/", 1)
    out = []
    for i, p in enumerate(parts):
        m = NOTE.match(p)
        if not m:
            return None
        root = GERMAN.get(m.group(1), m.group(1))
        tail = p[m.end():]
        if i:                       # у баса суффикса быть не может
            if tail:
                return None
            out.append(root)
            continue
        if not TAIL.match(tail):
            return None
        out.append(root + tail.replace("(", "").replace(")", ""))
    return "/".join(out)


def spans(page):
    """Куски текста страницы: (x0, y0, x1, шрифт, кегль, текст)."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                # Кодировку чинит только кириллица: слоги набраны шрифтом с
                # cp1251-раскладкой, а PDF отдаёт их как latin-1.
                t = s["text"] if "Opus" in s["font"] else fix(s["text"])
                if t.strip():
                    x0, y0, x1, _y1 = s["bbox"]
                    out.append((x0, y0, x1, s["font"], round(s["size"], 1), t))
    return out


def lyric_size(pages):
    """Кегль подтекстовки: самый частый среди кириллических кусков.

    Заголовок листа и ссылка на стих Писания набраны тем же шрифтом, но своим
    кеглем, а подтекстовка — самый объёмный текст на листе.
    """
    c = Counter()
    for sp in pages:
        for x0, y0, x1, font, size, t in sp:
            if "Petersburg" in font and "Bold" not in font and CYR.search(t):
                c[size] += len(t)
    return c.most_common(1)[0][0] if c else None


def words_of(x0, x1, text):
    """Слова куска с оценкой координат: PDF отдаёт span целиком."""
    out, n = [], len(text)
    w = (x1 - x0) / n if n else 0
    for m in re.finditer(r"\S+", text):
        out.append((x0 + w * m.start(), x0 + w * m.end(), m.group(0)))
    return out


def rows_of(items, tol=ROW_TOL):
    """Элементы (…, y, …), сгруппированные в строки по y."""
    out = []
    for it in sorted(items, key=lambda w: (w[1], w[0])):
        if out and abs(it[1] - out[-1][0]) <= tol:
            out[-1][1].append(it)
        else:
            out.append([it[1], [it]])
    return [(y, sorted(g, key=lambda w: w[0])) for y, g in out]


def read_sheet(path):
    """Лист: список систем. Система — аккорды и строки подтекстовки под ними."""
    doc = pymupdf.open(path)
    pages = [spans(p) for p in doc]
    doc.close()
    size = lyric_size(pages)
    systems = []
    for sp in pages:
        chords, lyrics = [], []
        for x0, y0, x1, font, sz, t in sp:
            if "OpusChords" in font:
                for a, b, w in words_of(x0, x1, t):
                    chords.append((a, y0, w))
            elif "Petersburg" in font and "Bold" not in font and sz == size and CYR.search(t):
                for a, b, w in words_of(x0, x1, t):
                    lyrics.append((a, y0, b, w))
        # Строки подтекстовки, слипшиеся по вертикали, — куплеты одной системы
        blocks = []
        for y, g in rows_of(lyrics):
            if blocks and y - blocks[-1][-1]["y"] <= SYSTEM_GAP:
                blocks[-1].append({"y": y, "row": g})
            else:
                blocks.append([{"y": y, "row": g}])
        # Аккорды достаются блоку, под которым напечатаны
        for i, block in enumerate(blocks):
            top = blocks[i - 1][-1]["y"] if i else -1e9
            bottom = block[0]["y"]
            own = [c for c in chords if top < c[1] < bottom]
            systems.append({"chords": sorted(own), "lines": [parse_line(b) for b in block]})
    return systems


def parse_line(block):
    """Строка подтекстовки: номер куплета и слоги (x0, x1, текст)."""
    num, syls = None, []
    for x0, y0, x1, t in block["row"]:
        if not syls:
            m = NUMBERED.match(t)
            if m:
                num = int(m.group(1))
                t = t[m.end():]
                x0 += (x1 - x0) * m.end() / max(len(m.group(0)) + len(t), 1)
        if t in ("-", "–", "—"):
            continue
        if CYR.search(t):
            syls.append((x0, x1, t))
    return {"verse": num, "syls": syls}


def attach(system):
    """{индекс строки: {индекс слога: аккорд}} — аккорд к ближайшему слогу по x."""
    out = []
    for line in system["lines"]:
        got, used = {}, set()
        for x, _y, raw in system["chords"]:
            if not line["syls"]:
                continue
            i = min(range(len(line["syls"])),
                    key=lambda k: abs(line["syls"][k][0] - x))
            # Два аккорда на один слог — второй сдвигается вправо: под слогом
            # держится длинная нота, а гармония меняется дважды.
            while i in used and i + 1 < len(line["syls"]):
                i += 1
            used.add(i)
            got[i] = raw
        out.append(got)
    return out


def render(path):
    """Подтекстовка листа с проставленными аккордами — для сверки глазами."""
    for si, sys_ in enumerate(read_sheet(path)):
        marks = attach(sys_)
        head = " ".join("%s@%d" % (t, x) for x, _y, t in sys_["chords"])
        print("--- система %d: %s" % (si, head or "(без аккордов)"))
        for line, got in zip(sys_["lines"], marks):
            s = ""
            for i, (x0, _x1, t) in enumerate(line["syls"]):
                if i in got:
                    e = to_english(got[i])
                    s += "{%s}" % (e or ("?" + got[i]))
                s += t + " "
            print("   %-3s %s" % (line["verse"] or "-", s.strip()))


if __name__ == "__main__":
    import sys
    render(sys.argv[1])
