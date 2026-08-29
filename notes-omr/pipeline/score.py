# -*- coding: utf-8 -*-
"""Сборка партитуры из PDF: ноты, лиги, слова -> структура для ABC."""
import pymupdf, re, json, collections
exec(open("omr.py").read().split('if __name__')[0])

DIA = "CDEFGAB"
def pitch(step, clef):
    base = ("E", 4) if clef == "G" else ("G", 2)
    idx = DIA.index(base[0]) + step
    oct_ = base[1] + (idx // 7 if idx >= 0 else -((-idx + 6) // 7))
    return DIA[idx % 7], oct_

def ties_of(page):
    out = []
    for d in page.get_drawings():
        r, items = d["rect"], d["items"]
        curvy = any(i[0] == "c" for i in items)
        poly = len(items) > 20 and all(i[0] == "l" for i in items)
        if (curvy or poly) and 5 < r.width < 80 and 1 < r.height < 14:
            out.append({"x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1, "used": False})
    return out

def system_bars(sy):
    tr = sy["treble"]
    return sorted({round(v["x"], 1) for v in sy["ver"]
                   if abs(v["y0"] - tr["top"]) < 1.5 and v["y1"] > tr["bottom"] - 1.5})

def dur_of(n):
    d = 2.0 if n["open"] else (0.5 if n["flags"] == 1 else (0.25 if n["flags"] >= 2 else 1.0))
    return d * (1.5 if n["dot"] else 1.0)

def voice_events(notes, direction):
    ev = {}
    for n in notes:
        if n["dir"] != direction: continue
        ev.setdefault((round(n["stem"][0], 1), round(n["stem"][1], 1)), []).append(n)
    return sorted(ev.values(), key=lambda g: g[0]["x"])

def build(path="093.pdf"):
    doc, systems = analyse(path)
    ties = {p: ties_of(doc[p]) for p in range(len(doc))}
    score = {"voices": {v: [] for v in "SATB"}, "systems": []}
    for sy in systems:
        bars = system_bars(sy)
        info = {"page": sy["page"], "bars": bars, "voices": {}}
        for vname, staff, clef, d in (("S", sy["treble"], "G", "up"), ("A", sy["treble"], "G", "dn"),
                                      ("T", sy["bass"], "F", "up"),   ("B", sy["bass"], "F", "dn")):
            notes, _ = staff_notes(sy, staff, clef)
            evs = voice_events(notes, d)
            seq = []
            for i, g in enumerate(evs):
                heads = sorted(g, key=lambda n: -n["y"])          # снизу вверх
                base = heads[0]
                item = {"x": base["x"], "dur": dur_of(base),
                        "pitches": [{"p": pitch(h["step"], clef)[0], "o": pitch(h["step"], clef)[1],
                                     "acc": h["acc"], "y": h["y"]} for h in heads],
                        "tie": False,
                        "beamed": any(n.get("beamed") for n in g)}
                seq.append(item)
            # лиги: соседние события одной высоты, между ними дуга
            for i in range(len(seq) - 1):
                a, b = seq[i], seq[i + 1]
                if [(p["p"], p["o"]) for p in a["pitches"]] != [(p["p"], p["o"]) for p in b["pitches"]]:
                    continue
                ay = a["pitches"][0]["y"]
                for t in ties[sy["page"]]:
                    if t["used"]: continue
                    if a["x"] - 3 < (t["x0"] + t["x1"]) / 2 < b["x"] + 8 and abs((t["y0"] + t["y1"]) / 2 - ay) < 3.2 * staff["space"]:
                        a["tie"] = True; t["used"] = True; break
            info["voices"][vname] = seq
        score["systems"].append(info)
    return doc, systems, score

def lyrics(doc, systems):
    """Слова по системам: {метка куплета: [(x, слог, слитно_со_следующим)]}.

    Номер куплета в PDF стоит на 1-2 pt ниже своих слов, поэтому строки
    собираются кластеризацией по y, а не округлением. На второй странице
    номеров нет вовсе — там продолжается припев, и метки наследуются от
    строк, начинавшихся в правой части предыдущей системы.
    """
    per_sys, carried = [], []
    for sy in systems:
        page = doc[sy["page"]]
        top, bot = sy["treble"]["bottom"], sy["bass"]["top"]
        ws = []
        for w in page.get_text("words"):
            if not (top < (w[1] + w[3]) / 2 < bot): continue
            t = w[4].strip()
            if not t or t in ("Score", "Припев"): continue
            # в words попадают и глифы Maestro (нотные головки, PUA U+F0xx):
            # они непустые и образуют строки-призраки, съедающие метки куплетов
            if any("\uE000" <= c <= "\uF8FF" for c in t): continue
            if not re.search(r"[А-Яа-яЁё\d]", t): continue
            ws.append((w[1], w[0], w[2], t))
        ws.sort()
        rows, cur = [], []
        for w in ws:                                  # кластеризация строк по y
            if cur and w[0] - cur[0][0] > 5:
                rows.append(cur); cur = []
            cur.append(w)
        if cur: rows.append(cur)

        # строки припева стоят правее и всего на 2-3 pt выше куплетных, поэтому
        # попадают в один кластер: режем кластер по номерам — номер открывает строку
        split_rows = []
        for row in rows:
            toks = sorted(row, key=lambda t: t[1])
            cuts = [i for i, t in enumerate(toks)
                    if i > 0 and re.match(r"^\d+(?:-\d+)?\.", t[3])]
            prev = 0
            for c in cuts + [len(toks)]:
                if toks[prev:c]: split_rows.append(toks[prev:c])
                prev = c
        rows = split_rows

        parsed, unlabeled = [], []
        for row in rows:
            toks = sorted(row, key=lambda t: t[1])
            label = None
            m = re.match(r"^(\d+(?:-\d+)?)\.$", toks[0][3])
            if m:
                label = m.group(1); toks = toks[1:]
            else:
                m2 = re.match(r"^(\d+(?:-\d+)?)\.(.+)$", toks[0][3])
                if m2:
                    label = m2.group(1)
                    toks = [(toks[0][0], toks[0][1], toks[0][2], m2.group(2))] + toks[1:]
            if not toks: continue
            syls = []
            for _, x0, _, t in toks:
                if t in ("-", "\u2010"):
                    if syls: syls[-1][2] = True
                    continue
                joined = t.endswith("-")
                syls.append([x0, t[:-1] if joined else t, joined])
            if not syls: continue
            (parsed if label else unlabeled).append((label, syls, min(s[0] for s in syls)))

        if unlabeled and carried:                     # строки без номеров = продолжение припева
            for i, (_, syls, x) in enumerate(unlabeled):
                if i < len(carried):
                    parsed.append((carried[i], syls, x))

        verses = {}
        for label, syls, _ in parsed:
            verses.setdefault(label, []).extend(syls)
        for k in verses: verses[k].sort(key=lambda s: s[0])

        right = [p for p in parsed if p[2] > (sy["treble"]["x0"] + sy["treble"]["x1"]) / 2]
        if right: carried = [p[0] for p in right]
        per_sys.append(verses)
    return per_sys

def expand(label):
    if "-" in label:
        a, b = label.split("-"); return list(range(int(a), int(b) + 1))
    return [int(label)]

if __name__ == "__main__":
    doc, systems, score = build()
    ly = lyrics(doc, systems)
    for si, info in enumerate(score["systems"]):
        s = info["voices"]["S"]
        print(f"--- система {si+1}: S {len(s)} событий, лиг {sum(1 for e in s if e['tie'])}; "
              f"куплеты в тексте: {sorted(ly[si].keys(), key=lambda k: k.split('-')[0])}")
    tot = {v: sum(len(i['voices'][v]) for i in score['systems']) for v in 'SATB'}
    print("событий всего:", tot)
    print("лиг всего:", {v: sum(1 for i in score['systems'] for e in i['voices'][v] if e['tie']) for v in 'SATB'})
