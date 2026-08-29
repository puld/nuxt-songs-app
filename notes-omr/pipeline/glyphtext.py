# -*- coding: utf-8 -*-
"""Текст из шрифта со своей кодировкой: буква опознаётся по контуру глифа.

Часть сборника свёрстана так, что читать текст обычными средствами нельзя:
шрифт встроен подмножеством, `/Encoding /Differences` раздаёт кодам имена вида
`g17`, а `ToUnicode` издатель не приложил. PyMuPDF в такой ситуации отдаёт коды
как есть (0x02, 0x03, …), и наверху это выглядит не ошибкой, а пустотой:
`meta.title` возвращает пустую строку, `lyrics.collect` не находит ни одного
слога. Молчание хуже падения — файл проходит конвейер и попадает в сборку
безымянным.

Кодировку подмножества угадать нельзя: коды раздаются в порядке появления
глифов в документе, поэтому в соседнем PDF того же издателя те же буквы получат
другие номера. Зашивать таблицу вручную бессмысленно — она верна ровно для
одного файла. Зато сам глиф в документе есть целиком, и **буква опознаётся по
своему контуру**: рисунок «З» остаётся рисунком «З» в любой кодировке.

Эталоны берутся из шрифтов, кодировка которых известна: сначала из других PDF
того же сборника (там `ToUnicode` на месте), затем из системных шрифтов macOS.
Сравнение — по растру: контуры обеих букв заливаются в сетку одного размера и
считается IoU (доля общей площади). Растр, а не набор точек, потому что число и
порядок узлов у разных гарнитур разные, а залитая площадь — нет.

Тем же способом читается и **нотный** шрифт (974): там кодировку не объявляют
по той же причине, а последствия хуже — без неё головки, паузы и точки
длительности не опознаются вовсе, и партитуры не получается никакой. Эталоны
нотных знаков берутся только из сборника: в системных гарнитурах их нет.

Найденная кодировка не переводится наверху, а **дописывается документу**
потоком `ToUnicode` (`prepare`): текст читают полдюжины мест и по-разному, а
кодировка — свойство документа, и чинить её надо там, где она объявлена. Нотный
знак кладётся приватным кодом U+F0xx — ровно тем, что понимает `fontmap`,
поэтому ниже по конвейеру про калибровку никто не знает.
"""
import atexit, glob, io, math, os, re, tempfile
import pymupdf
import fontmap
from fontTools.pens.recordingPen import RecordingPen

# ── растр глифа ──────────────────────────────────────────────────────────────

GRID = 64          # сторона сетки: на 48 «Й» и «И» ещё сливались краем бревиса
STEPS = 8          # на сколько отрезков дробится кривая Безье

def _bezier(p0, pts, steps=STEPS):
    """Кривая Безье (квадратичная или кубическая) отрезками."""
    out = []
    for i in range(1, steps + 1):
        t = i / steps; u = 1 - t
        if len(pts) == 2:
            (x1, y1), (x2, y2) = pts
            out.append((u*u*p0[0] + 2*u*t*x1 + t*t*x2, u*u*p0[1] + 2*u*t*y1 + t*t*y2))
        else:
            (x1, y1), (x2, y2), (x3, y3) = pts[-3:]
            out.append((u**3*p0[0] + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3,
                        u**3*p0[1] + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3))
    return out

def contours(draw):
    """Контуры глифа как замкнутые ломаные. `draw` — объект с методом .draw(pen).

    Кривые дробятся сразу: дальше всё меряется площадью, а не узлами, и разница
    между кубической кривой CFF и квадратичной TrueType должна исчезнуть здесь,
    иначе она полезет в сравнение шрифтов разных форматов.
    """
    rp = RecordingPen()
    draw.draw(rp)
    out, cur = [], []
    for op, args in rp.value:
        if op == "moveTo":
            if len(cur) > 2: out.append(cur)
            cur = [args[0]]
        elif op == "lineTo":
            cur.append(args[0])
        elif op in ("curveTo", "qCurveTo"):
            if cur: cur.extend(_bezier(cur[-1], list(args)))
        elif op == "closePath":
            if len(cur) > 2: out.append(cur)
            cur = []
    if len(cur) > 2: out.append(cur)
    return out

def bbox(cs):
    xs = [p[0] for c in cs for p in c]; ys = [p[1] for c in cs for p in c]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None

