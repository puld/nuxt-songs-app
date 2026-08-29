# -*- coding: utf-8 -*-
"""Партитура, набранная глифами: стан, штиль и тактовая черта — не линии, а буквы.

Общий конвейер (`omr.staves_of`, `omr.verticals`) читает нотоносцы и штили из
`page.get_drawings()` — так печатает Finale. Часть сборника свёрстана иначе: в
`664.pdf` вектора нет вовсе, нотоносец набран повтором глифа «кусок стана» шириной
в em, штиль — повтором глифа «отрезок штиля» длиной в межлинейное, тактовая черта
— повтором глифа «черта». На таком файле прежний разбор находит ноль станов и
молча выдаёт пустую партитуру: не падает, а именно молчит, — поэтому проверка
здесь идёт до самого конца, до сумм длительностей по тактам.

Кодировка шрифта самодельная: коды 0x01–0x14, имена в /Differences (GA2, G92)
смысла не несут и в другом файле будут другими. Поэтому таблица кодов не зашита,
а **выводится из контуров встроенного шрифта**: пять параллельных горизонтальных
полос — стан, тонкий вертикальный прямоугольник высотой в межлинейное — отрезок
штиля, и так далее. Оттуда же берётся межлинейное расстояние в единицах шрифта,
и все допуски дальше меряются в нём, а не в пунктах: этот сборник вдвое мельче
Maestro-файлов (межлинейное 4.2 pt против 5.46), и абсолютные пороги из `omr`
здесь не работают ни один.

Что оказалось не так, как ожидалось при первом осмотре файла:
- **головки различают направление штиля кодом**: 0x0B стоит там, где штиль вверх,
  0x09 — где вниз. Полагаться на это всё же нельзя (в другом файле кодировка
  другая), направление берётся геометрически — по тому, с какой стороны головки
  нашлась цепочка отрезков;
- **микро-прямоугольники — это лиги, а не вязки**. Их 2857, размер 0.06 pt, и
  они складываются в серп лиги (наклонная кривая, залитая лесенкой). Вязки же
  здесь — 32 честных параллелограмма из четырёх отрезков, ровно того вида, что
  уже умеет `omr.beams`; ему мешает только порог по ширине: обрубок второй балки
  шестнадцатой шириной в одно межлинейное (4.2 pt) не проходит `5 < width`.

Запуск: `python glyphstaff.py [файл.pdf ...]` (по умолчанию `../pdf/664.pdf`).
"""
import io, re, sys, collections
import pymupdf
from fontTools.cffLib import CFFFontSet
from fontTools.pens.recordingPen import RecordingPen

import omr, meta, satb

DEFAULT_PDF = "../pdf/664.pdf"

# ── шрифт: контуры и таблица кодов ───────────────────────────────────────────

def _contours(charstring):
    """Контуры глифа в единицах шрифта: bbox каждого и число кривых в нём.

    Число кривых отличает залитую фигуру от набора прямоугольников, а число
    контуров — цифру с дырками от сплошного пятна: «8» о двух дырках, «6» об
    одной, головка ноты — без единой.
    """
    rp = RecordingPen(); charstring.draw(rp)
    out, cur, nc = [], [], 0
    def flush():
        if not cur: return
        xs = [p[0] for p in cur]; ys = [p[1] for p in cur]
        out.append({"x0": min(xs), "x1": max(xs), "y0": min(ys), "y1": max(ys),
                    "w": max(xs) - min(xs), "h": max(ys) - min(ys), "nc": nc})
    for op, args in rp.value:
        if op == "moveTo":
            flush(); cur, nc = [args[0]], 0
        elif op == "lineTo": cur.append(args[0])
        elif op in ("curveTo", "qCurveTo"): cur.extend(args); nc += 1
        elif op == "closePath": flush(); cur, nc = [], 0
    flush()
    return out


