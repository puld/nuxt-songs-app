# -*- coding: utf-8 -*-
"""Метаданные партитуры из PDF: размер, тональность, заголовок, куплеты.

В первой песне (093) всё это было вписано в генератор руками. Для сборника так
нельзя: размер бывает 4/4, 6/8, 6/4 и 12/8, а тональность — от C до As-dur.
"""
import re, pymupdf, omr, fontmap

DIGITS = {chr(0xF030 + i): str(i) for i in range(10)}
FLAT, SHARP = "", ""
CLEF_G, CLEF_F = "", ""

# порядок знаков при ключе и тоника мажора
SHARP_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "C#"]
FLAT_KEYS  = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]
MINOR = {"C": "Am", "G": "Em", "D": "Bm", "A": "F#m", "E": "C#m", "B": "G#m",
         "F": "Dm", "Bb": "Gm", "Eb": "Cm", "Ab": "Fm", "Db": "Bbm", "F#": "D#m",
         "Gb": "Ebm", "C#": "A#m", "Cb": "Abm"}

def head_glyphs(sy, staff):
    """Глифы нотного шрифта в полосе стана, слева направо."""
    sp = staff["space"]
    return sorted((g for g in sy["glyphs"] if g["fam"] == "maestro"
                   and staff["top"] - 3 * sp < g["y"] < staff["bottom"] + 3 * sp),
                  key=lambda g: g["x"])

def time_signature(sy):
    """Размер: цифры в начале первой системы, числитель над знаменателем.

    Цифра размера — единственное место, где нотный шрифт печатает цифры на стане:
    номера тактов и пальцовка стоят над ним и набраны текстовым шрифтом.

    Ширина столбца считается от межлинейного, а не берётся в пунктах: числитель
    бывает двузначным (12/8 в 1487), вторая его цифра уходила за прежний порог в
    4 pt — и размер читался как 1/8, то есть такт вшестеро короче настоящего.
    Двузначное число шире одной цифры ровно вдвое, а до следующего нотного знака
    дальше, так что запас безопасен.
    """
    staff = sy["treble"]
    mid = (staff["top"] + staff["bottom"]) / 2
    digs = [g for g in head_glyphs(sy, staff) if g["c"] in DIGITS]
    if not digs: return (4, 4) if common_time(sy) else None
    x0 = min(g["x"] for g in digs)
    col = [g for g in digs if g["x"] - x0 < staff["space"] * 2.2]
    up = sorted((g for g in col if g["y"] < mid), key=lambda g: g["x"])
    dn = sorted((g for g in col if g["y"] >= mid), key=lambda g: g["x"])
    if not up or not dn: return None
    return (int("".join(DIGITS[g["c"]] for g in up)),
            int("".join(DIGITS[g["c"]] for g in dn)))

def common_time(sy):
    """Размер, напечатанный символом «C», а не цифрами: это 4/4."""
    return any(g["sem"] == "time_c" for g in head_glyphs(sy, sy["treble"]))

def time_signatures(sy):
    """Все обозначения размера в системе: [(x, (числитель, знаменатель))].

    Размер меняется и посреди песни: в издании Эппа куплет в 4/4, а припев в
    12/8 (112), 9/8 — в 6/8 (165) и так далее; цифры новой доли печатают либо в
    начале такта смены, либо в конце строки — предупреждением о следующей.

    Отбор строже, чем у `time_signature`: цифры должны лежать внутри стана.
    Надстрочная цифра буквенного аккорда («G7») набрана тем же нотным шрифтом,
    но стоит над станом — без вертикального отсева она читалась бы сменой
    размера. Первая система от этого не страдает: там столбец размера тоже
    внутри стана, а у глифовых партитур (664) цифр в этой полосе нет вовсе —
    список пуст, и смен не объявляется.
    """
    staff = sy["treble"]
    mid = (staff["top"] + staff["bottom"]) / 2
    digs = sorted((g for g in head_glyphs(sy, staff) if g["c"] in DIGITS
                   and staff["top"] - 1 < g["y"] < staff["bottom"] + 1),
                  key=lambda g: g["x"])
    out = []
    while digs:
        x0 = digs[0]["x"]
        col = [g for g in digs if g["x"] - x0 < staff["space"] * 2.2]
        digs = [g for g in digs if g["x"] - x0 >= staff["space"] * 2.2]
        up = sorted((g for g in col if g["y"] < mid), key=lambda g: g["x"])
        dn = sorted((g for g in col if g["y"] >= mid), key=lambda g: g["x"])
        if up and dn:
            out.append((x0, (int("".join(DIGITS[g["c"]] for g in up)),
                             int("".join(DIGITS[g["c"]] for g in dn)))))
    return out