def raster(cs, box=None, n=GRID):
    """Заливка контуров в сетку n×n → битовая маска занятых клеток.

    Правило ненулевого обхода, а не «чётное-нечётное»: дырка в «о» у одних
    гарнитур задана обратным обходом, у других — вложенным контуром того же
    направления, и even-odd залил бы вторую насквозь.

    `box` — прямоугольник в единицах шрифта, который натягивается на сетку.
    По умолчанию берётся габарит самого глифа с сохранением пропорций: кегль
    у эталона и у подмножества разный, а форма буквы — нет.

    Маска целым числом, а не множеством клеток: одна буква сравнивается с
    полутора тысячами эталонов, и на множествах калибровка одного файла шла
    минутами, а на `&`/`|` с подсчётом битов идёт секунды.
    """
    if not cs: return 0
    x0, y0, x1, y1 = box or bbox(cs)
    w, h = max(x1 - x0, 1e-6), max(y1 - y0, 1e-6)
    if box is None:                      # квадрат по большей стороне, буква по центру
        s = max(w, h)
        x0 -= (s - w) / 2; y0 -= (s - h) / 2; w = h = s
    edges = []
    for c in cs:
        pts = [((p[0] - x0) / w * n, (p[1] - y0) / h * n) for p in c]
        for a, b in zip(pts, pts[1:] + pts[:1]):
            if a[1] != b[1]: edges.append((a, b))
    out = 0
    for row in range(n):
        yc = row + 0.5
        xs = []
        for a, b in edges:
            if (a[1] <= yc < b[1]) or (b[1] <= yc < a[1]):
                t = (yc - a[1]) / (b[1] - a[1])
                xs.append((a[0] + t * (b[0] - a[0]), 1 if b[1] > a[1] else -1))
        xs.sort()
        wind = 0
        for (xa, d), (xb, _) in zip(xs, xs[1:]):
            wind += d
            if not wind: continue
            ca, cb = max(0, int(xa + 0.5)), min(n, int(xb + 0.5))
            if cb > ca: out |= ((1 << (cb - ca)) - 1) << (row * n + ca)
    return out

def iou(a, b):
    if not a or not b: return 0.0
    return (a & b).bit_count() / (a | b).bit_count()


# ── доступ к встроенным шрифтам ──────────────────────────────────────────────

def _differences(doc, xref):
    """code → имя глифа из /Encoding /Differences (та же разборка, что в glyphstaff)."""
    enc = doc.xref_get_key(xref, "Encoding")
    if not enc or enc[0] == "null": return {}
    if enc[0] == "xref":
        diff = doc.xref_get_key(int(enc[1].split()[0]), "Differences")
    else:
        diff = doc.xref_get_key(xref, "Encoding/Differences")
    if not diff or diff[0] != "array": return {}
    out, code = {}, 0
    for tok in re.findall(r"/([A-Za-z0-9_.]+)|(\d+)", diff[1]):
        if tok[1]: code = int(tok[1])
        else: out[code] = tok[0]; code += 1
    return out

# кодировки, объявленные именем: коды в них осмысленны сами по себе, и
# перекодировать такой шрифт по контурам незачем — см. `_named_encoding`
NAMED_ENCODINGS = ("/WinAnsiEncoding", "/MacRomanEncoding",
                   "/StandardEncoding", "/MacExpertEncoding")

def _named_encoding(doc, xref):
    """Объявлена ли шрифту стандартная кодировка — именем, а не таблицей.

    Именно «именем»: `/Differences` тоже кодировка, но у подмножества она сплошь
    из безымянных `/g1`, `/g2` (974), и семантики из неё не достать.
    """
    try: enc = doc.xref_get_key(xref, "Encoding")
    except Exception: return False
    return bool(enc) and any(e in str(enc[1]) for e in NAMED_ENCODINGS)

def _to_unicode(doc, xref):
    """code → символ из ToUnicode, если издатель его приложил.

    Нужен не для чтения текста (его и без нас читает PyMuPDF), а чтобы у
    соседнего PDF того же сборника взять эталонные контуры букв: там кодировка
    известна, и «А» гарантированно «А».
    """
    tu = doc.xref_get_key(xref, "ToUnicode")
    if not tu or tu[0] != "xref": return {}
    try: data = doc.xref_stream(int(tu[1].split()[0])).decode("latin-1")
    except Exception: return {}
    out = {}
    for blk in re.findall(r"beginbfchar(.*?)endbfchar", data, re.S):
        for src, dst in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk):
            out[int(src, 16)] = chr(int(dst[:4], 16))
    for blk in re.findall(r"beginbfrange(.*?)endbfrange", data, re.S):
        # у диапазона две формы, и вторая (список значений в квадратных скобках)
        # обязательна: именно ею записан Opus в 1473 — единственном файле сборника,
        # где нотный шрифт приехал с честной кодировкой и годится в эталоны
        for lo, hi, arr, dst in re.findall(
                r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:\[(.*?)\]|<([0-9A-Fa-f]+)>)", blk, re.S):
            a, b = int(lo, 16), int(hi, 16)
            if arr:
                vals = re.findall(r"<([0-9A-Fa-f]+)>", arr)
                for i, v in zip(range(a, b + 1), vals): out[i] = chr(int(v[:4], 16))
            else:
                for i in range(a, b + 1): out[i] = chr(int(dst[:4], 16) + i - a)
    return out

def _glyph_set(buf):
    """Встроенный шрифт → (glyphSet, upem). Понимает и CFF, и TrueType."""
    ext, data = buf[1], buf[3]
    if not data: return None, None
    try:
        if ext == "cff":
            from fontTools.cffLib import CFFFontSet
            cff = CFFFontSet(); cff.decompile(io.BytesIO(data), None)
            f = cff[cff.fontNames[0]]
            upem = round(1 / f.FontMatrix[0]) if f.FontMatrix and f.FontMatrix[0] else 1000
            return f.CharStrings, upem
        from fontTools.ttLib import TTFont
        t = TTFont(io.BytesIO(data), fontNumber=0, lazy=True)
        return t.getGlyphSet(), t["head"].unitsPerEm
    except Exception:
        return None, None

