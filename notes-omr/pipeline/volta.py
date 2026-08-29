# -*- coding: utf-8 -*-
"""Репризы и вольты: знаки повтора из PDF переносятся в разметку тактов.

Повтор в этих сборниках печатается тремя вещами сразу — двойной тактовой чертой,
парой точек возле неё и скобкой «1.» / «2.» над станом. Ни одну из них по
отдельности брать нельзя: двойная черта стоит и в конце песни, точки нотного
шрифта — те же, что точки длительности, а скобка бывает и без цифры.
"""
import re, omr, fontmap

def dot_bars(page, sy, bars, music):
    """Тактовые черты этой системы, возле которых стоят точки повтора.

    Точка повтора отличается от точки длительности местом: она жмётся к черте и
    приходит парой — над третьей линией стана и под ней.
    """
    gl = [g for g in omr.glyphs_of(page, music)
          if g["sem"] == "dot" and sy["ytop"] - 5 < g["y"] < sy["ybot"] + 5]
    out = set()
    for b in bars:
        near = [g for g in gl if 0 < b - g["x"] < 9]      # точки слева от черты — конец повтора
        if len(near) >= 2: out.add(("end", round(b, 1)))
        near = [g for g in gl if 0 < g["x"] - b < 9]      # справа — начало
        if len(near) >= 2: out.add(("start", round(b, 1)))
    return out

def brackets(page, sy):
    """Скобки вольт над станом: горизонталь с вертикальной ножкой вниз на конце.

    Одной горизонтали мало: в полосу над станом попадает нижняя линия соседней
    системы, и она длиннее любой скобки.
    """
    hor, ver = [], []
    for dr in page.get_drawings():
        for it in dr["items"]:
            if it[0] != "l": continue
            a, b = it[1], it[2]
            if not (sy["ytop"] - 45 < (a.y + b.y) / 2 < sy["ytop"] - 1): continue
            if abs(a.y - b.y) < 0.4 and abs(a.x - b.x) > 25:
                hor.append((min(a.x, b.x), max(a.x, b.x), a.y))
            elif abs(a.x - b.x) < 0.4 and 5 < abs(a.y - b.y) < 30:
                ver.append((a.x, min(a.y, b.y), max(a.y, b.y)))
    out = []
    for x0, x1, y in sorted(set(hor)):
        # ножка спускается от того же уровня к стану. Сторона не важна: скобку
        # рисуют и справа налево (752), и второй ножки у неё может не быть вовсе
        if not any(abs(v[1] - y) < 2 and (abs(v[0] - x0) < 1.5 or abs(v[0] - x1) < 1.5)
                   for v in ver): continue
        out.append((x0, x1))
    return out

def numbers(page, sy, xs):
    """Номер вольты: текст над станом у левого конца скобки.

    Номеров бывает несколько на одну скобку — «1.,2.,3.» означает, что этот
    конец поётся в первых трёх проходах; в ABC они перечисляются через запятую.
    """
    out = {}
    for w in page.get_text("words"):
        nums = re.findall(r"\d+", w[4])
        if not nums or re.search(r"[^\d.,\s]", w[4].strip()): continue
        if not (sy["ytop"] - 45 < (w[1] + w[3]) / 2 < sy["ytop"] - 1): continue
        for x0, _ in xs:
            if -2 < w[0] - x0 < 14: out[x0] = ",".join(nums)
    return out

# словесные указания, которые относятся к музыке, а не к тексту песни. Список
# закрытый: над станом лежат ещё номера вольт, отсылки к куплетам и заголовки,
# и любое «умное» правило тащило бы их вместе с ремарками
# «Припев» — не итальянский термин, а указание строения: в сборнике им
# помечают такт, с которого начинается общая для всех куплетов часть. Оно
# стоит над станом, а слова песни идут между станами, так что за слог его не
# принять; списком закрыт и обратный случай — слово в подтекстовке ремаркой не
# станет, потому что полоса поиска слов другая
REMARK = re.compile(r"(?i)^(fine|d\.?\s?c\.?|d\.?\s?s\.?|da\s?capo|dal\s?segno|al\s?fine"
                    r"|rit\.?|ritard\.?|a\s?tempo|припев|куплет)$")

WORDS = ("fine", "d.c.", "d.s.", "da capo", "dal segno", "al fine", "rit.",
         "ritard.", "a tempo", "припев", "куплет")

