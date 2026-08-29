# -*- coding: utf-8 -*-
"""Контактный лист глифов нотного шрифта: образцы кода, обведённые рамкой.

Кодировки нотных шрифтов у Finale, Sibelius и старых редакторов не совпадают, а
у встроенных подмножеств (TT1E5t00, CIDFont+F2) имён глифов нет вовсе. Поэтому
карта строится не по таблицам шрифта, а по картинке.

Вокруг образца рисуется рамка: клип всегда захватывает соседние знаки, и без
неё непонятно, какой из них подписан кодом.

    python glyphsheet.py 658.pdf TT14o00 /tmp/sheet.png
"""
import pymupdf, sys

ZOOM, CELL, NS = 8, 150, 3

def samples(doc, font_sub, n=NS):
    out = {}
    for pno, pg in enumerate(doc):
        for b in pg.get_text("rawdict")["blocks"]:
            if b["type"] != 0: continue
            for l in b.get("lines", []):
                for sp in l["spans"]:
                    if font_sub not in sp["font"]: continue
                    for c in sp["chars"]:
                        lst = out.setdefault(ord(c["c"]), [])
                        if len(lst) < n: lst.append((pno, c["bbox"], sp["size"]))
    return out

def crop(doc, pno, bb, size, marks):
    """Кроп вокруг глифа с рамкой на нём: страница копируется, чтобы не портить исходник."""
    tmp = pymupdf.open()
    src = doc[pno]
    p = tmp.new_page(width=src.rect.width, height=src.rect.height)
    p.show_pdf_page(p.rect, doc, pno)
    p.draw_rect(pymupdf.Rect(bb), color=(1, 0, 0), width=0.35)
    pad = size * 0.5
    r = pymupdf.Rect(bb[0] - pad * 0.5, bb[1] - pad, bb[2] + pad * 0.5, bb[3] + pad)
    return p.get_pixmap(clip=r, matrix=pymupdf.Matrix(ZOOM, ZOOM))

def sheet(path, font_sub, out_png, cols=6):
    doc = pymupdf.open(path)
    sm = samples(doc, font_sub)
    keys = sorted(sm)
    rows = (len(keys) + cols - 1) // cols
    dst = pymupdf.open()
    pg = dst.new_page(width=cols * CELL, height=rows * CELL)
    for i, k in enumerate(keys):
        cx, cy = (i % cols) * CELL, (i // cols) * CELL
        pg.draw_rect(pymupdf.Rect(cx, cy, cx + CELL, cy + CELL), color=(0.75, 0.75, 0.75), width=0.5)
        pg.insert_text((cx + 5, cy + 13), "%04X" % k, fontsize=11)
        w = (CELL - 10) / NS
        for j, (pno, bb, size) in enumerate(sm[k]):
            pix = crop(doc, pno, bb, size, None)
            sc = min(w / pix.width, (CELL - 22) / pix.height)
            x0, y0 = cx + 5 + j * w, cy + 18
            pg.insert_image(pymupdf.Rect(x0, y0, x0 + pix.width * sc, y0 + pix.height * sc), pixmap=pix)
    pg.get_pixmap(matrix=pymupdf.Matrix(2, 2)).save(out_png)
    return keys

if __name__ == "__main__":
    ks = sheet(sys.argv[1], sys.argv[2], sys.argv[3])
    print(len(ks), "кодов:", " ".join("%04X" % k for k in ks))