def _identity_cid(doc, xref):
    """Составной ли это шрифт, у которого код равен номеру глифа."""
    df = doc.xref_get_key(xref, "DescendantFonts")
    if not df: return False
    if df[0] == "array":
        m = re.search(r"(\d+)\s+\d+\s+R", df[1])
        if not m: return False
        df = ("xref", m.group(1) + " 0 R")
    if df[0] != "xref": return False
    kid = int(df[1].split()[0])
    return doc.xref_get_key(kid, "CIDToGIDMap")[1:2] == ("/Identity",)

def font_glyphs(doc, xref):
    """Встроенный шрифт документа → {код: контуры}, плюс {код: символ} из ToUnicode.

    Имя глифа берётся из /Differences, а если его нет — из cmap самого шрифта:
    TrueType-подмножества Maestro раздают коды через (3,0)-таблицу, и никаких
    /Differences у них нет вовсе.
    """
    try: buf = doc.extract_font(xref)
    except Exception: return {}, {}
    gs, upem = _glyph_set(buf)
    if gs is None: return {}, {}
    names = _differences(doc, xref)
    if not names:
        try:
            from fontTools.ttLib import TTFont
            t = TTFont(io.BytesIO(buf[3]), fontNumber=0, lazy=True)
            for cm in t["cmap"].tables:
                for c, n in cm.cmap.items(): names.setdefault(c & 0xFF, n)
        except Exception: pass
    if not names and _identity_cid(doc, xref):
        # составной шрифт с /CIDToGIDMap /Identity: код в потоке — это прямо
        # номер глифа, а имён в подмножестве нет вовсе (`glyph00007`). Ставить
        # такое соответствие для обычного шрифта нельзя — там порядок глифов
        # с кодами не связан, поэтому признак проверяется, а не предполагается
        try:
            from fontTools.ttLib import TTFont
            t = TTFont(io.BytesIO(buf[3]), fontNumber=0, lazy=True)
            names = dict(enumerate(t.getGlyphOrder()))
        except Exception: pass
    out = {}
    for code, name in names.items():
        try: cs = contours(gs[name])
        except Exception: continue
        if cs: out[code] = [[(x / upem, y / upem) for x, y in c] for c in cs]
    return out, _to_unicode(doc, xref)


# ── эталоны ──────────────────────────────────────────────────────────────────

# гарнитуры macOS, которыми набирают такие сборники; шрифт подмножества почти
# всегда одна из них или их близкий родственник, а IoU выбирает лучшую сам
SYSTEM_FACES = (
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Narrow.ttf",
    "/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/System/Library/Fonts/Palatino.ttc",
    "/System/Library/Fonts/Times.ttc",
)

ALPHABET = ("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
            "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"
            "0123456789"
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
            ".,!?:;-—–()«»\"'*")

# буква меряется от базовой линии, а не по своему габариту: «О» и «о» одинаковы
# по рисунку и различаются только ростом, и габаритная нормировка их склеивает.
# Окно выше прописной: «Й» отличается от «И» только бревисом, а «Ё» от «Е» —
# двумя точками, и обрезанное по высоте прописной окно склеивало обе пары.
EM_BOX = (-0.35, 1.35)          # низ и высота окна в единицах em

def em_raster(cs, n=GRID):
    """Растр в окне, привязанном к базовой линии: сохраняет и рост, и ширину."""
    x0 = min(p[0] for c in cs for p in c) - 0.02
    y0, s = EM_BOX
    return raster(cs, box=(x0, y0, x0 + s, y0 + s), n=n)

def shape_raster(cs, n=GRID):
    """Растр, натянутый на габарит глифа: остаётся только рисунок, без кегля."""
    return raster(cs, box=None, n=n)

_refs = None

def references(alphabet=ALPHABET, extra_pdfs=()):
    """{символ: [(растр формы, растр в em)]} — начертания из шрифтов с известной кодировкой.

    Эталонов на букву несколько: гарнитура подмножества заранее неизвестна, а
    разница между Times и Palatino больше, чем между «б» и «в». Побеждает лучшее
    совпадение, поэтому лишний эталон навредить не может — он лишь не выигрывает.

    Растра два, потому что вопросов тоже два: «что нарисовано» и «какого это
    роста». Порознь ни один не отвечает — см. `decode_font`.
    """
    global _refs
    if _refs is not None: return _refs
    out = {}
    from fontTools.ttLib import TTFont
    for path in SYSTEM_FACES:
        try: t = TTFont(path, fontNumber=0, lazy=True)
        except Exception: continue
        try: cm = t.getBestCmap(); gs = t.getGlyphSet(); upem = t["head"].unitsPerEm
        except Exception: continue
        for ch in alphabet:
            name = cm.get(ord(ch))
            if not name: continue
            try: cs = contours(gs[name])
            except Exception: continue
            if not cs: continue
            cs = [[(x / upem, y / upem) for x, y in c] for c in cs]
            out.setdefault(ch, []).append((shape_raster(cs), em_raster(cs)))
    for p in extra_pdfs:
        try: d = pymupdf.open(p)
        except Exception: continue
        seen = set()
        for pg in d:
            for f in pg.get_fonts(full=True):
                if f[0] in seen: continue
                seen.add(f[0])
                g, uni = font_glyphs(d, f[0])
                for code, ch in uni.items():
                    if ch in alphabet and code in g:
                        out.setdefault(ch, []).append((shape_raster(g[code]), em_raster(g[code])))
        d.close()
    _refs = out
    return out