def _differences(doc, xref):
    """code → имя глифа из /Encoding /Differences шрифта."""
    enc = doc.xref_get_key(xref, "Encoding")
    if not enc or enc[0] == "null": return {}
    if enc[0] == "xref":
        eref = int(enc[1].split()[0])
        diff = doc.xref_get_key(eref, "Differences")
    else:
        diff = doc.xref_get_key(xref, "Encoding/Differences")
    if not diff or diff[0] != "array": return {}
    out, code = {}, 0
    for tok in re.findall(r"/([A-Za-z0-9_.]+)|(\d+)", diff[1]):
        if tok[1]: code = int(tok[1])
        else: out[code] = tok[0]; code += 1
    return out


def _classify(cs, sp):
    """Смысл глифа по его контурам. `sp` — межлинейное в единицах шрифта.

    Пороги в долях межлинейного: это единственная величина, которую страница
    задаёт сама, и от кегля она не зависит.
    """
    if not cs: return None
    x0 = min(c["x0"] for c in cs); x1 = max(c["x1"] for c in cs)
    y0 = min(c["y0"] for c in cs); y1 = max(c["y1"] for c in cs)
    w, h = x1 - x0, y1 - y0
    nc = sum(c["nc"] for c in cs)
    flat = [c for c in cs if c["nc"] == 0]

    def bars(pred): return len(flat) == len(cs) and all(pred(c) for c in cs)

    # стан: пять и больше одинаковых горизонтальных полос с равным шагом
    if len(cs) >= 5 and bars(lambda c: c["h"] < 0.2 * sp and c["w"] > 1.5 * sp):
        mid = sorted((c["y0"] + c["y1"]) / 2 for c in cs)
        step = [b - a for a, b in zip(mid, mid[1:])]
        if max(step) - min(step) < 0.1 * sp: return "staff"
    # вертикали во всю высоту стана: тактовая черта, заключительная или акколада
    if bars(lambda c: c["h"] > 3.5 * sp) and w < 1.5 * sp:
        if len(cs) == 1: return "barline"
        # «тонкая+толстая» — заключительная черта, «толстая+тонкая» — линия акколады
        thick = max(cs, key=lambda c: c["w"]); thin = min(cs, key=lambda c: c["w"])
        return "barline_end" if thick["x0"] > thin["x0"] else "brace"
    # отрезок штиля: тонкий прямоугольник примерно в одно межлинейное
    if len(cs) == 1 and nc == 0 and w < 0.35 * sp and 0.7 * sp < h < 1.6 * sp:
        return "stem_up" if y0 > -0.2 * sp else "stem_dn"
    # добавочная линейка: одиночная горизонталь шире межлинейного
    if len(cs) == 1 and nc == 0 and h < 0.25 * sp and w > 1.5 * sp:
        return "ledger"
    # ключ: крупный знак выше трёх межлинейных
    if h > 3 * sp and w > 1.2 * sp:
        return "clef_g" if y0 < -0.8 * sp else "clef_f"
    # флаг: пятно целиком по одну сторону базовой линии — проверяется РАНЬШЕ знаков
    # альтерации, потому что по габаритам флаг от бемоля не отличить (оба «узкий и
    # высокий»), а вот базовую линию бемоль и бекар всегда пересекают: они стоят
    # на той же высоте, что головка, а флаг свисает со штиля
    if len(cs) == 1 and nc and y0 > 0.3 * sp: return "flag_up"
    if len(cs) == 1 and nc and y1 < -0.3 * sp: return "flag_dn"
    # знак альтерации: узкий и высокий, сидит на базовой линии
    if w < 1.1 * sp and 1.8 * sp < h < 3.5 * sp:
        if nc == 0: return "nat"
        return "flat" if y1 > 1.4 * abs(y0) else "sharp"
    # точка длительности: пятнышко меньше полумежлинейного
    if max(w, h) < 0.5 * sp: return "dot"
    # цифра размера: два межлинейных в высоту, с дырками
    if len(cs) >= 2 and nc and 1.5 * sp < h < 2.6 * sp:
        return "digit%d" % (len(cs) - 1)          # в имени — число дырок
    # головка: одно пятно около базовой линии, шире межлинейного
    if len(cs) == 1 and nc and sp * 0.9 < w < sp * 1.7 and sp * 0.6 < h < sp * 1.3:
        return "head_f"
    return None


