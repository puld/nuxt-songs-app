# -*- coding: utf-8 -*-
"""Хоровая партитура SATB из PDF: два нотоносца, по два голоса на каждом.

Обобщение конвейера первой песни (093) на сборник: размер, тональность и число
куплетов берутся из самого PDF, такт нарезается по тактовым чертам, а не по
накоплению длительностей — накопление уводит всю систему, стоит одной ноте
распознаться неверно, и найти виновника потом невозможно.
"""
import pymupdf, re, itertools, omr, meta, fontmap

REST = {"rest_w": None, "rest_h": 2.0, "rest_q": 1.0, "rest_8": 0.5, "rest_16": 0.25}  # None = целый такт
VOICES = ("S", "A", "T", "B")
DIA = "CDEFGAB"

def pitch(step, clef):
    base = ("E", 4) if clef == "G" else ("G", 2)
    idx = DIA.index(base[0]) + step
    o = base[1] + (idx // 7 if idx >= 0 else -((-idx + 6) // 7))
    return DIA[idx % 7], o

def dur_of(n):
    # целая проверяется первой: головка у неё открытая, как у половинной, и по
    # `open` она читалась вдвое короче
    d = (4.0 if n.get("whole") else 2.0 if n["open"] else
         # третья вязка — тридцать вторая: в пунктирной фигуре 132 обрубок
         # третьего уровня стоит у одной ноты, и без 0.125 такт не сходился
         (0.5 if n["flags"] == 1 else 0.25 if n["flags"] == 2 else
          0.125 if n["flags"] >= 3 else 1.0))
    return d * (1.5 if n["dot"] else 1.0)

def bars_of(ver, staff, other=None, tol_k=0.3):
    """Границы тактов: вертикаль от верха стана до низа. Близкие схлопнуты в одну.

    Допуск — доля межлинейного, а не пункты: в мелкой печати (752) межлинейное
    4 pt, и прежние «2 pt» покрывали полстана — в черты попадали штили аккордов,
    случайно выросшие в рост стана.

    Черта делит такт у всей системы, поэтому либо пронизывает оба стана, либо
    нарисована на каждом в одном и том же x. У штиля пары на соседнем стане нет.

    Порог схлопывания — от межлинейного расстояния: рядом стоят обе линии двойной
    черты (в конце и у репризы) и скобка в начале системы, а между ними зазор
    доходит до межлинейного. Настоящий такт короче полудюйма не бывает, поэтому
    порог хоть втрое шире зазора никакой черты не съест.
    """
    sp = staff["space"]; tol = sp * tol_k

    def on(st):
        t = st["space"] * tol_k
        return {round(v["x"], 1) for v in ver
                if abs(v["y0"] - st["top"]) < t and abs(v["y1"] - st["bottom"]) < t}

    xs = []
    if other is not None:
        through = {round(v["x"], 1) for v in ver
                   if abs(v["y0"] - staff["top"]) < tol and v["y1"] > other["bottom"] - tol}
        xs = sorted(through | (on(staff) & on(other)))
    if not xs:
        xs = sorted({round(v["x"], 1) for v in ver
                     if abs(v["y0"] - staff["top"]) < tol and v["y1"] > staff["bottom"] - tol})
    out = []
    for x in xs:
        if out and x - out[-1] < sp * 3: continue
        out.append(x)
    return out

def system_bars(sy, staff, other):
    """`bars_of` с левой границей первого такта.

    Такты нарезаются по вертикалям, поэтому первый такт системы опирается на
    начальную черту группы. У одиночного стана (мелодия с буквенными аккордами
    в 1473) такой черты не рисуют вовсе, и первый такт пропадал целиком — вместе
    с началом песни. Границей ему служит левый край самого стана: левее него нот
    не бывает.
    """
    bars = bars_of(sy["ver"], staff, other)
    if len(omr.system_staves(sy)) == 1 and (not bars or bars[0] - staff["x0"] > staff["space"]):
        bars.insert(0, staff["x0"])
    return bars

def through_bars(sy, staff, other):
    """Черты фортепианной системы: только те, что пронизывают оба стана насквозь.

    В хоровой системе черту рисуют на каждом стане отдельно, поэтому `bars_of`
    засчитывает и пару совпавших по x вертикалей — иначе SATB нарезать нечем.
    На фортепиано черта идёт через акколаду целиком, зато штили аккордов легко
    вырастают в полный рост стана и на обоих станах разом: у вступления 119 такая
    пара давала лишние такты. Раз сквозная черта здесь есть всегда, ослабленное
    правило не нужно вовсе.
    """
    tol = staff["space"] * 0.3
    xs = sorted({round(v["x"], 1) for v in sy["ver"]
                 if abs(v["y0"] - staff["top"]) < tol and v["y1"] > other["bottom"] - tol})
    out = []
    for x in xs:
        if out and x - out[-1] < staff["space"] * 3: continue
        out.append(x)
    return out

def in_bar(x, bars, i):
    return bars[i] - 2 <= x < bars[i + 1] - 2

def bar_beats(item, bi, beats):
    """Размер такта в четвертях: после смены размера он у каждого такта свой."""
    bb = item.get("bbeats")
    return bb[bi] if bb and 0 <= bi < len(bb) else beats

def assign_beats(item, start, startts):
    """Раздаёт тактам системы их размер по напечатанным сменам.

    Подпись смены стоит после тактовой черты и левее нот своего такта — значит,
    действует с такта, в котором напечатана. Подпись, правее которой в такте нот
    уже нет (в конце строки, за последней чертой), — предупреждение о следующей
    строке: здесь она не действует, а начинает первый такт следующей системы.
    Каждый такт получает размер в четвертях (`bbeats`) и печатью (`bts`);
    возвращается размер на выходе из системы.
    """
    xs = [e["x"] for v in item["voices"].values() for e in v["events"]] + \
         [r["x"] for v in item["voices"].values() for r in v["rests"]]
    marks, tail = [], None
    for x, t in sorted(item.get("sigs", ())):
        bi = next((i for i in range(item["nbars"]) if in_bar(x, item["bars"], i)), None)
        if bi is not None and any(in_bar(xx, item["bars"], bi) and xx > x for xx in xs):
            marks.append((bi, t))
        else:
            tail = t
    cur, curts, bb, bts = start, startts, [], []
    for i in range(item["nbars"]):
        for bi, t in marks:
            if bi == i: cur, curts = t[0] * 4.0 / t[1], t
        bb.append(cur); bts.append(curts)
    item["bbeats"], item["bts"] = bb, bts
    if tail is not None: cur, curts = tail[0] * 4.0 / tail[1], tail
    return cur, curts

def cluster_x(notes, sp, k=0.6):
    """Головки, стоящие столбиком, — один аккорд.

    Порог в долях межлинейного, а не в пунктах: головки секунды издатель
    сдвигает на свою ширину, и на мелкой печати абсолютный допуск разносит
    аккорд на два события.
    """
    out, cur = [], []
    for n in sorted(notes, key=lambda n: (n["x"], -n["y"])):
        if cur and n["x"] - cur[0]["x"] > k * sp:
            out.append(cur); cur = []
        cur.append(n)
    if cur: out.append(cur)
    return out

def voice_events(notes, direction, sp):
    """События голоса: головки на общем штиле — один аккорд.

    `direction is None` значит «голос на стане один»: у одиночной вокальной
    строки штили идут и вверх, и вниз — по высоте ноты, а не по голосу, и отбор
    по направлению оставил бы от мелодии половину. Тогда события режутся по X, а
    унисонные дубли головок (Finale рисует их дважды) схлопываются в аккорд.

    Заодно снято старое ограничение: ключом события был штиль, и головка без
    штиля (целая нота) роняла разбор обращением к `n["stem"][0]`.
    """
    if direction is None: return cluster_x(notes, sp)
    ev = {}
    for n in notes:
        if n["dir"] != direction or not n.get("stem"): continue
        ev.setdefault((round(n["stem"][0], 1), round(n["stem"][1], 1)), []).append(n)
    out = sorted(ev.values(), key=lambda g: g[0]["x"])
    # у целой ноты штиля нет, а голосов на стане два. Столбик целых — такой же
    # аккорд, как под общим штилем: верхняя головка достаётся верхнему голосу,
    # нижняя нижнему. Одна головка на столбик — унисон, она достаётся обоим:
    # приписать её одному значило бы обречь второй на пропуск такта
    # порог столбика у целых втрое шире обычного: унисон двух голосов печатают
    # не двумя головками в одной точке, а парой рядом («oo», в 029 зазор 2.8
    # межлинейных) — обычный порог отдавал каждому голосу обе, и такт удваивался.
    # Настоящие соседние целые одного голоса дальше: это разные доли такта
    for col in cluster_x([n for n in notes if not n.get("stem") and n["dir"] is None], sp, 3.0):
        col.sort(key=lambda n: n["y"])
        pick = col[0] if direction == "up" else col[-1]
        # унисонная целая достаётся голосу, только если своей ноты в этой точке
        # у него нет: в 050 сопрано ведёт половинные поверх целой альта, и
        # «общая» целая удваивала его такт
        if any(abs(g[0]["x"] - pick["x"]) < 0.8 * sp for g in out): continue
        out.append([pick])
    return sorted(out, key=lambda g: g[0]["x"])

def tuplet_marks(sy, staff, side):
    """Триоли одной стороны стана: [(x0, x1)] — охват каждой группы.

    Триоль печатается мелкой нотной цифрой «3» над или под группой; сторона
    различает голоса — цифра над станом относится к голосу со штилями вверх,
    под станом — вниз. Несвязанную группу дополняет скобка: она рисуется
    обводкой с разрывом под цифру, и охват берётся по её половинкам. У вязаной
    группы скобки нет — охватом служит окно вокруг цифры (полширины настоящих
    триолей ~4.5 межлинейных). «6» встречается у секстолей — доли она сжимает
    так же.

    Отсев чужих цифр: цифры размера стоят внутри стана и сюда не попадают, а
    надстрочную цифру буквенного аккорда («A7») выдаёт буква того же нотного
    шрифта слева на той же строке.
    """
    sp = staff["space"]
    # 5.6 межлинейного, а не 4.5: под нижним голосом цифра отодвинута его
    # низкими нотами, и в 098 стояла в 5.1 межлинейных от стана
    lo, hi = (staff["top"] - 5.6 * sp, staff["top"] - 0.5) if side == "up" else \
             (staff["bottom"] + 0.5, staff["bottom"] + 5.6 * sp)
    # чужой стан режет окно посередине зазора: на плотной странице (010) цифра
    # триоли из-под баса верхней системы иначе доставалась ещё и нашему стану
    for stf in sy.get("pstaves") or omr.system_staves(sy):
        if stf["bottom"] < staff["top"] - 1: lo = max(lo, (stf["bottom"] + staff["top"]) / 2)
        if stf["top"] > staff["bottom"] + 1: hi = min(hi, (staff["bottom"] + stf["top"]) / 2)
    row = [g for g in sy["glyphs"] if g["fam"] == "maestro"]
    out = []
    for g in row:
        if fontmap.to_byte(g["c"]) not in (0x33, 0x36): continue
        if not (lo < g["y"] < hi and g["x"] >= staff["x0"] - 2): continue
        if any(ch is not g and abs(ch["y"] - g["y"]) < 1.5 and 0 < g["x"] - ch["x"] < 12
               and (fontmap.to_byte(ch["c"]) or 0) not in (0x33, 0x36)
               for ch in row):
            continue                     # хвост буквенного аккорда, а не триоль
        half = [s for s in sy.get("strokes", ()) if abs(s[2] - g["y"]) < 1.6 * sp]
        left = [s for s in half if g["x"] - 6 < s[1] < g["x"] + 6]
        right = [s for s in half if g["x"] < s[0] < g["x"] + 14]
        if left and right:
            out.append((min(s[0] for s in left), max(s[1] for s in right)))
        else:
            out.append((g["x"] - 4.6 * sp, g["x"] + 4.6 * sp))
    return out

def single_voice(notes, sp):
    """Стан, на котором выписан один голос, а не два.

    Куплет, который поют в унисон (056), печатают одной строкой нот: столбики
    одиночные, направление штиля выбрано по высоте ноты, а не по голосу.
    Делёж такой строки на два голоса по штилям оставлял каждому обрывки.
    Признак — столбики: у настоящего двухголосия почти в каждом либо две
    головки, либо штили в обе стороны; порог в десятую долю оставляет запас на
    такты, где один из голосов молчит.
    """
    cols = cluster_x(notes, sp)
    if not cols: return False
    both = sum(1 for c in cols
               if len(c) >= 2 or {"up", "dn"} <= {n["dir"] for n in c})
    return both <= len(cols) * 0.1

def rests_of(sy, staff):
    """Паузы стана. Целотактовая висит под четвёртой линейкой, половинная над
    третьей — по высоте их не различить, различает только код глифа."""
    sp = staff["space"]
    # пауза на стане одна, а голосов на нём два: часть издателей печатает её по
    # разу на голос, и в потоке она приходит дважды в одной точке. Дубли схлопнуты,
    # а сама пауза достаётся обоим голосам — она молчание всего стана
    #
    # Полоса шире стана: пауза нижнего голоса печатается ниже средней линии, а при
    # плотной вёрстке (1487) целиком под станом — прежнее окно в одно межлинейное
    # её теряло, и такт недосчитывался длительности. Расширять вслепую нельзя, в
    # зазоре стоит пауза соседнего стана; границей берётся середина зазора — паузу
    # рисуют возле своего стана, а не посередине между чужими
    # 4.2 межлинейного, а не 2.5: в 134 паузы альта опущены на 3 межлинейных
    # под стан — ниже нот, с которыми чередуются. От чужого стана по-прежнему
    # бережёт граница по середине зазора
    lo, hi = staff["top"] - 4.2 * sp, staff["bottom"] + 4.2 * sp
    # границы — по станам всей страницы: полоса расширена до 4.2 межлинейного,
    # и на плотной вёрстке в неё влезал бы стан соседней системы
    for st in sy.get("pstaves") or omr.system_staves(sy):
        if st["bottom"] < staff["top"] - 1: lo = max(lo, (st["bottom"] + staff["top"]) / 2)
        if st["top"] > staff["bottom"] + 1: hi = min(hi, (staff["bottom"] + st["top"]) / 2)
    dots = [g for g in sy["glyphs"] if g["sem"] == "dot"]
    out = {}
    for g in sy["glyphs"]:
        if g["sem"] not in REST: continue
        if not (lo < g["y"] < hi and g["x"] >= staff["x0"] - 2): continue
        d = REST[g["sem"]]
        # точка удлиняет и паузу: она стоит справа от знака на той же высоте
        if d and any(0 < dd["x"] - g["x"] < sp * 2.2 and abs(dd["y"] - g["y"]) < sp for dd in dots):
            d *= 1.5
        out[(round(g["x"], 1), round(g["y"], 1))] = {"x": g["x"], "y": g["y"], "dur": d, "rest": True}
    return sorted(out.values(), key=lambda r: r["x"])

def layout_of(sy):
    """Голоса системы: чей стан и какое направление штиля.

    Хоровая система разложена как прежде — по два голоса на стан, они
    различаются штилями. Одиночная вокальная строка — один голос: он идёт в
    сопрано, потому что шапка ABC фиксирована и петь мелодию будет верхний
    голос. Система без вокальных станов голосов не даёт вовсе, её такты
    заполняются молчанием.
    """
    voc = sy.get("vocal")
    if voc is None:                       # глифовая партитура: разбор геометрии не наш
        return [("S", sy["treble"], "G", "up"), ("A", sy["treble"], "G", "dn"),
                ("T", sy["bass"], "F", "up"), ("B", sy["bass"], "F", "dn")]
    if len(voc) >= 2:
        return [("S", voc[0], "G", "up"), ("A", voc[0], "G", "dn"),
                ("T", voc[-1], "F", "up"), ("B", voc[-1], "F", "dn")]
    if len(voc) == 1:
        return [("S", voc[0], clef_of(sy, voc[0]), None)]
    return []

def clef_of(sy, staff):
    """Ключ стана: у одиночной вокальной строки он бывает и басовым."""
    cl = sorted((g for g in sy["glyphs"] if g["sem"] in ("clef_g", "clef_f")
                 and staff["top"] - 2 * staff["space"] < g["y"]
                 < staff["bottom"] + 2 * staff["space"]),
                key=lambda g: g["x"])
    return "F" if cl and cl[0]["sem"] == "clef_f" else "G"

def build(path):
    """Партитура: такты системы и события четырёх голосов.

    Фортепиано **в ABC не переносится**. Выход конвейера — партия для поющих:
    шапка жёстко задаёт четыре хоровых голоса и `%%score {(S A) | (T B)}`, и
    фортепианная строчка потребовала бы ещё двух голосов со своей группой.
    Главное же — проверять её нечем: критерий правильности разбора здесь «сумма
    длительностей голоса в такте равна размеру», а фортепианная фактура
    (арпеджио, вязки через стан, подмена голосов внутри руки) этой проверке не
    поддаётся, и ошибки в ней остались бы незамеченными. Такты фортепианной
    системы при этом считаются: хор в ней молчит, и без её тактов сбилась бы
    нумерация всей песни.
    """
    # часть сборников набрана не векторами, а самодельным нотным шрифтом (664):
    # там свой разбор станов и нот. Подмена диспетчерская — на векторных файлах
    # вызывается прежняя реализация, поэтому включается один раз на весь конвейер
    import glyphstaff
    glyphstaff.patch()
    # шрифт без объявленной кодировки (664, 974): буквы и нотные знаки опознаются
    # по контурам, найденная кодировка дописывается документу
    import glyphtext
    glyphtext.patch()
    # вёрстка «мелодия + аккомпанемент» (974): длинная скобка вольты — не стан из
    # одной линии, а нижний стан в скрипичном ключе — не второй хоровой
    import staff974
    staff974.patch()
    doc, syss = omr.analyse(path)
    ts = meta.time_signature(syss[0]) or (4, 4)
    beats = ts[0] * 4.0 / ts[1]           # длительность такта в четвертях
    out = []
    cur, curts = beats, ts               # размер, действующий на входе в систему
    for sy in syss:
        voc = sy.get("vocal")
        if voc is not None and not voc and sy.get("piano"):
            # система без вокала (вступление и кода 119): такты считаем по
            # фортепиано, иначе нумерация тактов песни поедет на длину вступления
            bars = through_bars(sy, sy["piano"][0], sy["piano"][-1])
        else:
            bars = system_bars(sy, sy["treble"], sy["bass"])
        item = {"page": sy["page"], "bars": bars, "nbars": max(0, len(bars) - 1),
                "voices": {}, "active": set()}
        for vn, staff, clef, d in layout_of(sy):
            notes, _ = omr.staff_notes(sy, staff, clef)
            # унисонный стан достаётся обоим голосам целиком: куплет, который
            # поют в унисон, выписан одной строкой нот, и делить её по штилям
            # значило бы оставить каждому голосу обрывки
            if d is not None and single_voice(notes, staff["space"]): d = None
            seq = []
            for g in voice_events(notes, d, staff["space"]):
                heads = sorted(g, key=lambda n: -n["y"])
                base = heads[0]
                seq.append({"x": base["x"], "dur": dur_of(base), "rest": False,
                            "beamed": any(n.get("beamed") for n in g),
                            "pitches": [{"p": pitch(h["step"], clef)[0], "o": pitch(h["step"], clef)[1],
                                         "acc": h["acc"], "y": h["y"]} for h in heads]})
            # триоль сжимает напечатанные длительности группы на треть: три
            # восьмых занимают одну четверть. Печатная длительность остаётся в
            # `straight` — ABC пишет триоль прямыми длительностями под «(3», а
            # группа помечается на первом событии. Повторное сжатие исключено
            # меткой: у одиночного голоса цифра бывает и сверху, и снизу
            sides = ("up", "dn") if d is None else (d,)
            for x0, x1 in (m for s in sides for m in tuplet_marks(sy, staff, s)):
                grp = [e for e in seq if x0 - 1 <= e["x"] <= x1 + 1 and "straight" not in e]
                if len(grp) < 2: continue
                for e in grp:
                    e["straight"], e["dur"] = e["dur"], e["dur"] * 2 / 3
                grp[0]["tuplet"] = len(grp)
            item["voices"][vn] = {"events": seq, "rests": rests_of(sy, staff)}
            item["active"].add(vn)
        # голоса, которых в этой системе нет, всё равно должны быть в наличии:
        # дальше по конвейеру партитура обходится по четырём голосам поимённо
        for vn in VOICES:
            item["voices"].setdefault(vn, {"events": [], "rests": []})
        # такт, разорванный переносом строки: система обрывается без правой
        # черты, и хвост такта оставался за последней границей — его ноты не
        # попадали ни в один такт, а первый такт следующей строки выглядел
        # недосчитанным. Хвост получает границу по правому краю стана; с
        # продолжением его свяжет пара внутреннего затакта в `short_pairs`
        tail = [e["x"] for v in item["voices"].values() for e in v["events"]
                if item["bars"] and e["x"] >= item["bars"][-1] - 2]
        if tail:
            item["bars"].append(sy["treble"]["x1"] + 2)
            item["nbars"] += 1
        # пустоту такта `drop_empty` меряет по нотам и паузам вокала: там, где
        # вокала нет вовсе, пусты все такты подряд, и от системы оставалась одна
        # граница. Черты фортепиано уже отобраны сквозными — чистить нечего
        if item["active"]: drop_empty(item)
        # размер тактам раздаётся после чистки границ: раздача привязана к
        # индексам тактов, и более ранняя съехала бы вместе с ними
        item["sigs"] = meta.time_signatures(sy)
        cur, curts = assign_beats(item, cur, curts)
        out.append(item)
    sc = {"systems": out, "ts": ts, "beats": beats,
          "nsig": meta.key_signature(syss[0]), "title": meta.title(doc)}
    for it in out: merge_short(it, sc["beats"])
    # затакты объясняются раньше переменного размера: такт в 3 доли на стыке
    # строк — чаще конец раздела перед затактом, чем такт другого размера, и
    # `var_meter`, взяв его себе, разлучал бы пару. После переразметки затакт и
    # пары пересчитываются: у такта, получившего свой размер, они выглядят иначе
    sc["pickup"] = pickup(sc)
    sc["short"] = short_pairs(sc)
    var_meter(sc)
    sc["pickup"] = pickup(sc)
    sc["short"] = short_pairs(sc)
    meter_marks(sc)
    return doc, syss, sc

def drop_empty(item):
    """Промежуток без единого знака тактом не считается.

    Конец раздела печатается двумя чертами, и вторая отстоит от первой дальше,
    чем линии двойной черты, — расстояние тут не признак, а пустота между ними
    признак верный: в такте всегда есть хотя бы пауза. Убирается правая граница,
    чтобы конец системы остался на месте.
    """
    xs = [e["x"] for v in item["voices"].values() for e in v["events"]] + \
         [r["x"] for v in item["voices"].values() for r in v["rests"]]
    keep, i = list(item["bars"]), 1
    while i < len(keep) - 1:
        if any(keep[i - 1] - 2 <= x < keep[i] - 2 for x in xs): i += 1
        else: del keep[i]
    item["bars"], item["nbars"] = keep, max(0, len(keep) - 1)

def notes_sum(voice, item, bi):
    return sum(e["dur"] for e in voice["events"] if in_bar(e["x"], item["bars"], bi))

def merge_short(item, beats):
    """Слить соседние такты, которые вместе дают ровно размер.

    Конец раздела и повторное окончание печатают лишнюю черту, а первая нота
    следующего такта иногда встаёт левее неё — тогда пустоты между чертами нет и
    по ней такую черту не отличить. Отличает арифметика: настоящий такт полон, а
    пара обрубков полна только вместе.

    Такты разного размера не сливаются: лишняя черта режет один такт, и обе
    половины по определению в одном размере — а пара «конец куплета + начало
    припева» через смену размера полного такта и не должна давать.
    """
    i = 0
    while i < item["nbars"] - 1:
        b1, b2 = bar_beats(item, i, beats), bar_beats(item, i + 1, beats)
        if abs(b1 - b2) > 1e-9: i += 1; continue
        sums = [(staff_sums(item, hi, lo, b, beats), b) for hi, lo in (("S", "A"), ("T", "B"))
                for b in (i, i + 1)]
        short = all(abs(s - b1) > 1e-6 for (pair, _) in sums for s in pair)
        if short:
            merged = dict(item)          # пробная склейка: границу убираем и пересчитываем
            keep = list(item["bars"]); del keep[i + 1]
            merged["bars"], merged["nbars"] = keep, item["nbars"] - 1
            if item.get("bbeats"):
                merged["bbeats"] = item["bbeats"][:i + 1] + item["bbeats"][i + 2:]
            ok = all(abs(s - b1) < 1e-6 for hi, lo in (("S", "A"), ("T", "B"))
                     for s in staff_sums(merged, hi, lo, i, beats))
            if ok:
                item["bars"], item["nbars"] = keep, item["nbars"] - 1
                if item.get("bbeats"): item["bbeats"] = merged["bbeats"]
                if item.get("bts"): del item["bts"][i + 1]
                continue
        i += 1

def split_rests(rests, up, dn, beats):
    """Кому в такте достались паузы: обоим голосам стана или одному.

    Пауза печатается на стане один раз, а молчать может и весь стан, и один
    голос — по картинке это неотличимо, зато отличимо по сумме: правильная
    раздача та, при которой такт сходится у обоих голосов. Перебор дёшев —
    пауз в такте единицы.
    """
    if not rests: return (up, dn)
    best = None
    for mask in itertools.product((0, 1, 2), repeat=len(rests)):
        u, d = up, dn
        for r, m in zip(rests, mask):
            v = beats if r["dur"] is None else r["dur"]        # целотактовая закрывает такт
            if m in (0, 1): u = beats if r["dur"] is None else u + v
            if m in (0, 2): d = beats if r["dur"] is None else d + v
        score = abs(u - beats) + abs(d - beats)
        if best is None or score < best[0]: best = (score, u, d)
    return best[1], best[2]

def staff_sums(item, hi, lo, bi, beats):
    """Суммы долей верхнего и нижнего голоса одного стана в такте.

    `beats` — размер по умолчанию: у построенной системы каждый такт знает свой
    (`bbeats`), и передаваемое значение работает только до раздачи размеров.
    """
    beats = bar_beats(item, bi, beats)
    rs = [r for r in item["voices"][hi]["rests"] if in_bar(r["x"], item["bars"], bi)]
    return split_rests(rs, notes_sum(item["voices"][hi], item, bi),
                       notes_sum(item["voices"][lo], item, bi), beats)

def pickup(sc):
    """Затакт: доли неполного первого такта, иначе 0.

    Неполный такт в начале — не ошибка распознавания, а обычное начало со слабой
    доли; последний такт песни дополняет его до целого, поэтому оба такта
    проверяются по своей мерке, а не по размеру.
    """
    it = sc["systems"][0]
    if not it["nbars"]: return 0.0
    b0 = bar_beats(it, 0, sc["beats"])
    sums = list(staff_sums(it, "S", "A", 0, sc["beats"])) + list(staff_sums(it, "T", "B", 0, sc["beats"]))
    # затакт опознаётся по тому, что первый такт неполон у всех голосов сразу.
    # Молчащий голос мнением не считается: в системе, где поёт одна мелодия,
    # три остальных дают ноль, а в 012 запев затакта поёт один альт при полном
    # составе системы — согласия четырёх не будет никогда, и затакт терялся.
    # Голоса, которые поют, по-прежнему обязаны сойтись на одной сумме
    sums = [x for x in sums if x > 0]
    if not sums: return 0.0
    s = max(sums)
    return s if 0 < s < b0 and len({round(x, 3) for x in sums}) == 1 else 0.0

def bar_sum(sc, si, bi):
    """Длительность такта, если все звучащие голоса согласны, иначе None.

    Молчащий голос мнением не считается: в системе, где поёт одна мелодия,
    остальные дают ноль, и согласия четырёх не было бы никогда.
    """
    it = sc["systems"][si]
    vals = []
    for hi, lo in (("S", "A"), ("T", "B")):
        sums = staff_sums(it, hi, lo, bi, sc["beats"])
        for v, s in zip((hi, lo), sums):
            if notes_sum(it["voices"][v], it, bi): vals.append(round(s, 3))
    return vals[0] if vals and len(set(vals)) == 1 else None

def short_pairs(sc):
    """Внутренние затакты: раздел кончается неполным тактом, следующий им начат.

    В 1473 куплет заканчивается на 4.5 доли из 6, а припев начинается затактом в
    полторы — вместе полный такт, и издатель так и печатает: двойная черта в
    конце строки, следующая строка со слабой доли. Для сумм это два «неверных»
    такта подряд, хотя разбор точен.

    Ищем только на границе систем: раздел начинают с новой строки, а пара
    случайно недосчитанных тактов внутри строки скорее ошибка разбора, чем
    затакт, — на неё сетка должна ругаться, а не молчать.
    """
    out, beats = {}, sc["beats"]
    for si in range(len(sc["systems"]) - 1):
        a, b = sc["systems"][si], sc["systems"][si + 1]
        if not a["nbars"] or not b["nbars"]: continue
        sa, sb = bar_sum(sc, si, a["nbars"] - 1), bar_sum(sc, si + 1, 0)
        if not sa or not sb: continue
        ba, bb = bar_beats(a, a["nbars"] - 1, beats), bar_beats(b, 0, beats)
        # при смене размера на границе полный такт меряется любым из двух:
        # затакт нового раздела дописывают то к старому такту, то к новому
        if sa < ba - 1e-6 and sb < bb - 1e-6 and \
           (abs(sa + sb - ba) < 1e-6 or abs(sa + sb - bb) < 1e-6):
            out[(si, a["nbars"] - 1)] = sa
            out[(si + 1, 0)] = sb
    out.update(section_pairs(sc))
    return out

def section_pairs(sc):
    """Затакты разделов со сменой размера: {(si, bi): ожидаемые доли}.

    Припев в новом размере устроен как целая песня в миниатюре: начинается
    затактом, а его последний такт — он же последний такт песни — неполон ровно
    на этот затакт (112: три восьмых в начале, 4.5 в конце, вместе 12/8).
    Соседство здесь не работает: затакт и его дополнение разделяют все такты
    припева, поэтому пары ищутся по разделам — непрерывным пробегам тактов
    одного размера.

    Когда раздел начат полным тактом, его финалу остаётся дополнять затакт
    самой песни (134: финал 5.5 при затакте 0.5) — доли затакта в четвертях от
    смены размера не меняются. Требование точного дополнения то же, что у
    соседних пар: недосчитанный такт, не сходящийся с затактом, должен остаться
    расхождением.
    """
    flat = [(si, bi) for si, it in enumerate(sc["systems"]) for bi in range(it["nbars"])]
    if not flat: return {}
    runs, start = [], 0
    for i in range(1, len(flat) + 1):
        if i == len(flat) or abs(beats_at(sc, flat[i]) - beats_at(sc, flat[start])) > 1e-9:
            runs.append((start, i - 1)); start = i
    out, up = {}, sc.get("pickup", 0.0)
    for r, (lo, hi) in enumerate(runs):
        if r == 0 or lo == hi: continue          # первый раздел — дело `pickup`
        b = beats_at(sc, flat[lo])
        p1, pf = bar_sum(sc, *flat[lo]), bar_sum(sc, *flat[hi])
        if p1 and pf and 0 < p1 < b - 1e-6 and abs(p1 + pf - b) < 1e-6:
            out[flat[lo]], out[flat[hi]] = p1, b - p1
        elif r == len(runs) - 1 and up and pf and abs(pf + up - b) < 1e-6:
            out[flat[hi]] = b - up
    return out

def beats_at(sc, pos):
    return bar_beats(sc["systems"][pos[0]], pos[1], sc["beats"])

def expected(sc, si, bi, up):
    """Сколько долей ждём в такте: затакт и последний такт — по остатку."""
    short = sc.get("short") or {}
    if (si, bi) in short: return short[(si, bi)]
    it = sc["systems"][si]
    beats = bar_beats(it, bi, sc["beats"])
    if up and si == 0 and bi == 0: return up
    last = len(sc["systems"]) - 1
    if up and si == last and bi == sc["systems"][last]["nbars"] - 1:
        # последний такт дополняет затакт до целого только в его же размере:
        # после смены размера песня заканчивается полным тактом нового
        if abs(beats - bar_beats(sc["systems"][0], 0, sc["beats"])) < 1e-9:
            return beats - up
    return beats

def rest_owners(item, hi, lo, bi, beats):
    """Кому достались паузы такта: тот же перебор, но с ответом по-нотно."""
    beats = bar_beats(item, bi, beats)
    rs = [r for r in item["voices"][hi]["rests"] if in_bar(r["x"], item["bars"], bi)]
    up, dn = notes_sum(item["voices"][hi], item, bi), notes_sum(item["voices"][lo], item, bi)
    best = None
    for mask in itertools.product((0, 1, 2), repeat=len(rs)):
        u, d = up, dn
        for r, m in zip(rs, mask):
            v = beats if r["dur"] is None else r["dur"]
            if m in (0, 1): u = beats if r["dur"] is None else u + v
            if m in (0, 2): d = beats if r["dur"] is None else d + v
        score = abs(u - beats) + abs(d - beats)
        if best is None or score < best[0]: best = (score, mask)
    mask = best[1] if best else ()
    return ([r for r, m in zip(rs, mask) if m in (0, 1)],
            [r for r, m in zip(rs, mask) if m in (0, 2)])

# длины тактов существующих размеров, в четвертях: 2/4, 3/4, 4/4 и 12/8 c
# родственниками. Потерянная точка или лишняя восьмая дают 2.5, 3.5, 5 — таких
# размеров не бывает, и фильтр не даёт принять ошибку разбора за размер
PLAUSIBLE = (2.0, 3.0, 4.0, 4.5, 6.0, 8.0)

def var_meter(sc):
    """Переменный размер, не объявленный печатью.

    В издании Эппа встречаются песни, где часть тактов другой длины, а смены
    размера не напечатано: в 041 такты чередуют 4 и 3 четверти без единого
    обозначения, в 008 объявлено 12/8, а половина тактов — 9/8, в 150 объявлено
    4/4, но почти вся песня трёхдольна. Сверяться с печатью тут не с чем, и
    свидетельством служит единогласие голосов: если все четыре голоса такта
    сходятся на одной сумме, и такая сумма повторяется по песне, это длина
    такта, а не ошибка разбора.

    Защита от маскировки настоящих ошибок тройная: сумма должна быть длиной
    существующего размера (`PLAUSIBLE`), повторяться не меньше трёх раз и не
    реже чем в каждом пятом такте с согласными голосами. Ошибки разбора так
    ровно по всем голосам сразу не ложатся, а согласная, но редкая сумма
    остаётся расхождением — на него сетка и должна ругаться.
    """
    vals, agreed, tot = {}, {}, 0
    for si, it in enumerate(sc["systems"]):
        for bi in range(it["nbars"]):
            v = bar_sum(sc, si, bi)
            if v is None: continue
            tot += 1
            # такт, уже объяснённый затактом или парой, — не свидетельство
            # другого размера: он и не расхождение
            if abs(v - expected(sc, si, bi, sc.get("pickup", 0.0))) < 1e-6: continue
            agreed[(si, bi)] = v
            vals[v] = vals.get(v, 0) + 1
    cand = {v for v, n in vals.items() if v in PLAUSIBLE and n >= 3 and n >= 0.2 * tot}
    for (si, bi), v in agreed.items():
        it = sc["systems"][si]
        if v in cand and abs(v - it["bbeats"][bi]) > 1e-9:
            it["bbeats"][bi] = v
            # печатная форма выводится из знаменателя, что был у такта: доли
            # остаются теми же, меняется их счёт
            den = it["bts"][bi][1]
            num = v * den / 4
            it["bts"][bi] = (int(num), den) if num == int(num) else (int(v * 2), 8)

def meter_marks(sc):
    """Такты, в которых размер сменился: {bi: (числитель, знаменатель)}.

    Считается сквозным проходом по готовым размерам тактов, а не в момент их
    раздачи: смену вносят и напечатанные подписи, и переменный размер, и
    склейка тактов — проще один раз сравнить соседей, чем поддерживать пометки
    в каждом из трёх мест. Из `meterch` смена уходит в ABC внутристрочным
    полем, как смена ключа.
    """
    prev = sc["ts"]
    for it in sc["systems"]:
        it["meterch"] = {}
        for bi in range(it["nbars"]):
            t = it.get("bts", [prev] * it["nbars"])[bi]
            if t != prev:
                it["meterch"][bi] = t
                prev = t

def content(sc):
    """Партитура по голосам и тактам: ноты вперемешку с доставшимися паузами.

    Пауза без длительности (целотактовая) разворачивается в молчание на весь
    такт: в ABC невидимой длины нет, а плееру нужно чем-то занять время.
    """
    for si, it in enumerate(sc["systems"]):
        it["cells"] = {v: [] for v in VOICES}
        for hi, lo in (("S", "A"), ("T", "B")):
            for bi in range(it["nbars"]):
                own = rest_owners(it, hi, lo, bi, sc["beats"])
                for v, rs in zip((hi, lo), own):
                    evs = [e for e in it["voices"][v]["events"] if in_bar(e["x"], it["bars"], bi)]
                    exp = expected(sc, si, bi, sc["pickup"])
                    cell = evs + [dict(r, dur=exp if r["dur"] is None else r["dur"]) for r in rs]
                    if not evs:   # голос молчит весь такт — паузы соседа ему не годятся
                        cell = [{"x": it["bars"][bi], "dur": exp, "rest": True, "silent": True}]
                    it["cells"][v].append(sorted(cell, key=lambda e: e["x"]))
    return sc

def report(path):
    doc, syss, sc = build(path)
    up = sc["pickup"]
    tot = bad = 0
    for si, it in enumerate(sc["systems"]):
        marks, flags, silent = [], {v: [] for v in VOICES}, []
        for hi, lo in (("S", "A"), ("T", "B")):
            for bi in range(it["nbars"]):
                sums = staff_sums(it, hi, lo, bi, sc["beats"])
                e = expected(sc, si, bi, up)
                for v, s in zip((hi, lo), sums):
                    if abs(s - e) < 1e-6: continue
                    # голос без единой ноты в такте молчит: в конце песни партию
                    # обрывают, а паузы дописывают только тому голосу, что ещё поёт
                    if notes_sum(it["voices"][v], it, bi) == 0:
                        silent.append("%s т%d" % (v, bi + 1)); continue
                    flags[v].append("т%d=%g/%g" % (bi + 1, s, e))
        for v in VOICES:
            if flags[v]: marks.append("%s %s" % (v, ",".join(flags[v])))
            bad += len(flags[v])
        tot += it["nbars"]
        tail = ("| " + "; ".join(marks)) if marks else "✓"
        if silent: tail += "  (молчат: %s)" % ", ".join(silent)
        print("  система %d: тактов %d %s" % (si + 1, it["nbars"], tail))
    print("  ИТОГО тактов %d, расхождений %d (размер %d/%d, %s, затакт %g, «%s»)"
          % (tot, bad, sc["ts"][0], sc["ts"][1], meta.key_name(sc["nsig"]), up, sc["title"]))
    return bad

if __name__ == "__main__":
    import sys
    for f in sys.argv[1:]:
        print(f)
        report(f)
