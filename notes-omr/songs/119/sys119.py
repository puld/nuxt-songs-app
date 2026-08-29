# -*- coding: utf-8 -*-
"""Разбор структуры 119: системы из четырёх станов (хор + фортепиано)."""
import io
import pymupdf, os, sys

# omr.py лежит в pipeline/ и подключается по пути от этого файла, а не от текущего
# каталога: скрипты песни запускаются из её каталога, а конвейер общий.
# sys.path нужен и модулям, которые импортируют omr обычным import.
_PIPE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "pipeline"))
_OMR = os.path.join(_PIPE, "omr.py") if os.path.exists(os.path.join(_PIPE, "omr.py")) \
       else os.path.join(os.path.dirname(os.path.abspath(__file__)), "omr.py")
if os.path.dirname(_OMR) not in sys.path: sys.path.insert(0, os.path.dirname(_OMR))
exec(compile(io.open(_OMR, encoding="utf-8").read().split("if __name__")[0], _OMR, "exec"))

def brackets(page):
    """Левые вертикальные линии: системная и групповые."""
    out = []
    for v in verticals(page):
        if v["x"] < 95 and v["y1"] - v["y0"] > 40:
            out.append(v)
    return sorted(out, key=lambda v: (v["y0"], v["x"]))

def systems_of(page):
    st = staves_of(page)
    br = brackets(page)
    covered = lambda b: [s for s in st if b["y0"] - 3 <= s["top"] and s["bottom"] <= b["y1"] + 3]

    def inside(a, b):
        """a лежит внутри b по вертикали (b — объемлющая скобка)."""
        return a is not b and b["y0"] - 3 <= a["y0"] and a["y1"] <= b["y1"] + 3

    # системная скобка — та, что не вложена ни в одну другую; групповая (хор) вложена в неё.
    # Опираться на координату X нельзя: на первой странице скобки сдвинуты вправо
    # под заголовок, и системная линия там правее, чем групповые на остальных.
    tops = [b for b in br if not any(inside(b, o) for o in br)]
    out = []
    for b in sorted(tops, key=lambda v: v["y0"]):
        members = covered(b)
        inner = [g for g in br if inside(g, b)]
        choir = covered(inner[0]) if inner else []
        piano = [s for s in members if s not in choir]
        out.append({"staves": members, "choir": choir, "piano": piano,
                    "top": b["y0"], "bottom": b["y1"]})
    return out

if __name__ == "__main__":
    doc = pymupdf.open("119.pdf")
    total = 0
    for pno, pg in enumerate(doc):
        for i, sy in enumerate(systems_of(pg)):
            total += 1
            c = " ".join(f"{s['top']:.0f}" for s in sy["choir"]) or "—"
            p = " ".join(f"{s['top']:.0f}" for s in sy["piano"]) or "—"
            print(f"стр.{pno+1} система {i+1}: станов {len(sy['staves'])} | хор: {c} | фп: {p}")
    print("всего систем:", total)