def font_tables(doc):
    """Для каждого встроенного CFF: code → смысл, плюс геометрия.

    Межлинейное берётся из глифа стана: он единственный знак, который сам себя
    объясняет — пять полос с равным шагом ни с чем не спутать.
    """
    out = {}
    for xref, ext, _typ, base, _ref, _enc in doc.get_page_fonts(0, full=False):
        if ext != "cff": continue
        try:
            data = doc.extract_font(xref)[3]
            cff = CFFFontSet(); cff.decompile(io.BytesIO(data), None)
        except Exception:
            continue
        td = cff[cff.fontNames[0]]
        unit = td.FontMatrix[0]                  # у этого шрифта 1/2048, а не 1/1000
        names = _differences(doc, xref)
        shapes = {}
        for code, gn in names.items():
            if gn not in td.CharStrings: continue
            shapes[code] = _contours(td.CharStrings[gn])
        # шаг полос глифа стана и есть межлинейное расстояние
        sp = None
        for code, cs in shapes.items():
            if len(cs) < 5: continue
            if any(c["nc"] or c["h"] > 100 or c["w"] < 500 for c in cs): continue
            mid = sorted((c["y0"] + c["y1"]) / 2 for c in cs)
            step = [b - a for a, b in zip(mid, mid[1:])]
            if step and max(step) - min(step) < 20: sp = sum(step) / len(step)
        if sp is None: continue                  # шрифт без стана — не наш случай
        sem = {c: _classify(cs, sp) for c, cs in shapes.items()}
        # смещения линеек стана от базовой линии (вниз по странице — плюс)
        stcode = next(c for c, s in sem.items() if s == "staff")
        lines = sorted(-((c["y0"] + c["y1"]) / 2) * unit for c in shapes[stcode])
        out[base.split("+")[-1]] = {"sem": sem, "shapes": shapes, "unit": unit,
                                    "space_u": sp, "lines": lines,
                                    "holes": {c: len(cs) - 1 for c, cs in shapes.items()}}
    return out


# ── страница: глифы, станы, вертикали, вязки ─────────────────────────────────

def page_glyphs(page, tables):
    """Глифы страницы в формате `omr.glyphs_of`, но со смыслом из таблицы шрифта.

    Коды берутся сырыми: ToUnicode у шрифта нет, и `rawdict` отдаёт байт как есть.
    """
    out = []
    for b in page.get_text("rawdict")["blocks"]:
        if b["type"] != 0: continue
        for l in b["lines"]:
            for sp in l["spans"]:
                t = tables.get(sp["font"].split("+")[-1])
                for c in sp["chars"]:
                    code = ord(c["c"])
                    sem = t["sem"].get(code) if t else None
                    out.append({"fam": "maestro" if t else "text", "c": chr(code), "sem": sem,
                                "code": code, "font": sp["font"],
                                "x": c["origin"][0], "y": c["origin"][1],
                                "bbox": tuple(c["bbox"]), "size": sp["size"],
                                "tab": t})
    return out