# ── калибровка кодировки подмножества ────────────────────────────────────────

# буквы, рисунок которых в кириллице и латинице один и тот же: IoU их не
# различает в принципе, и выбирать между ними приходится по остальному шрифту
TWINS = {"А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
         "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X",
         "а": "a", "с": "c", "е": "e", "о": "o", "р": "p", "у": "y", "х": "x"}
LAT2CYR = {v: k for k, v in TWINS.items()}

MIN_SHAPE = 0.45     # ниже — не буква (нотный знак, орнамент, мусор подмножества)
CAND_EPS = 0.25      # насколько эталон вправе отстать от лидера и всё ещё спорить
CAND_MAX = 8         # сколько кандидатов доходит до второго прохода

def _family(cands):
    """Кандидаты плюс их варианты по регистру и письму.

    Первый проход меряет только рисунок, а рисунок у «о» и «О» один и тот же,
    как и у «С» с «C». Родню приходится дописывать руками: в верхушку она может
    и не попасть — из-за одного лишнего эталона нужной гарнитуры.
    """
    out = set(cands)
    for ch in list(cands):
        out.update((ch.lower(), ch.upper()))
        for a in (TWINS.get(ch), LAT2CYR.get(ch)):
            if a: out.update((a, a.lower(), a.upper()))
    return out

def _blank_codes(doc, xref, glyphs):
    """Коды рабочего диапазона шрифта, у которых нет контура."""
    try:
        a = int(doc.xref_get_key(xref, "FirstChar")[1])
        b = int(doc.xref_get_key(xref, "LastChar")[1])
    except Exception: return []
    return [c for c in range(a, b + 1) if c not in glyphs]

# буквы, у которых над корпусом стоит отдельный надстрочный знак: «й» отличается
# от «и» только бревисом, «ё» от «е» — двумя точками, и оба растра слишком грубы,
# чтобы на это опереться (в окне от базовой линии строчная буква занимает десяток
# строк сетки). Зато сам знак виден в контурах прямо: он отделён от корпуса
# просветом. В 974 без этого «зем-ной» читалось как «зем-ноп»
ACCENTED = set("ЙйЁёij")

def has_accent(cs):
    """Есть ли у глифа отдельный надстрочный знак над корпусом.

    Проверяется не «контуров больше одного» (их много у любой буквы с дыркой),
    а разрез по высоте: верхняя группа контуров целиком выше остальных и вдвое
    ниже корпуса. Второе условие обязательно — иначе двоеточие, у которого
    верхняя точка тоже отделена просветом, попадало бы в буквы с бревисом.
    """
    bs = sorted((bbox([c]) for c in cs), key=lambda b: -b[1])
    for k in range(1, len(bs)):
        acc, body = bs[:k], bs[k:]
        if min(b[1] for b in acc) <= max(b[3] for b in body): continue
        ah = max(b[3] for b in acc) - min(b[1] for b in acc)
        bh = max(b[3] for b in body) - min(b[1] for b in body)
        if bh >= 2 * ah: return True
    return False

def _pair_score(r, e, variants):
    """Итоговая близость: среднее геометрическое двух растров.

    Одним ростом решать нельзя. Окно от базовой линии охватывает 1.7 em, и
    строчная буква занимает в нём десяток строк сетки — перекладина «н» и
    верхняя планка «п» на таком масштабе почти неразличимы, и «ной» читалось
    как «поп». Рисунок эту пару различает уверенно (0.78 против 0.71), но сам
    по себе он слеп к росту и склеивает «о» с «О». Произведение отвечает сразу
    на оба вопроса, и ни один кандидат не выигрывает без опоры в рисунке.
    """
    return math.sqrt(max(iou(r, s) for s, _ in variants)
                     * max(iou(e, x) for _, x in variants))

