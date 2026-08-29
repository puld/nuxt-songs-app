# -*- coding: utf-8 -*-
"""Слоги куплетов 119 и привязка их к нотам сопрано."""
import re, sys119 as S, choir119 as C

VERSES = 3

def text_chars(page, top, bot):
    """Символы текста между станами: шрифт Maestro отсеиваем по имени, а не по коду."""
    out = []
    for b in page.get_text("rawdict")["blocks"]:
        if b["type"] != 0: continue
        for l in b["lines"]:
            for sp in l["spans"]:
                if "Maestro" in sp["font"]: continue
                for c in sp["chars"]:
                    y = c["origin"][1]
                    if top < y < bot and c["c"].strip():
                        out.append({"c": c["c"], "x0": c["bbox"][0], "x1": c["bbox"][2], "y": y})
    return out

def rows_of(page, sy):
    """Строки текста между хоровыми станами, сверху вниз."""
    top, bot = sy["choir"][0]["bottom"], sy["choir"][1]["top"]
    chars = sorted(text_chars(page, top, bot), key=lambda c: (c["y"], c["x0"]))
    rows, cur = [], []
    for c in chars:
        if cur and c["y"] - cur[0]["y"] > 5:
            rows.append(cur); cur = []
        cur.append(c)
    if cur: rows.append(cur)
    return [sorted(r, key=lambda c: c["x0"]) for r in rows]

def syllables(row):
    """(x центра, слог, слитно_ли_со_следующим) + номер куплета, если он открывает строку.

    Режем по дефисам и по зазорам: PyMuPDF склеивает «ку-ю,» в одно слово, потому что
    слогоделитель стоит вплотную к буквам, — по словам такую строку не разобрать.
    """
    syls, buf, x0, joined = [], "", None, False

    def flush(j):
        nonlocal buf, x0
        if buf:
            syls.append([(x0 + prev_x1) / 2, buf, j])
        buf, x0 = "", None

    prev_x1 = None
    for ch in row:
        c = ch["c"]
        if c in "-\u2010\u2011":
            flush(True); prev_x1 = ch["x1"]; continue
        if buf and prev_x1 is not None and ch["x0"] - prev_x1 > 2.5:
            flush(False)
        if not buf: x0 = ch["x0"]
        buf += c
        prev_x1 = ch["x1"]
    flush(False)

    label = None
    if syls and re.fullmatch(r"(\d)\.", syls[0][1]):
        label = int(syls[0][1][0]); syls = syls[1:]
    return label, syls

def verse_rows(page, sy):
    """{номер куплета или 0 (общее для всех): [слоги]}"""
    rows = rows_of(page, sy)
    parsed = [syllables(r) for r in rows]
    res = {}
    if len(parsed) == 1:
        res[0] = parsed[0][1]                       # припев напечатан один раз на всех
        return res
    for i, (label, syls) in enumerate(parsed):
        res[label or (i + 1)] = syls
    # хвост припева начинается там, где куплетные строки уже кончились
    ends = [max((s[0] for s in syls), default=0) for v, syls in res.items() if v]
    if len(ends) >= 2:
        cutoff = sorted(ends)[-2] + 6
        moved = []
        for v, syls in list(res.items()):
            if not v: continue
            tail = [s for s in syls if s[0] > cutoff]
            if tail and len(tail) < len(syls):
                res[v] = [s for s in syls if s[0] <= cutoff]
                moved = tail
        if moved: res[0] = moved
    return res

def attach(events, syls):
    """Слог -> индекс ноты: границы проходят по серединам между соседними нотами."""
    if not events: return {}
    edges = [(events[i]["x"] + events[i + 1]["x"]) / 2 for i in range(len(events) - 1)]
    out = {}
    for x, text, joined in syls:
        i = 0
        while i < len(edges) and x > edges[i]: i += 1
        out.setdefault(i, []).append((text, joined))
    return out

def build(path="119.pdf"):
    doc, syss, res = C.build(path)
    lines = {v: [] for v in range(1, VERSES + 1)}
    for sy, it in zip(syss, res):
        # система с хоровыми станами, но целотактовыми паузами (вступление) текста не несёт
        if it["silent"] or not it["voices"]["S"]["events"]:
            continue
        vr = verse_rows(doc[sy["page"]], sy)
        evs = it["voices"]["S"]["events"]
        maps = {v: attach(evs, syls) for v, syls in vr.items()}
        for v in range(1, VERSES + 1):
            own = maps.get(v, {})
            common = maps.get(0, {})
            seq = []
            for i in range(len(evs)):
                got = own.get(i) or common.get(i)
                if not got:
                    seq.append("*"); continue
                word = ""
                for k, (text, joined) in enumerate(got):
                    word += text + ("-" if joined else ("~" if k < len(got) - 1 else ""))
                seq.append(word)
            lines[v].append({"first": it["number"], "syls": seq, "bars": it["bars"], "events": evs})
    return doc, syss, res, lines

if __name__ == "__main__":
    doc, syss, res, lines = build()
    for v in range(1, VERSES + 1):
        text = " ".join(" ".join(b["syls"]) for b in lines[v])
        print(f"--- куплет {v}:\n{text}\n")