def key_signature(sy):
    """Знаки при ключе: от ключа до первой ноты, со знаком по каждой ступени.

    Считаются по столбцам X, а не поштучно: один и тот же знак стоит на обоих
    станах системы, а случайный знак альтерации внутри такта уже правее нот.
    """
    staff = sy["treble"]
    gl = head_glyphs(sy, staff)
    clef = next((g for g in gl if g["c"] in (CLEF_G, CLEF_F)), None)
    if not clef: return 0
    heads = [g for g in gl if g["c"] in (omr.HEAD_F, omr.HEAD_H)]
    right = min((g["x"] for g in heads), default=1e9)
    xs = sorted({round(g["x"], 1) for g in gl
                 if g["c"] in (FLAT, SHARP) and clef["x"] < g["x"] < right})
    if not xs: return 0
    kind = -1 if any(g["c"] == FLAT for g in gl
                     if clef["x"] < g["x"] < right) else 1
    # знаки при ключе идут подряд с шагом около межлинейного расстояния;
    # случайный знак перед нотой стоит заметно дальше от последнего ключевого.
    # Допуск ужат с 2.2 до 1.8: в 1473 диез перед первой нотой строки отстоял
    # от ключа на 2.0 межлинейных и попадал в ключ пятым знаком
    keep = [xs[0]]
    for x in xs[1:]:
        if x - keep[-1] > staff["space"] * 1.8: break
        keep.append(x)
    return kind * len(keep)

def key_name(nsig, tonic=None):
    """Название тональности для ABC: лад берётся по тонике, если она известна.

    Тоника приходит буквой ступени, без знака: в диезных тональностях сама она
    диезная («fis-moll» при трёх диезах), и сравнение целиком с «F#m» не
    совпадало никогда — минор находился только у бемольных ключей. Сравнивать
    достаточно первую букву: тоники мажора и минора одного ключа стоят на
    терцию врозь и одной буквой не бывают.
    """
    major = (SHARP_KEYS if nsig >= 0 else FLAT_KEYS)[abs(nsig)]
    if tonic:
        minor = MINOR.get(major, "")
        if minor and minor[0] == tonic[0]: return minor
    return major


def sign_clusters(gl, space):
    """Знаки альтерации, сгруппированные в столбцы по X."""
    out = []
    for g in sorted(gl, key=lambda g: g["x"]):
        if out and g["x"] - out[-1][-1]["x"] < space * 1.8 and g["sem"] == out[-1][-1]["sem"]:
            out[-1].append(g)
        else: out.append([g])
    return out