def decode_font(doc, xref, refs=None):
    """Кодировка подмножества: {код: символ}, выведенная из контуров глифов.

    Два прохода, и это главное решение модуля. Сначала сравниваются растры,
    натянутые на габарит глифа, — так вопрос сводится к «что нарисовано», и
    ответ не зависит ни от кегля, ни от того, что в заголовочной гарнитуре
    цифры выше прописных букв (в 664 — 0.89 em против 0.67). Одного прохода
    мало: габаритная нормировка склеивает «о» с «О», а «С» с «C». Поэтому
    верхушка кандидатов проверяется вторым растром — от базовой линии, с
    сохранением роста и ширины, — и он решает вопрос «какого это роста».

    Порядок именно такой, а не наоборот: рост отличает букву от её же двойника,
    но не отличает букву от чужой буквы, и начав с него, мы теряем цифры и
    дефис — у них рост не совпадает ни с одной эталонной гарнитурой.

    Третий шаг — письмо. Кириллица и латиница делят рисунок доброй дюжины букв,
    и IoU между ними бессилен в принципе. По кодам без двойника считается,
    каким письмом набран шрифт, и в кириллическом шрифте латинская «H»
    становится «Н». В сборнике русских песен латинская «H» не встречается
    никогда, но правило всё равно выводится из файла, а не зашито.
    """
    refs = refs or references()
    glyphs, _ = font_glyphs(doc, xref)
    picked, total = {}, 0
    for code, cs in glyphs.items():
        if not cs: continue
        total += 1
        r = shape_raster(cs)
        sc = sorted(((max(iou(r, s) for s, _ in v), ch) for ch, v in refs.items()), reverse=True)
        if not sc or sc[0][0] < MIN_SHAPE: continue
        cands = _family(ch for s, ch in sc[:CAND_MAX] if s >= sc[0][0] - CAND_EPS)
        same = {ch for ch in cands if (ch in ACCENTED) == has_accent(cs)}
        cands = same or cands      # эталона с таким же знаком может и не найтись
        e = em_raster(cs)
        best = max((_pair_score(r, e, refs[ch]), ch) for ch in cands if ch in refs)
        picked[code] = best[1]
    cyr = lat = 0
    for ch in picked.values():
        if ch in TWINS or ch in LAT2CYR: continue
        if "А" <= ch <= "я" or ch in "Ёё": cyr += 1
        elif ch.isascii() and ch.isalpha(): lat += 1
    # правило симметрично, и вторая половина не менее нужна первой: у двойников
    # рисунок совпадает до последней точки, ничью выигрывает тот, кто выше по
    # коду, — то есть всегда кириллица. В нотном сборнике латиницей набраны
    # буквенные обозначения аккордов, и «H7sus4» превращался в «Н7sus4»: строка
    # выглядит как слова песни, и подтекстовку от аккордов уже не отличить
    # код внутри рабочего диапазона шрифта, которому не досталось контура, — это
    # пробел: подмножество вырезает пустой глиф, а ширину в /Widths оставляет.
    # Без этого заголовок 974 приезжал как «ИЗ\x02\x02ПРАХА» — слова слипались,
    # и `meta.title` отдавал строку, которую нельзя ни прочесть, ни сравнить
    if picked:
        for code in _blank_codes(doc, xref, glyphs): picked[code] = " "
    twin = LAT2CYR if cyr > lat else TWINS
    picked = {c: twin.get(ch, ch) for c, ch in picked.items()}
    return picked, total


# ── калибровка нотного шрифта ────────────────────────────────────────────────

# Нотный знак опознаётся так же, как буква, — сравнением контуров с эталоном, но
# эталоны берутся не из системных гарнитур (нотных знаков в macOS нет вовсе), а
# из соседних файлов сборника, где кодировка объявлена честно. Двух источников
# хватает: канонические подмножества Maestro (их коды и есть байты нотной
# кодировки) и Opus из 1473 — тот самый шрифт, которым набран 974, только с
# приложенным ToUnicode. Совпадение по своей же гарнитуре доходит до 0.93, по
# чужой держится около 0.6, и порог разводит их без подгонки.
REF_PDFS = ("../pdf/*.pdf", "../songs/*/*.pdf")

MUSIC_SPAN = 2.0     # сторона окна в em: в него целиком влезает скрипичный ключ
MUSIC_GRID = 128     # мельче сетка — точка длительности вырождается в пиксель

def size_raster(cs, span=MUSIC_SPAN, n=MUSIC_GRID):
    """Растр в окне постоянного размера вокруг центра знака.

    Нотные знаки набирают одним кеглем, и абсолютный размер у них — признак не
    хуже рисунка: точка длительности и нотная головка нарисованы одинаково
    (залитый овал) и различаются только тем, что одна втрое меньше другой.
    Габаритная нормировка (`shape_raster`) эту разницу стирает начисто.
    """
    x0, y0, x1, y1 = bbox(cs)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return raster(cs, box=(cx - span/2, cy - span/2, cx + span/2, cy + span/2), n=n)

def _mfeat(cs):
    """Признаки знака: два растра, число контуров и пропорция."""
    x0, y0, x1, y1 = bbox(cs)
    w, h = x1 - x0, y1 - y0
    return (shape_raster(cs), size_raster(cs), len(cs), w / h if h else 0.0)

def _ref_byte(byte):
    """Байт, под которым знак кладётся в эталоны, — или None, если знак не наш.

    Ключ эталона — байт, а не имя знака: у части знаков кодов несколько
    (точка длительности приезжает и 0x2E, и 0xAA), и приводить их к одному
    надо здесь, иначе один и тот же рисунок попадёт в эталоны дважды под
    разными именами и будет спорить сам с собой.
    """
    if byte in fontmap.CODE: return min(fontmap.SEM[fontmap.CODE[byte]])
    if byte in fontmap.DIGIT: return byte
    return None

