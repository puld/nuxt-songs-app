# -*- coding: utf-8 -*-
"""Страница приёмки спорных сопоставлений: наш текст против верха нотного листа.

Приёмка поштучная и глазами — угадывать нельзя, ошибка привяжет к песне чужие
ноты и всплывёт только на экране. Модель здесь не нужна и вредна: решение
принимает человек, а инструмент лишь ставит рядом две вещи, которые надо
сравнить, и запоминает ответ.

Превью — узкая полоса сверху листа: там напечатаны номер, заголовок и первая
система. Целая страница не нужна, а весит вдесятеро больше.
"""
import io, os, csv, json, base64, collections
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
TOP = 0.34          # доля листа сверху: заголовок и первая система
ZOOM = 1.4

def our_text(num):
    """Название и первая строфа эталона — по ним человек и узнаёт песню."""
    p = os.path.join(ROOT, "songs-data/songs/%04d.txt" % num)
    if not os.path.exists(p): return "", []
    lines = io.open(p, encoding="utf-8").read().splitlines()
    body, meta = [], False
    for ln in lines:
        if ln.strip() == "@meta": meta = True; continue
        if ln.strip() == "@end":  meta = False; continue
        if meta: continue
        body.append(ln)
    body = [l for l in body if l.strip()]
    title = body[0] if body else ""
    return title, body[1:9]

def preview(path):
    doc = pymupdf.open(path)
    pg = doc[0]
    r = pg.rect
    clip = pymupdf.Rect(r.x0, r.y0, r.x1, r.y0 + r.height * TOP)
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=clip, colorspace=pymupdf.csGRAY)
    return base64.b64encode(pix.tobytes("png")).decode()

rows = list(csv.DictReader(io.open(os.path.join(HERE, "review.tsv"), encoding="utf-8"), delimiter="\t"))
by_song = collections.OrderedDict()
for r in rows: by_song.setdefault(int(r["наш"]), []).append(r)

cards = []
missing = 0
for num, cand in by_song.items():
    title, verse = our_text(num)
    items = []
    for c in cand:
        fn = os.path.basename(c["их файл"])
        p = os.path.join(HERE, fn)
        if not os.path.exists(p): missing += 1; continue
        try: img = preview(p)
        except Exception as e: missing += 1; continue
        items.append({"file": fn, "cap": c["их название"], "sim": c["сходство"], "img": img})
    if not items: continue
    cards.append({"num": num, "title": title, "verse": verse, "items": items})

print("песен на приёмку: %d, карточек-кандидатов: %d, недостающих PDF: %d"
      % (len(cards), sum(len(c["items"]) for c in cards), missing))
json.dump(cards, io.open(os.path.join(HERE, "review-data.json"), "w", encoding="utf-8"), ensure_ascii=False)
