# -*- coding: utf-8 -*-
"""Страница PDF с подписанными кодами глифов нотного шрифта.

Кодировки нотных шрифтов у Finale, Sibelius и старых редакторов не совпадают, а
у встроенных подмножеств (TT1E5t00, CIDFont+F2) имён глифов нет вовсе. Карта
кодов строится глазами: знак видно на своём месте в системе, код подписан рядом.
"""
import pymupdf, sys

def annotate(path, font_sub, out_png, page=0, zoom=4, band=None, label=6):
    doc = pymupdf.open(path)
    src = doc[page]
    big = pymupdf.open()
    r = src.rect
    dst = big.new_page(width=r.width * zoom, height=r.height * zoom)
    dst.show_pdf_page(dst.rect, doc, page)
    for b in src.get_text("rawdict")["blocks"]:
        if b["type"] != 0: continue
        for l in b.get("lines", []):
            for sp in l["spans"]:
                if font_sub not in sp["font"]: continue
                for c in sp["chars"]:
                    x, y = c["bbox"][0] * zoom, c["bbox"][1] * zoom
                    dst.insert_text((x, y - 1), "%X" % ord(c["c"]), fontsize=label, color=(1, 0, 0))
    clip = pymupdf.Rect(0, band[0] * zoom, dst.rect.x1, band[1] * zoom) if band else None
    dst.get_pixmap(clip=clip).save(out_png)

if __name__ == "__main__":
    a = sys.argv
    band = (float(a[5]), float(a[6])) if len(a) > 6 else None
    annotate(a[1], a[2], a[3], page=int(a[4]) if len(a) > 4 else 0, band=band)