def _known_bytes(doc, xref, canonical):
    """{код: байт} для шрифта, кодировка которого известна заранее."""
    from fontTools.agl import toUnicode
    names, uni, out = _differences(doc, xref), _to_unicode(doc, xref), {}
    for code in set(names) | set(uni):
        b = fontmap.to_byte(uni[code]) if code in uni else None
        if b is None and names.get(code):
            try: u = toUnicode(names[code])
            except Exception: u = None
            if u and len(u) == 1: b = fontmap.to_byte(u)
        # у канонического подмножества (Maestro и совместимые) код и есть байт:
        # именно на этом держится весь остальной конвейер, и имя глифа тут не нужно
        if b is None and canonical and code < 0x100: b = code
        if b is not None: out[code] = b
    return out

_mrefs = None

def music_references(patterns=REF_PDFS):
    """{знак: [признаки]} — начертания из нотных шрифтов с известной кодировкой."""
    global _mrefs
    if _mrefs is not None: return _mrefs
    out = {}
    base = os.path.dirname(os.path.abspath(__file__))
    for pat in patterns:
        for path in sorted(glob.glob(os.path.join(base, pat))):
            try: doc = pymupdf.open(path)
            except Exception: continue
            try: music, _ = fontmap.music_fonts(doc)
            except Exception: music = set()
            plain = {m.split("+")[-1] for m in music}
            seen = set()
            for pg in doc:
                for f in pg.get_fonts(full=True):
                    if f[0] in seen: continue
                    seen.add(f[0])
                    glyphs, _ = font_glyphs(doc, f[0])
                    if not glyphs: continue
                    known = _known_bytes(doc, f[0], f[3].split("+")[-1] in plain)
                    for code, b in known.items():
                        key = _ref_byte(b)
                        if key is not None and code in glyphs:
                            out.setdefault(key, []).append(_mfeat(glyphs[code]))
            doc.close()
    # цифры размера такта в нотных шрифтах сборника есть не все (тройки нет ни в
    # одном), поэтому недостающие берутся из текстовых гарнитур: рисунок цифры
    # везде один, а разницу в кегле снимает отдельное правило в `decode_music`
    from fontTools.ttLib import TTFont
    for path in SYSTEM_FACES:
        try: t = TTFont(path, fontNumber=0, lazy=True)
        except Exception: continue
        try: cm = t.getBestCmap() or {}; gs = t.getGlyphSet(); upem = t["head"].unitsPerEm
        except Exception: continue
        for ch in "0123456789":
            name = cm.get(ord(ch))
            if not name: continue
            try: cs = contours(gs[name])
            except Exception: continue
            if cs: out.setdefault(ord(ch), []).append(
                _mfeat([[(x / upem, y / upem) for x, y in c] for c in cs]))
    _mrefs = out
    return out


MIN_MUSIC = 0.45     # порог для знака: своя гарнитура даёт 0.9, чужая 0.6, чужой знак ниже 0.35
MIN_DIGIT = 0.50     # порог для цифры: она сравнивается только по рисунку, и запас меньше
ASPECT_K = 1.4       # во сколько раз пропорция вправе разойтись с эталонной

def _candidates(feat, refs):
    """Эталоны, с которыми знак вообще имеет смысл сравнивать.

    Ворота — число контуров и пропорция. Оба признака от гарнитуры почти не
    зависят, зато разводят пары, на которых растровое сравнение слепо:
    половинная пауза (сплошной кирпич 2.3:1) иначе опознаётся нотной головкой
    (овал 1.3:1) с уверенностью 0.6, а тройка — шестёркой, у которой на один
    контур больше.
    """
    _, _, nc, asp = feat
    lim = math.log(ASPECT_K)
    for key, items in refs.items():
        for r in items:
            if r[2] != nc: continue
            if not asp or not r[3] or abs(math.log(asp / r[3])) > lim: continue
            yield key, r

def _score(feat, ref):
    return math.sqrt(iou(feat[0], ref[0]) * iou(feat[1], ref[1]))

# сплошной прямоугольник и высокий зигзаг: рисунок пауз, эталона которым в
# сборнике нет ни одного. Целую от половинной различает не рисунок (он у них
# общий), а сторона базовой линии: половинная стоит на линейке, целая под ней
# висит — так эти знаки и устроены в любой нотной гарнитуре
REST_MAX_H = 0.25    # высота «кирпича» в em: половина межлинейного
REST_MIN_ASP = 1.6   # он заметно шире своей высоты
TALL_MIN_ASP = 2.2   # четвертная пауза втрое выше своей ширины

def rest_by_shape(cs):
    """Байт паузы, если рисунок глифа не оставляет других вариантов."""
    if len(cs) != 1: return None
    x0, y0, x1, y1 = bbox(cs)
    w, h = x1 - x0, y1 - y0
    if not w or not h: return None
    if h <= REST_MAX_H and w / h >= REST_MIN_ASP:
        return min(fontmap.SEM["rest_h" if y0 >= -0.03 else "rest_w"])
    if h / w >= TALL_MIN_ASP and y0 < -0.05 and y1 > 0.05:
        return min(fontmap.SEM["rest_q"])
    return None