def key_changes(sy, xmin=None):
    """Смены ключа посреди системы: [(x, nsig)]. `xmin` — конец первого такта.

    Модуляцию печатают не в начале строки, а там, где она случилась: в 1473
    три диеза стоят перед тактовой чертой в конце такта 20, и разбор, знающий
    только ключ первой системы, читал всю вторую половину песни в прежней
    тональности — на слух фальшиво, хотя суммы длительностей сходятся.

    От случайного знака альтерации ключевой набор отличают два признака сразу:
    знаки идут столбиками подряд и повторены на обоих станах — альтерация
    относится к одной ноте, ключ относится ко всей партитуре. Одного признака
    мало: диез перед нотой в 1473 тоже стоит на обоих станах (ту же ступень
    альтерируют сразу три голоса), а набор из одного знака встречается и как
    ключ, и как случайная альтерация.
    """
    voc = sy.get("vocal") or [sy.get("treble"), sy.get("bass")]
    voc = [s for s in voc if s]
    if len(voc) < 2: return []
    top, bot = voc[0], voc[-1]
    sp = top["space"]
    def band(st):
        return [g for g in sy["glyphs"] if g["sem"] in ("flat", "sharp")
                and st["top"] - 3 * st["space"] < g["y"] < st["bottom"] + 3 * st["space"]]
    hi, lo = band(top), band(bot)
    if not hi: return []
    # ключ в начале строки уже учтён `key_signature`: смена — только правее нот.
    # Головки берутся из полосы своей системы: `glyphs` держит всю страницу, и
    # по ней самая левая головка приезжала из чужой строки — тогда ключ начала
    # строки сам сходил за модуляцию
    heads = [g for g in sy["glyphs"] if g["c"] in (omr.HEAD_F, omr.HEAD_H)
             and top["top"] - 3 * sp < g["y"] < bot["bottom"] + 3 * sp]
    first = min((g["x"] for g in heads), default=0)
    out = []
    for cl in sign_clusters(hi, sp):
        if len(cl) < 2 or cl[0]["x"] < first: continue
        # ключ в начале строки бывает и правее первой головки: у глифовых
        # партитур головка опознаётся другим кодом, и порог по ней не работает.
        # Первая тактовая черта отделяет начало строки надёжнее
        if xmin is not None and cl[0]["x"] < xmin: continue
        kind = cl[0]["sem"]
        # тот же столбец на нижнем стане: партитура меняет ключ целиком
        same = [g for g in lo if g["sem"] == kind
                and any(abs(g["x"] - c["x"]) < sp for c in cl)]
        if len(same) < len(cl): continue
        out.append((cl[0]["x"], (1 if kind == "sharp" else -1) * len(cl)))
    return out

def title(doc):
    """Заголовок: строка самого крупного кегля на первой странице.

    Собирается целиком: издатель разбивает заголовок на несколько фрагментов
    (кернинг), и первый из них — не название, а его первое слово. Знаки
    препинания стоят выше базовой линии слов, поэтому строка ловится с допуском.
    """
    def spans():
        for b in doc[0].get_text("dict")["blocks"]:
            if b["type"] != 0: continue
            for l in b.get("lines", []):
                for sp in l["spans"]:
                    if sp["text"].strip(): yield sp
    best = max((sp["size"] for sp in spans()
                if re.search(r"[А-Яа-яЁё]", sp["text"])), default=None)
    if best is None: return ""
    parts = [sp for sp in spans() if abs(sp["size"] - best) < 0.1]
    y0 = min(sp["bbox"][1] for sp in parts)
    line = sorted((sp for sp in parts if abs(sp["bbox"][1] - y0) < best * 0.6),
                  key=lambda sp: sp["bbox"][0])
    out, prev = "", None
    for sp in line:
        t = sp["text"].strip()
        # зазор шире доли кегля — пробел между словами, а не кернинг внутри слова
        if out and prev is not None and sp["bbox"][0] - prev > best * 0.12: out += " "
        out += t
        prev = sp["bbox"][2]
    # разрядку заголовка (974 набран пробелами вразрядку) схлопываем: на
    # странице это приём набора, а в списке песен — дыры посреди названия
    out = re.sub(r"\s+", " ", out.replace("\xa0", " "))
    out = re.sub(r"\s+([,.!?;:])", r"\1", out)
    out = re.sub(r"([,;:])(?=\S)", r"\1 ", out)
    return re.sub(r"^\d+[\s.]*", "", out).strip()

