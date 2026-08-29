# -*- coding: utf-8 -*-
"""Разбор, надписанный поверх самого PDF: сверка высот глазами, а не по ABC.

Числовая приёмка (`checkall.py`) ловит арифметику такта и число тактов, но
молчит про высоты: перепутанная нота даёт ту же сумму длительностей. Сверять же
высоты по тексту ABC мучительно — приходится держать в голове и порядок нот, и
их номера, и как выглядит такт в PDF.

Поэтому подписи ставятся туда, где нота напечатана: над верхним станом — что
распозналось у сопрано и альта, под нижним — у тенора и баса. Глаз сравнивает
подпись с головкой прямо под ней, и ошибка видна без счёта.

Длительность пишется рядом с высотой (`c/2`, `G.`), потому что ошибка в ней
выглядит на странице так же безобидно, как верная нота: сумма такта сойдётся,
если ошиблись симметрично в двух местах.

    python3 proof.py ../pdf/752.pdf 0 3      # системы 0..3 → /tmp/proof_752_N.png
"""
import sys, os, pymupdf, omr, satb, slurs, volta

COLOR = {"S": (0.8, 0, 0), "A": (0, 0.5, 0), "T": (0, 0, 0.9), "B": (0.6, 0.3, 0)}
DUR = {4.0: "o", 3.0: "O.", 2.0: "O", 1.5: ".", 1.0: "", 0.75: "/.", 0.5: "/", 0.25: "//"}

def label(e):
    """Подпись события: высота и длительность, паузы — прочерком."""
    d = DUR.get(round(e["dur"], 3), "%.2g" % e["dur"])
    if e["rest"]: return "-" + d
    ps = e["pitches"]
    body = "".join(p["p"].lower() + {"#": "^", "b": "_", "n": "="}.get(p["acc"], "") + str(p["o"]) for p in ps[:2])
    return body + d

def draw(page, it, sy, staff, voices, above):
    """Подписи голосов у своего стана: два ряда, чтобы не наезжали друг на друга."""
    for row, v in enumerate(voices):
        y = staff["top"] - 8 - 7 * row if above else staff["bottom"] + 14 + 7 * row
        for bar in it["cells"][v]:
            for e in bar:
                page.insert_text((e["x"] - 3, y), label(e), fontsize=4.6, color=COLOR[v])

def render(path, si, out):
    doc, syss, sc = satb.build(path)
    # `cells` (такты, разложенные по голосам) появляются только здесь: `build`
    # отдаёт поток событий, а разбивку на такты делает `content`
    satb.content(sc)
    slurs.apply(doc, syss, sc)
    volta.apply(doc, syss, sc)
    sy, it = syss[si], sc["systems"][si]
    src = doc[sy["page"]]
    tmp = pymupdf.open()
    pg = tmp.new_page(width=src.rect.width, height=src.rect.height)
    pg.show_pdf_page(pg.rect, doc, sy["page"])
    voc = sy.get("vocal") or omr.system_staves(sy)
    draw(pg, it, sy, voc[0], ("S", "A"), True)
    draw(pg, it, sy, voc[-1], ("T", "B"), False)
    # тактовые черты подписываются сквозным номером: именно его печатает издатель
    # слева над системой, и именно по нему сверяется `barnums.py`
    first = 1 + sum(x["nbars"] for x in sc["systems"][:si])
    for i, x in enumerate(it["bars"][:-1]):
        pg.draw_line((x, sy["ytop"] - 26), (x, sy["ytop"] - 14), color=(0.6, 0.6, 0.6), width=0.6)
        pg.insert_text((x + 1, sy["ytop"] - 28), str(first + i), fontsize=5.5, color=(0.4, 0.4, 0.4))
    r = pymupdf.Rect(0, sy["ytop"] - 34, src.rect.width, sy["ybot"] + 34)
    pg.get_pixmap(clip=r, dpi=220).save(out)
    return out

if __name__ == "__main__":
    path = sys.argv[1]
    name = os.path.splitext(os.path.basename(path))[0]
    lo = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    hi = int(sys.argv[3]) if len(sys.argv) > 3 else lo
    for si in range(lo, hi + 1):
        print(render(path, si, "/tmp/proof_%s_%d.png" % (name, si)))