# Точка длительности живёт под двумя кодами, и выбор между ними не косметический:
# 0x2E — это заодно и обычная точка ASCII, поэтому `fontmap.music_fonts` намеренно
# отказывается считать нотным шрифт, где она есть (иначе нотным становился бы Times).
# Отдав точку под 0x2E, мы теряли шрифт-компаньон целиком: в 974 все 58 точек
# оставались без смысла, и каждая нота с точкой читалась на треть короче.
EMIT = {0x2E: 0xAA}

def decode_music(doc, xref, refs=None):
    """Кодировка нотного подмножества: {код: байт нотной кодировки}.

    Знак решается по рисунку и размеру сразу (`_score`), а цифра — только по
    рисунку: в нотной гарнитуре цифры размера такта набраны своим кеглем (0.47 em
    против 0.66 у текстовой), и сравнение по размеру уводило тройку то в двойку,
    то в шестёрку. Рисунок же у цифры один во всех гарнитурах — эталон для неё
    годится любой.

    Паузы разбираются вторым проходом и только у шрифта, который уже опознан
    нотным хотя бы по одному знаку. Эталона паузам в сборнике нет ни одного
    (в канонические подмножества они не попали, в системных гарнитурах их нет),
    поэтому решает рисунок сам по себе — а такое правило слишком легко
    срабатывает на чужом шрифте: в 974 оно принимало за четвертную паузу знаки
    цифрованного баса, и в партитуре появлялись паузы, которых там не печатали.
    """
    refs = music_references() if refs is None else refs
    glyphs, _ = font_glyphs(doc, xref)
    picked, unknown, total = {}, [], 0
    for code, cs in sorted(glyphs.items()):
        if not cs: continue
        total += 1
        feat = _mfeat(cs)
        cands = list(_candidates(feat, refs))
        best = max(((_score(feat, r), b) for b, r in cands), default=(0, None))
        if best[1] is not None and best[1] in fontmap.DIGIT:
            digits = [(iou(feat[0], r[0]), b) for b, r in cands if b in fontmap.DIGIT]
            s, b = max(digits)
            if s >= MIN_DIGIT: picked[code] = b
            else: unknown.append((code, cs))
        elif best[0] >= MIN_MUSIC:
            picked[code] = best[1]
        else:
            unknown.append((code, cs))
    if picked:
        for code, cs in unknown:
            b = rest_by_shape(cs)
            if b is not None: picked[code] = b
    return picked, total


# ── подстановка кодировки в документ ─────────────────────────────────────────

MIN_CODES = 6        # шрифт из пяти глифов — скорее орнамент, чем набор текста
MIN_SHARE = 0.7      # доля опознанных кодов: у нотного шрифта она заведомо ниже
MIN_MUSIC_SHARE = 0.6  # столько же для нотного шрифта: буквы столько знаков не наберут
MUSIC_COMPANION = 4  # больше кодов — уже основной нотный шрифт, а не компаньон

def tables(doc):
    """{xref: {код: символ}} для шрифтов, кодировка которых объявлена не была.

    Разбираются и текстовые шрифты, и нотные, но по-разному, и путать их нельзя
    в обе стороны: подставив нотному шрифту буквенную кодировку, мы превратим
    ноты в текст и разрушим разбор партитуры, а не разобрав его вовсе — оставим
    файл без нот. Порядок проверки «сначала текст, потом ноты» и доля опознанных
    кодов разводят эти случаи: у текстового шрифта буквами оказываются почти все
    коды, у нотного — единицы (головка похожа на «о», но пауз и флажков это не
    спасает).

    Нотный знак кладётся в таблицу приватным кодом U+F0xx: `fontmap.to_byte`
    понимает его напрямую, и после подстановки шрифт опознаётся по опорным
    знакам как любой канонический Maestro — ни `fontmap`, ни `omr` про калибровку
    знать не обязаны.
    """
    try: music, _ = fontmap.music_fonts(doc)
    except Exception: music = set()
    refs, out, seen = references(), {}, set()
    for pg in doc:
        for f in pg.get_fonts(full=True):
            xref, name = f[0], f[3].split("+")[-1]
            if xref in seen: continue
            seen.add(xref)
            if name in music or _to_unicode(doc, xref): continue
            # аккордовый шрифт (OpusChords и родня) перекодировать нельзя: его
            # коды разбирает `chords.SIGN`/`chords.LIGATURES`, где «º» — это
            # dim, а «&» — увеличенный аккорд. В `ALPHABET` таких знаков нет
            # вовсе, и ближайшими по контуру для них оказываются цифры: «Cº»
            # приезжал как «C0», «C&» — как «C1». В сборнике так испортились
            # 325 обозначений, и `CHORD_RE` приложения пропускал их молча.
            # Условие — объявленная кодировка, а не имя шрифта: у 974 тот же
            # OpusChordsStd отдан с `/Differences` из безымянных глифов, и там
            # разбор по контурам как раз единственный способ прочитать знаки.
            # Аккордовый шрифт узнаётся по «Chords» в имени — тем же признаком,
            # что и в `chords.spans`
            if "Chords" in name and _named_encoding(doc, xref): continue
            tab, total = decode_font(doc, xref, refs)
            if len(tab) >= MIN_CODES and total and len(tab) / total >= MIN_SHARE:
                out[xref] = tab
                continue
            tab, total = decode_music(doc, xref)
            if not total or not tab: continue
            # шрифт-компаньон держит две-три штуки (точку длительности, части
            # скобки), и доля на нём ничего не значит; зато `fontmap` признаёт
            # его нотным только когда знакомы **все** его коды, поэтому
            # неопознанный знак получает код, который дальше по конвейеру никем
            # не читается. Для основного шрифта так делать нельзя: там за
            # неопознанным кодом может стоять длительность, и подмена спрятала
            # бы её от сверки сумм
            if total <= MUSIC_COMPANION:
                tab = {c: tab.get(c, min(fontmap.SEM["bracket_top"]))
                       for c in font_glyphs(doc, xref)[0]}
            elif len(tab) / total < MIN_MUSIC_SHARE: continue
            out[xref] = {c: chr(0xF000 + EMIT.get(b, b)) for c, b in tab.items()}
    return out