def is_remark(t):
    """Ремарка ли это, и если да — в каком написании её печатать.

    Возвращается не исходный текст, а слово из списка: распознанное по контурам
    «Hpuneв» иначе так и уехало бы в партитуру латиницей.
    """
    if REMARK.match(t): return t
    n = t.translate(fontmap.LOOKALIKE).lower()
    # запас на одну букву — только для русских слов: у «fine» и «rit.» двойника
    # нет, а вот «Fin» или «ri.» скорее обрывок чего-то другого
    for w in WORDS:
        if not w.isascii() and fontmap.near(n, w): return w.capitalize()
    return None

def remarks(page, sy, others=()):
    """Ремарки системы → [(x, текст)].

    Ищутся не только над верхним станом: «rit.» ставят там, где есть место, —
    в 119 он лежит между вокальным станом и фортепианным, внутри системы, и при
    поиске только над станом терялся. Полоса поиска шире потому, что список
    ремарок закрытый: слова песни в него не попадают (они по-русски).

    Но зазор между системами бывает уже этой полосы, и тогда одна ремарка
    попадает сразу в две — в 656 «Припев» так удвоился. Спор решается не
    близостью, а смыслом: ремарку печатают над той музыкой, к которой она
    относится, поэтому из двух систем она достаётся нижней. Расстояние тут
    обманывает — в 744 «Припев» лежит на 17 пунктов ниже предыдущей системы и
    на 30 выше своей.
    """
    out = []
    for w in page.get_text("words"):
        t = fontmap.cyr(w[4].strip())
        t = is_remark(t)
        if not t: continue
        y = (w[1] + w[3]) / 2
        if not (sy["ytop"] - 45 < y < sy["ybot"] + 20): continue
        if any(o["ytop"] > sy["ytop"] and o["ytop"] - 45 < y < o["ybot"] + 20
               for o in others): continue
        out.append((w[0], t))
    return out

def apply(doc, syss, sc):
    """Пометки тактов: `volta`, `rep_start`, `rep_end`."""
    music, _ = fontmap.music_fonts(doc)
    n = 0
    prev_v = None                     # вольта, которой кончилась прошлая система
    for si, sy in enumerate(syss):
        it = sc["systems"][si]
        bars = it["bars"]
        it["marks"] = [{"volta": None, "rep_start": False, "rep_end": False}
                       for _ in range(it["nbars"])]
        page = doc[sy["page"]]
        for kind, x in dot_bars(page, sy, bars, music):
            # черта принадлежит такту слева (конец повтора) или справа (начало)
            for bi in range(it["nbars"]):
                if kind == "end" and abs(bars[bi + 1] - x) < 6:
                    it["marks"][bi]["rep_end"] = True; n += 1
                if kind == "start" and abs(bars[bi] - x) < 6:
                    it["marks"][bi]["rep_start"] = True; n += 1
        others = [o for o in syss if o is not sy and o["page"] == sy["page"]]
        for x, text in remarks(page, sy, others):
            # ремарка стоит над нотой, с которой начинается припев, а она бывает
            # затактом внутри такта: в 744 «Припев» садился на начало такта, то
            # есть на шесть восьмых левее напечатанного. Далёкую ремарку по-
            # прежнему забирает такт: над нотой её ставят не всегда — «rit.» в
            # 119 лежит вообще между станами
            evs = [e for bar in it["cells"]["S"] for e in bar if not e["rest"]]
            near = min(evs, key=lambda e: abs(e["x"] - x)) if evs else None
            if near is not None and abs(near["x"] - x) < 25:
                near["text"] = text; n += 1; continue
            for bi in range(it["nbars"]):
                if bars[bi] - 6 <= x <= bars[bi + 1] + 6:
                    it["marks"][bi]["text"] = text; n += 1; break
        xs = brackets(page, sy)
        num = numbers(page, sy, xs)
        for k, (x0, x1) in enumerate(xs):
            if x0 in num: v = num[x0]
            else:
                # скобка без цифры правее размеченной — следующий проход: в 752
                # так набрана последняя вольта при «1.,2.,3.» на предыдущей.
                # Но первая в системе означает другое: вольта не поместилась в
                # строку и продолжается — цифру ей печатают один раз, в начале.
                # В 974 такую скобку код принимал за третий проход, которого в
                # песне нет вовсе, и первая вольта оставалась незакрытой
                seen = [int(p) for x, s_ in num.items() if x < x0 for p in s_.split(",")]
                if seen: v = str(max(seen) + 1)
                elif k == 0 and prev_v: v = prev_v
                else: v = str(k + 1)
            prev_v = v
            for bi in range(it["nbars"]):
                mid = (bars[bi] + bars[bi + 1]) / 2
                if x0 - 3 <= mid <= x1 + 3:
                    it["marks"][bi]["volta"] = v
                    n += 1
    return n
