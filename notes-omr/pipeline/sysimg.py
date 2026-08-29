# -*- coding: utf-8 -*-
"""Картинка одной системы: разбор проверяется глазами, а не только числами."""
import pymupdf, omr, satb, sys

def render(path, si, out, zoom=3, bars=True):
    doc, syss = omr.analyse(path)
    sy = syss[si]
    pg = doc[sy["page"]]
    tmp = pymupdf.open()
    p = tmp.new_page(width=pg.rect.width, height=pg.rect.height)
    p.show_pdf_page(p.rect, doc, sy["page"])
    if bars:
        for i, x in enumerate(satb.bars_of(sy["ver"], sy["treble"])):
            p.draw_line((x, sy["ytop"] - 22), (x, sy["ytop"] - 6), color=(1, 0, 0), width=0.8)
            p.insert_text((x + 1, sy["ytop"] - 24), str(i), fontsize=7, color=(1, 0, 0))
    r = pymupdf.Rect(0, sy["ytop"] - 30, pg.rect.width, sy["ybot"] + 30)
    p.get_pixmap(clip=r, matrix=pymupdf.Matrix(zoom, zoom)).save(out)
    print(out, "страница", sy["page"])

if __name__ == "__main__":
    render(sys.argv[1], int(sys.argv[2]), sys.argv[3])