def staves_of(glyphs):
    """Станы из глифов «кусок нотоносца», в формате `omr.staves_of`.

    Кусок несёт все пять линеек сразу, поэтому группировать хватает по базовой
    линии: у одного стана она одна на все два десятка кусков.
    """
    seg = [g for g in glyphs if g["sem"] == "staff"]
    rows = collections.defaultdict(list)
    for g in seg: rows[round(g["y"], 1)].append(g)
    out = []
    for y, gs in sorted(rows.items()):
        t = gs[0]["tab"]; size = gs[0]["size"]
        # ink глифа стана лежит ВЫШЕ базовой линии: в шрифте ось y смотрит вверх,
        # на странице — вниз, поэтому смещение линейки прибавляется со своим знаком
        ys = sorted(y + off * size for off in t["lines"])
        xs = sorted(g["x"] for g in gs)
        step = sorted(b - a for a, b in zip(xs, xs[1:]))
        adv = step[len(step) // 2] if step else 0
        out.append({"lines": ys, "top": ys[0], "bottom": ys[-1], "space": (ys[-1] - ys[0]) / 4,
                    "x0": xs[0], "x1": xs[-1] + adv})
    return out


def _chains(items, maxgap):
    """Цепочки повторённых глифов: по общему x, с разрывом больше maxgap."""
    cols = collections.defaultdict(list)
    for g in items: cols[round(g["x"], 1)].append(g["y"])
    out = []
    for x, ys in cols.items():
        ys.sort(); cur = [ys[0]]
        for y in ys[1:]:
            if y - cur[-1] > maxgap: out.append((x, cur)); cur = []
            cur.append(y)
        out.append((x, cur))
    return out


def verticals(glyphs, staves):
    """Штили и тактовые черты в формате `omr.verticals`.

    Штиль — цепочка отрезков с шагом в межлинейное; отрезки перекрываются, но
    разрыв между двумя разными штилями на одном x всегда больше межлинейного
    (иначе это был бы один штиль).

    Тактовая черта набрана так же, но её глиф ростом во весь стан, а стоят они
    сплошняком от верхней линейки верхнего стана до нижней линейки нижнего.
    Черта режется по станам: `satb.bars_of` ищет вертикаль ровно от верха до низа
    **своего** нотоносца, и сквозная через всю систему ей не годится.
    """
    if not staves: return []
    sp = staves[0]["space"]
    out = []
    for sem, dx, y0off, y1off in (("stem_up", 1.19, -1.015, -0.016),
                                  ("stem_dn", 0.04, 0.03, 1.014)):
        for x, ys in _chains([g for g in glyphs if g["sem"] == sem], 1.3 * sp):
            out.append({"x": x + dx * sp, "y0": min(ys) + y0off * sp,
                        "y1": max(ys) + y1off * sp, "kind": sem})
    # тактовые черты: обычная и заключительная. Линия акколады («толстая+тонкая»)
    # сюда не идёт — она стоит левее ключа и дала бы лишний пустой такт
    bars = [g for g in glyphs if g["sem"] in ("barline", "barline_end")]
    xs = collections.defaultdict(list)
    for g in bars: xs[round(g["x"], 1)].append(g["y"])
    for x, ys in xs.items():
        lo, hi = min(ys) - 4.1 * sp, max(ys)
        for st in staves:
            if lo - 1 < st["top"] and st["bottom"] < hi + 1:
                out.append({"x": x, "y0": st["top"], "y1": st["bottom"], "kind": "bar"})
    return out


def beams(page):
    """Вязки: залитый параллелограмм из четырёх отрезков.

    От `omr.beams` отличается только порогом по ширине: обрубок второй балки у
    шестнадцатой шириной ровно в межлинейное (4.2 pt) прежний порог `5 < width`
    отбрасывал, и шестнадцатая читалась восьмой.
    """
    out = []
    for d in page.get_drawings():
        if d.get("type") != "f": continue
        items = d["items"]
        if len(items) not in (3, 4) or any(i[0] != "l" for i in items): continue
        r = d["rect"]
        if 1.5 < r.width < 90 and 0.8 < r.height < 14:
            out.append((r.x0, r.y0, r.x1, r.y1))
    return out


def micro_rects(page):
    """Микро-прямоугольники: заливка лиг, а не вязки.

    Их тут почти три тысячи, высота каждого 0.06 pt (ширина разная — это штрихи
    лесенки), и принять эту россыпь за вязки
    легко — поэтому она считается отдельно. Лиги на длительности не влияют;
    функция нужна, чтобы показать, что к вязкам эти прямоугольники отношения не
    имеют: вязки здесь — 32 честных параллелограмма из четырёх отрезков.
    """
    return [d["rect"] for d in page.get_drawings()
            if d.get("type") == "f" and len(d["items"]) == 1
            and d["items"][0][0] == "re" and d["rect"].height < 0.2]


def analyse(path):
    """То же, что `omr.analyse`, но всё собрано из глифов."""
    doc = pymupdf.open(path)
    tables = font_tables(doc)
    systems = []
    for pno, page in enumerate(doc):
        gl = page_glyphs(page, tables)
        st = staves_of(gl)
        ver = verticals(gl, st)
        bm = beams(page)
        assert len(st) % 2 == 0, "нечётное число станов: %d" % len(st)
        for i in range(0, len(st), 2):
            systems.append({"page": pno, "treble": st[i], "bass": st[i + 1], "glyphs": gl,
                            "ver": ver, "beams": bm, "ytop": st[i]["top"],
                            "ybot": st[i + 1]["bottom"]})
    return doc, systems


# ── ноты одного нотоносца ────────────────────────────────────────────────────

def staff_notes(sy, staff, clef, stem_sp=6):
    """Ноты нотоносца в формате `omr.staff_notes`.

    Повторяет его логику, но все окна заданы в долях межлинейного: в `omr` они в
    пунктах и подогнаны под Maestro, который здесь крупнее в 1.3 раза — ни одно
    из них не срабатывает.
    """
    sp = staff["space"]; half = sp / 2
    lo, hi = staff["top"] - 5 * sp, staff["bottom"] + 5 * sp
    inside = lambda g: lo < g["y"] < hi and g["x"] >= staff["x0"] - 2 * sp
    heads = [g for g in sy["glyphs"] if g["sem"] == "head_f" and inside(g)]
    flags = [g for g in sy["glyphs"] if g["sem"] in ("flag_up", "flag_dn")
             and lo - 3 * sp < g["y"] < hi + 3 * sp]
    dots = [g for g in sy["glyphs"] if g["sem"] == "dot" and inside(g)]
    accs = [g for g in sy["glyphs"] if g["sem"] in ("flat", "sharp", "nat") and inside(g)]
    stems = [v for v in sy["ver"] if v.get("kind", "").startswith("stem")
             and staff["top"] - stem_sp * sp < v["y0"] and v["y1"] < staff["bottom"] + stem_sp * sp]
    bars = sorted({round(v["x"], 1) for v in sy["ver"] if v.get("kind") == "bar"
                   and abs(v["y0"] - staff["top"]) < 1.2})

    pos = {}
    for h in heads: pos.setdefault((round(h["x"], 1), round(h["y"], 1)), []).append(h)

    dotted = set()
    for dd in dots:
        cand = [h for h in heads if abs(dd["y"] - h["y"]) < half * 1.35
                and 0 < dd["x"] - h["x"] < 3.3 * sp]
        if not cand: continue
        near = min(dd["x"] - h["x"] for h in cand)
        for h in cand:
            if dd["x"] - h["x"] <= near + 0.15 * sp: dotted.add(id(h))

    acc_of = {}
    for a in accs:
        cand = [h for h in heads if abs(a["y"] - h["y"]) < 0.4 * sp
                and 0.1 * sp < h["x"] - a["x"] < 2.9 * sp]
        if not cand: continue
        near = min(h["x"] - a["x"] for h in cand)
        for h in cand:
            if h["x"] - a["x"] <= near + 0.15 * sp:
                acc_of[id(h)] = {"flat": "b", "sharp": "#", "nat": "n"}[a["sem"]]

    def find_stem(h, d):
        """Штиль вверх примыкает к правому краю головки, вниз — к левому."""
        if d == "up":
            c = [v for v in stems if v["kind"] == "stem_up"
                 and abs(v["x"] - (h["x"] + 1.19 * sp)) < 0.35 * sp
                 and abs(v["y1"] - h["y"]) < 0.5 * sp]
        else:
            c = [v for v in stems if v["kind"] == "stem_dn"
                 and abs(v["x"] - (h["x"] + 0.04 * sp)) < 0.35 * sp
                 and abs(v["y0"] - h["y"]) < 0.5 * sp]
        return c[0] if c else None

    def beams_at(stem, d):
        """Сколько балок на штиле: у шестнадцатой вторая — короткий обрубок."""
        end = stem["y0"] if d == "up" else stem["y1"]
        n = 0
        for b in sy.get("beams", []):
            if not (b[0] - 0.4 * sp <= stem["x"] <= b[2] + 0.4 * sp): continue
            gap = (b[1] - end) if d == "up" else (end - b[3])
            if b[1] - 0.3 * sp <= end <= b[3] + 0.3 * sp or 0 < gap < 2.2 * sp: n += 1
        return n

    def flags_for(h, d, stem):
        """Флаг стоит на том же x, что головка, и сдвинут на полмежлинейного."""
        if not stem: return 0
        want = "flag_up" if d == "up" else "flag_dn"
        off = 0.5 * sp if d == "up" else -0.5 * sp
        near = [f for f in flags if f["sem"] == want
                and abs(f["x"] - h["x"]) < 0.35 * sp
                and abs(f["y"] - (h["y"] + off)) < 0.35 * sp]
        return len(near) or beams_at(stem, d)

    notes = []
    for group in pos.values():
        h = group[0]
        su, sd = find_stem(h, "up"), find_stem(h, "dn")
        assign = [(d, s) for d, s in (("up", su), ("dn", sd)) if s] or [(None, None)]
        step = round((staff["bottom"] - h["y"]) / half)
        dot = any(id(x) in dotted for x in group)
        acc = next((acc_of[id(x)] for x in group if id(x) in acc_of), None)
        for d, stem in assign:
            beamed = bool(stem) and beams_at(stem, d) > 0
            notes.append({"x": h["x"], "y": h["y"], "step": step, "open": False,
                          "dir": d, "flags": flags_for(h, d, stem), "dot": dot,
                          "beamed": beamed, "acc": acc,
                          "stem": (stem["x"], stem["y0"], stem["y1"]) if stem else None,
                          "unison": len(group) >= 2})
    notes.sort(key=lambda n: (n["x"], -n["y"]))
    return notes, bars


# ── размер и тональность ─────────────────────────────────────────────────────

def _bar_sums(sy):
    """Суммы длительностей по тактам и голосам — сырьё для определения размера."""
    out = []
    for staff, clef in ((sy["treble"], "G"), (sy["bass"], "F")):
        notes, bars = staff_notes(sy, staff, clef)
        for d in ("up", "dn"):
            for i in range(len(bars) - 1):
                s = sum(satb.dur_of(n) for n in notes
                        if n["dir"] == d and bars[i] - 2 <= n["x"] < bars[i + 1] - 2)
                if s: out.append(round(s, 3))
    return out


def time_signature(sy):
    """Размер: знаменатель — по форме цифры, числитель — по арифметике такта.

    Цифры набраны тем же самодельным шрифтом, и что за цифра нарисована, знать
    неоткуда: имя глифа ничего не значит. Зато **число дырок** в цифре считается
    по контурам, а у знаменателя выбор всего из трёх: 2 — без дырок, 4 — с одной,
    8 — с двумя. Числитель после этого выводится из длины такта, а его дырки
    служат сверкой.
    """
    HOLES = {0: 1, 1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 1, 7: 0, 8: 2, 9: 1}
    st = sy["treble"]; mid = (st["top"] + st["bottom"]) / 2
    digs = [g for g in sy["glyphs"] if (g["sem"] or "").startswith("digit")
            and st["top"] - st["space"] < g["y"] < st["bottom"] + st["space"]]
    if not digs: return None
    x0 = min(g["x"] for g in digs)
    col = [g for g in digs if abs(g["x"] - x0) < st["space"]]
    up = [g for g in col if g["y"] < mid]; dn = [g for g in col if g["y"] >= mid]
    if not up or not dn: return None
    den = {0: 2, 1: 4, 2: 8}.get(int(dn[0]["sem"][5:]))
    if not den: return None
    sums = _bar_sums(sy)
    if not sums: return None
    beats = collections.Counter(sums).most_common(1)[0][0]
    num = int(round(beats * den / 4))
    if HOLES.get(num) != int(up[0]["sem"][5:]):
        print("  ! числитель %d не сходится с числом дырок в цифре" % num)
    return num, den


def key_signature(sy):
    """Знаки при ключе: столбцы знаков между ключом и первой головкой."""
    st = sy["treble"]; sp = st["space"]
    gl = sorted((g for g in sy["glyphs"]
                 if st["top"] - 3 * sp < g["y"] < st["bottom"] + 3 * sp), key=lambda g: g["x"])
    clef = next((g for g in gl if g["sem"] in ("clef_g", "clef_f")), None)
    if not clef: return 0
    right = min((g["x"] for g in gl if g["sem"] == "head_f"), default=1e9)
    sig = [g for g in gl if g["sem"] in ("flat", "sharp") and clef["x"] < g["x"] < right]
    xs = sorted({round(g["x"], 1) for g in sig})
    if not xs: return 0
    kind = -1 if any(g["sem"] == "flat" for g in sig) else 1
    keep = [xs[0]]
    for x in xs[1:]:
        if x - keep[-1] > sp * 2.2: break
        keep.append(x)
    return kind * len(keep)


# ── стыковка с общим конвейером ──────────────────────────────────────────────

def is_glyph_score(doc):
    """Набран ли файл глифами: есть шрифт с глифом стана, а векторных станов нет.

    Признак дешёвый и однозначный: у остальных двенадцати PDF каталога станов из
    линий от шести до десяти и ни одного шрифта со станом внутри, у 664 — ровно
    наоборот. Значит выбирать разбор можно автоматически, не по имени файла.
    """
    return bool(font_tables(doc)) and not omr.staves_of(doc[0])


_orig = {}


def patch():
    """Подменить в `omr`/`meta` то, что упирается в векторную вёрстку.

    Подмена, а не правка файлов: `satb.build` вызывает `omr.analyse` и
    `omr.staff_notes` по именам, и этого хватает, чтобы вся верхняя половина
    конвейера (такты, раздача пауз, затакт, сверка сумм) заработала без единого
    изменения в ней. Заодно это и есть ответ на вопрос «какой интерфейс нужен»:
    ровно эти четыре точки.

    Подмена **диспетчерская**: для векторных файлов вызывается прежняя
    реализация. Иначе модуль пришлось бы включать вручную под конкретный файл, а
    так его можно импортировать один раз на весь конвейер.
    """
    if _orig: return
    _orig.update(analyse=omr.analyse, staff_notes=omr.staff_notes,
                 time_signature=meta.time_signature, key_signature=meta.key_signature)

    def analyse_(path):
        doc = pymupdf.open(path)
        glyph = is_glyph_score(doc)
        doc.close()
        if not glyph: return _orig["analyse"](path)
        doc, syss = analyse(path)
        for sy in syss: sy["glyph"] = True      # метка для остальных трёх точек
        return doc, syss

    def staff_notes_(sy, staff, clef, stem_sp=6):
        f = staff_notes if sy.get("glyph") else _orig["staff_notes"]
        return f(sy, staff, clef, stem_sp)

    omr.analyse = analyse_
    omr.staff_notes = staff_notes_
    meta.time_signature = lambda sy: (time_signature if sy.get("glyph")
                                      else _orig["time_signature"])(sy)
    meta.key_signature = lambda sy: (key_signature if sy.get("glyph")
                                     else _orig["key_signature"])(sy)


def build(path):
    patch()
    return satb.build(path)


# ── отчёт ────────────────────────────────────────────────────────────────────

def describe(path):
    """Числа про вёрстку файла: чем набраны стан, штиль, вязка, черта."""
    doc = pymupdf.open(path)
    tables = font_tables(doc)
    page = doc[0]
    gl = page_glyphs(page, tables)
    cnt = collections.Counter(g["sem"] for g in gl if g["sem"])
    print("шрифты со станом:", ", ".join(tables))
    for name, t in tables.items():
        print("  %s: em=1/%g, межлинейное %g единиц" % (name, 1 / t["unit"], round(t["space_u"])))
        print("  таблица кодов:", ", ".join("%02X=%s" % (c, s)
                                            for c, s in sorted(t["sem"].items()) if s))
    st = staves_of(gl)
    print("станов %d, межлинейное %.2f pt, ширина %.1f pt"
          % (len(st), st[0]["space"], st[0]["x1"] - st[0]["x0"]))
    print("глифы:", ", ".join("%s×%d" % (k, v) for k, v in sorted(cnt.items())))
    ver = verticals(gl, st)
    print("штилей %d, тактовых вертикалей %d"
          % (sum(1 for v in ver if v["kind"].startswith("stem")),
             sum(1 for v in ver if v["kind"] == "bar")))
    bm = beams(page)
    full = [b for b in bm if b[2] - b[0] > 2 * st[0]["space"]]
    print("вязок %d (из них обрубков второй балки %d), микро-прямоугольников (лиги) %d"
          % (len(bm), len(bm) - len(full), len(micro_rects(page))))
    doc.close()


def report(path):
    doc = pymupdf.open(path)
    glyph = is_glyph_score(doc)
    doc.close()
    if not glyph:                      # векторный файл разбирает прежний конвейер
        patch(); satb.report(path); return None, 0
    describe(path)
    doc, syss, sc = build(path)
    print("систем %d, размер %d/%d, %s, затакт %g"
          % (len(sc["systems"]), sc["ts"][0], sc["ts"][1], meta.key_name(sc["nsig"]), sc["pickup"]))
    bad = tot = 0
    for si, it in enumerate(sc["systems"]):
        marks = []
        for hi, lo in (("S", "A"), ("T", "B")):
            for bi in range(it["nbars"]):
                sums = satb.staff_sums(it, hi, lo, bi, sc["beats"])
                e = satb.expected(sc, si, bi, sc["pickup"])
                for v, s in zip((hi, lo), sums):
                    if abs(s - e) < 1e-6: continue
                    if satb.notes_sum(it["voices"][v], it, bi) == 0: continue
                    marks.append("%s т%d=%g/%g" % (v, bi + 1, s, e)); bad += 1
        tot += it["nbars"]
        print("  система %d: тактов %d %s" % (si + 1, it["nbars"], "; ".join(marks) or "✓"))
    print("ИТОГО тактов %d, расхождений %d" % (tot, bad))
    satb.content(sc)
    return sc, bad


def dump(sc, sysno=0):
    """Расшифровка одной системы по голосам — для сверки с картинкой."""
    it = sc["systems"][sysno]
    NAMES = {0.25: "16", 0.5: "8", 0.75: "8.", 1.0: "4", 1.5: "4.", 2.0: "2", 3.0: "2."}
    for v in satb.VOICES:
        line = []
        for bi, cell in enumerate(it["cells"][v]):
            part = []
            for e in cell:
                d = NAMES.get(round(e["dur"], 3), "%g" % e["dur"])
                if e.get("rest"): part.append("z" + d)
                else:
                    p = e["pitches"][0]
                    part.append("%s%s%d/%s" % (p["p"], p["acc"] or "", p["o"], d))
            line.append(" ".join(part))
        print("  %s | %s" % (v, " | ".join(line)))


def render(path, out, sysno=0, dpi=170):
    """Первая система картинкой — сверять распознанное глазами."""
    doc, syss = analyse(path)
    sy = syss[sysno]
    page = doc[sy["page"]]
    sp = sy["treble"]["space"]
    clip = pymupdf.Rect(sy["treble"]["x0"] - 6 * sp, sy["ytop"] - 6 * sp,
                        sy["treble"]["x1"] + 3 * sp, sy["ybot"] + 6 * sp)
    page.get_pixmap(clip=clip, dpi=dpi).save(out)
    doc.close()
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")] or [DEFAULT_PDF]
    for f in args:
        print(f)
        sc, _ = report(f)
        if sc:
            print("система 1 по голосам:")
            dump(sc, 0)