def split_gaps(toks, gap):
    """Слова строки → подписи: разрыв шире gap разделяет соседние подписи."""
    out = [[toks[0]]]
    for a, b in zip(toks, toks[1:]):
        (out.append([b]) if b[0] - a[2] > gap else out[-1].append(b))
    return out

def text_rows(page, ymax):
    """Строки текста выше ymax: слова, собранные по общей высоте.

    Группировать по верхней кромке слова нельзя: в одной строке соседствуют
    разные кегли («Иоан.4:35» в эпиграфе набран мельче названия), и строка
    распадается надвое, а порядок слов в ней перемешивается.
    """
    # глифы нотного шрифта (метроном, ключевые знаки) приходят той же строкой,
    # что и слова рядом: коды у них из приватной области Unicode, а не буквы
    ws = sorted((w for w in page.get_text("words")
                 if (w[1] + w[3]) / 2 < ymax
                 and not all("\uE000" <= ch <= "\uF8FF" for ch in w[4].strip())),
                key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    rows = []
    for w in ws:
        y = (w[1] + w[3]) / 2
        if rows and y - rows[-1][0] < 5: rows[-1][1].append(w)
        else: rows.append((y, [w]))
    return [(y, sorted(toks, key=lambda w: w[0])) for y, toks in rows]

def character(doc, sy, title_text=""):
    """Указание характера над первой системой («Выразительно», «Andante»).

    Слева над станом печатают и его, и фамилию автора обработки — отличаются они
    сокращениями: «Гарм. ред. Д. Пацюка» рассыпано на слова с точками, а
    характер исполнения пишется словом целиком. Справа стоят только авторы,
    поэтому правая половина не рассматривается вовсе.

    Заголовок отсекается сравнением с ним самим, а не расстоянием: в части
    сборников он стоит вплотную к первой системе, и по одной высоте его от
    указания характера не отличить.
    """
    page = doc[sy["page"]]
    mid = (sy["treble"]["x0"] + sy["treble"]["x1"]) / 2
    for y, toks in text_rows(page, sy["ytop"] - 1):
        if y < sy["ytop"] - 40: continue
        left = [w for w in toks if w[0] < mid]
        # «Александр Рыжов» слева и «Маргарита Колываенко» справа на одной
        # высоте — это авторы слов и музыки, а не характер: он стоит один
        if len(left) != len(toks): continue
        text = [t[4].strip() for t in left]
        if not text or len(text) > 2: continue
        if any(not re.fullmatch(r"[A-Za-zА-Яа-яЁё]{4,}", t) for t in text): continue
        out = " ".join(text)
        if title_text and out.lower() in title_text.lower(): continue
        return out
    return None


def credits(doc, sy, title_text="", char=None):
    """Подписи в шапке: авторы, эпиграф, состав хора — текстом и с выравниванием.

    Разбирать их по смыслу нельзя: слева от заголовка стоит то автор слов, то
    редактор гармонизации, посередине — то эпиграф из Писания («Посмотрите на
    нивы…» в 662), то состав («для смешанного хора S.A.T.B. a cappella» в 752).
    Любая классификация начала бы врать на первом же сборнике, поэтому строки
    переносятся как есть, а место на странице сохраняется выравниванием — по
    нему читатель и узнаёт, где автор, а где эпиграф.
    """
    page = doc[sy["page"]]
    x0s, x1s = sy["treble"]["x0"], sy["treble"]["x1"]
    # выравнивание считается от стана, а не от листа: поля страницы у сборников
    # разные, и подпись у правого края нот на листе оказывается почти по центру
    mid, span = (x0s + x1s) / 2, x1s - x0s
    # номер песни стоит в одной строке с названием и в сам заголовок не входит
    title_words = set(re.findall(r"[^\W\d_]+", (title_text or "").lower()))
    out = []
    for _, row in text_rows(page, sy["ytop"] - 1):
        line = {}
        # автор слов слева и автор музыки справа стоят на одной высоте: это две
        # подписи, а не одна, и склеенными они читались бы как двойная фамилия
        for toks in split_gaps(row, span * 0.12):
            text = fontmap.deglyph(" ".join(t[4] for t in toks).strip())
            # ключевые знаки и цифры размера тоже попадают в текст страницы:
            # букв в них нет, и по этому признаку они отсеиваются вместе с
            # пустыми строками
            if not re.search(r"[^\W\d_]{2,}", text): continue
            if char and text == char: continue
            words = set(re.findall(r"[^\W\d_]+", text.lower()))
            # заголовок сборники печатают вразрядку, и в words он приходит кусками
            if title_words and words <= title_words: continue
            c = (min(t[0] for t in toks) + max(t[2] for t in toks)) / 2
            align = ("center" if abs(c - mid) < span * 0.15
                     else "left" if c < mid else "right")
            line[align] = (line.get(align, "") + " " + text).strip()
        if line: out.append(line)
    return out

# метроном набирают нотными глифами, а не текстом: слева нота-единица (с точкой
# или без), затем знак равенства и число. Цифры у него свои — курсивный набор
# Maestro, не совпадающий с цифрами размера такта, поэтому карта отдельная.
# Неизвестный код лучше вернуть как «метроном не прочитан», чем угадать цифру:
# ошибка в темпе слышна сразу и выглядит как ошибка распознавания нот.
METRO_NOTE = {0x71: (1, 4)}                 # нота-единица; иных в сборниках не встретилось
METRO_DOT = {0x6B}                          # точка при ней
METRO_EQ = 0xC8                             # знак равенства
METRO_DIGIT = {0xBC: "0", 0xA2: "4", 0xA4: "6"}
METRO_DASH = 0x2D                           # «60–64»: диапазон, а не одно число

def dotted(num, den):
    """Нота с точкой: 1/4 → 3/8."""
    return (num * 3, den * 2)

def metronome_glyphs(sy):
    """«♩. = 60–64» над первой системой → (числитель, знаменатель, bpm).

    Из диапазона берётся нижняя граница: она в сборнике и напечатана первой,
    а разброс в четыре удара на слух неразличим.
    """
    row = sorted([g for g in sy["glyphs"]
                  if sy["ytop"] - 50 < g["y"] < sy["ytop"] - 1 and g["fam"] == "maestro"],
                 key=lambda g: g["x"])
    codes = [fontmap.to_byte(g["c"]) for g in row]
    if METRO_EQ not in codes: return None
    i = codes.index(METRO_EQ)
    unit = None
    for c in codes[max(0, i - 3):i]:
        if c in METRO_NOTE: unit = METRO_NOTE[c]
        elif c in METRO_DOT and unit: unit = dotted(*unit)
    if not unit: return None
    digits = ""
    for c in codes[i + 1:]:
        if c == METRO_DASH: break             # дальше верхняя граница диапазона
        if c not in METRO_DIGIT: return None  # неизвестная цифра — молчим, а не врём
        digits += METRO_DIGIT[c]
    return unit + (int(digits),) if digits else None

def tempo(doc, sy):
    """Метроном: сначала нотными глифами, потом — если выписан текстом."""
    got = metronome_glyphs(sy)
    if got: return got
    txt = doc[0].get_text()
    # ноту-единицу печатают и обычным шрифтом, а не нотным: в 1487 «♩. = 60»
    # приходит в текст как «q. = 60» — код тот же, что у нотного глифа, только
    # семейство другое. Точку при этом терять нельзя: в размере 6/8 темп по
    # четверти вместо четверти с точкой играется в полтора раза медленнее
    m = re.search(r"(?<![A-Za-zА-Яа-яЁё])(q\s*\.?)\s*=\s*(\d{2,3})", txt)
    if m: return (dotted(1, 4) if "." in m.group(1) else (1, 4)) + (int(m.group(2)),)
    m = re.search(r"=\s*(\d{2,3})", txt)
    return (1, 4, int(m.group(1))) if m else None