def cmap_stream(tbl):
    """Таблица кодов → поток ToUnicode.

    Формат подсмотрен у файлов сборника, где ToUnicode на месте: двухбайтовый
    codespacerange и bfchar. Однобайтовый диапазон MuPDF читает так же, но
    держаться ближе к живому образцу дешевле, чем выяснять это заново.
    """
    body = "\n".join("<%04x> <%04x>" % (c, ord(s)) for c, s in sorted(tbl.items()))
    return ("/CIDInit /Procset findresource begin\n12 dict begin\nbegincmap\n"
            "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n"
            "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n"
            "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n"
            "%d beginbfchar\n%s\nendbfchar\nendcmap\n"
            "CMapName currentdict /CMap defineresource pop\nend\nend\n"
            % (len(tbl), body)).encode("latin-1")

def apply_tables(doc, tabs):
    """Дописать шрифтам ToUnicode прямо в документе.

    Почему подстановка в PDF, а не перевод текста наверху: потребителей у текста
    несколько, и читают они его по-разному — `meta.title` через `get_text("dict")`,
    `lyrics.rows_of` через `get_text("words")`, где шрифта в выдаче нет вовсе и
    сопоставить слово с таблицей уже нечем. Кодировка же — свойство документа, и
    чинить её надо там, где она объявлена: после этого текст правильно читают все,
    включая тех, кто про калибровку не знает.

    MuPDF разбирает шрифт один раз и запоминает; документ, который уже читали,
    новую кодировку не подхватит. Поэтому вызывающий обязан открыть заново.
    """
    for xref, tbl in tabs.items():
        if not tbl: continue
        x = doc.get_new_xref()
        doc.update_object(x, "<< /Type /CMap >>")
        doc.update_stream(x, cmap_stream(tbl))
        doc.xref_set_key(xref, "ToUnicode", "%d 0 R" % x)

_prepared = {}

def prepare(path):
    """Путь к документу, у которого кодировка шрифтов объявлена честно.

    Если калибровать нечего — возвращается исходный путь, и файл не трогается
    вовсе. Иначе рядом кладётся временная копия: править файл сборника мы не
    вправе, а держать документ в памяти нельзя — принимающая сторона (`omr.analyse`
    и её подмены) работает с путём, а не с открытым документом.
    """
    key = (os.path.abspath(path), os.path.getmtime(path))
    if key in _prepared: return _prepared[key]
    doc = pymupdf.open(path)
    try: tabs = tables(doc)
    except Exception: tabs = {}
    if not tabs:
        doc.close(); _prepared[key] = path; return path
    apply_tables(doc, tabs)
    fd, tmp = tempfile.mkstemp(prefix="glyphtext-", suffix=".pdf")
    os.close(fd)
    doc.save(tmp); doc.close()
    atexit.register(lambda p=tmp: os.path.exists(p) and os.unlink(p))
    _prepared[key] = tmp
    return tmp


_orig = {}

def patch():
    """Подменить открытие документа так, чтобы текст читался.

    Подменяется `pymupdf.open`, а не `omr.analyse`, хотя образец (`glyphstaff`)
    подменяет именно её. Причина в том, что документ открывают независимо друг
    от друга полдюжины мест — сам `omr.analyse`, её замены в `glyphstaff` и
    `staff974`, вспомогательные функции, — и починка одной точки оставила бы
    остальные с прежней кодировкой. Заодно снимается вопрос порядка вызова
    `patch()`: обёртка вокруг `open` работает независимо от того, кто подменил
    `analyse` до нас и кто подменит после.

    Флаг `_busy` обязателен: `prepare` открывает документ сам, и без него
    обёртка вызвала бы себя же.
    """
    if "open" in _orig: return
    _orig["open"] = pymupdf.open
    def open_(*a, **kw):
        if (len(a) == 1 and not kw and isinstance(a[0], str)
                and a[0].lower().endswith(".pdf") and not _orig.get("busy")
                and os.path.exists(a[0])):
            _orig["busy"] = True
            try: a = (prepare(a[0]),)
            except Exception: pass
            finally: _orig["busy"] = False
        return _orig["open"](*a, **kw)
    pymupdf.open = open_
