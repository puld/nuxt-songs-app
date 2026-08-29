# -*- coding: utf-8 -*-
"""Аккорды из нот в эталонный текст: `{Am}` перед слогом в `songs-data/songs/NNNN.txt`.

Цепочка та же, на которой держится раскладка: аккорд в ABC стоит перед нотой,
нота — позиция в строке `w:`, позиция `w:` — слог эталона. Новое здесь одно —
слог надо вернуть **на его место в исходном файле**, а не в пересобранный из
слогов текст: `.txt` хранит слова, строки и пунктуацию, и пересборка их потеряет.

Поэтому модуль не угадывает, какую трактовку текста выбрала сборка (куплет или
куплет с припевом, повтор свёрнутый или развёрнутый, эхо в скобках снято или
нет), а **перебирает те же трактовки** и требует, чтобы получившаяся
последовательность слогов совпала со сборкой токен в токен. Не совпала ни одна —
песню импорт не трогает. Совпадение — проверка, а не догадка.

Трактовки применяются к символам, а не к строкам: у каждого слога остаётся его
координата в исходном файле, даже если по дороге из строки вырезали маркер
повтора или эхо в скобках.

Развёрнутый повтор даёт **несколько** копий одной строки файла, и гармония в
проходах расходится: у Эппа второй проход выписан вольтой со своей гармонией.
Поэтому копия помечается номером прохода, а аккорд, пришедший от неё, пишется
`{2:Dm}` — «звучит во втором проходе». Раньше на этом месте песня отклонялась
целиком с причиной «разные аккорды на один слог»: координата у копий общая, а
имена аккордов разные.
"""
import io, os, re, sys, contextlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import align

CHORD = re.compile(r"\{[^}]*\}")


# --- аккорды из ABC --------------------------------------------------------

def notes_with_chords(abc, voice="S"):
    """[аккорд или None] по тому же счёту нот, что и `voice_slots`."""
    lines, grab = [], False
    for line in abc.splitlines():
        if line.startswith("V:"):
            grab = line[2:].split()[0] == voice; continue
        if grab and line and not line.startswith(("w:", "%", "X:", "T:", "K:")):
            lines.append(line)
    m = " ".join(lines)
    m = re.sub(r"![^!]*!", " ", m)          # динамика: !mf! нотой не является
    m = align.INLINE.sub(" ", m)
    out, pend, i = [], None, 0
    while i < len(m):
        q = re.match(r'"([^"]*)"', m[i:])
        if q:
            t = q.group(1)
            if not t.startswith("^"): pend = t   # «^Припев» — аннотация, не аккорд
            i += len(q.group(0)); continue
        note = align.NOTE.match(m, i)
        if note:
            if not re.match(r"^[zZxX]", note.group(0)):
                out.append(pend); pend = None
            i = note.end(); continue
        i += 1
    return out


def hand_rows(abc):
    """Строки подтекстовки `w:` — по одной на куплет."""
    return [l[2:].strip() for l in abc.splitlines() if l.startswith("w:")]


def chords_by_syllable(abc, verse_index=0):
    """{номер звучащего слога: аккорд} для куплета `verse_index`.

    Шаблон берётся у своей строки `w:` — растяжка слога у куплетов разная, — а
    если она не подошла по длине, у первой: так же выбирает и `align.build`.
    """
    hand = hand_rows(abc)
    if not hand: return None
    ch = notes_with_chords(abc)
    tpl = align.hand_template(hand[0])
    if len(tpl) != len(ch): return None
    own = align.hand_template(hand[verse_index]) if verse_index < len(hand) else None
    if own and len(own) == len(tpl): tpl = own
    out, j = {}, 0
    for k, kind in enumerate(tpl):
        if kind != "syl": continue
        if ch[k]: out[j] = ch[k]
        j += 1
    return out


# --- эталон с координатами -------------------------------------------------

def read_source(num):
    """Строки файла плюс разбор на строфы с сохранением номеров строк.

    `align.read_reference` координаты теряет — он их и не должен знать; здесь же
    без них некуда вставлять.
    """
    p = os.path.join(align.ROOT, "songs-data/songs/%04d.txt" % num)
    raw = io.open(p, encoding="utf-8").read()
    lines = raw.split("\n")
    body = len(lines)
    m = re.search(r"^@meta", raw, re.M)                  # мета к тексту не относится
    if m: body = raw[:m.start()].count("\n")
    verses, chorus, cur, in_chorus = {}, [], None, False
    for i, line in enumerate(lines[:body]):
        t = line.strip()
        if not t or t.startswith("#"): continue
        if re.match(r"^Припев:?$", t, re.I): in_chorus, cur = True, None; continue
        if re.match(r"^\([а-яa-zA-ZА-Я0-9]{1,3}\)$", t): continue
        off = len(line) - len(line.lstrip())
        vm = re.match(r"^(\d+)\.\s*", t)
        if vm:
            in_chorus = False
            cur = int(vm.group(1))
            verses[cur] = [(i, off + vm.end(), t[vm.end():])]
            continue
        (chorus if in_chorus else verses.setdefault(cur, [])).append((i, off, t))
    if None in verses:
        rest = verses.pop(None)
        if not verses and rest: verses[1] = rest
    return raw, lines, verses, chorus


# Те же трактовки, что в `align`, но вырезаемые части здесь не удаляются из
# строки, а помечаются: координаты остальных символов должны уцелеть
OPEN_RE = re.compile(r"^\s*/\s*")
CLOSE_RE = re.compile(r"\s*/\s*\d*\s*р?\.?\s*$")
COUNT_RE = re.compile(r"/\s*(\d+)\s*р\.?\s*$")
ECHO_RE = re.compile(r"\s*\([^)]*\)")


def chars_of(li, off, text):
    """Строка как символы с их местом в файле: (символ, строка, позиция)."""
    return [(c, li, off + i) for i, c in enumerate(text)]


def _text(row):
    return "".join(c for c, _, _ in row)


def _cut(row, spans):
    """Убрать участки, оставив координаты уцелевших символов."""
    keep = [True] * len(row)
    for a, b in spans:
        for i in range(a, b): keep[i] = False
    return [ch for ch, k in zip(row, keep) if k]


def drop_echo(row):
    """Эхо-подголоски в скобках поёт другой голос — слогов эталона они не дают."""
    return _cut(row, [(m.start(), m.end()) for m in ECHO_RE.finditer(_text(row))])


def strip_marks(row):
    """Снять разметку повтора: `/` в начале и `/Nр.` в конце — это не слова."""
    s = _text(row)
    spans = []
    m = OPEN_RE.match(s)
    if m: spans.append((0, m.end()))
    m = CLOSE_RE.search(s)
    if m: spans.append((m.start(), m.end()))
    return _cut(row, spans)


def _mid_open(row):
    """Координата слеша, открывающего повтор посреди строки, или None.

    Единственный слеш до счётчика — открывающий: строка вида «…есть в Нём.
    /Глас у твоих дверей… /2р.» (песня 338). Слешей больше одного — границы
    повтора не разобрать, и тег снимается целиком.
    """
    s = _text(row)
    m = CLOSE_RE.search(s)
    body = s[:m.start()] if m else s
    if body.count("/") != 1: return None
    i = body.index("/")
    return (row[i][1], row[i][2])


def _inner_slash(row):
    """Есть ли в строке слеш, кроме открывающего в начале и счётчика в конце.

    Такой слеш значит, что границы повтора не совпадают с границами строк:
    в песне 338 повтор открывается посреди строки («…есть в Нём. /Глас у твоих
    дверей…»), а `expand_repeats` размножает строку целиком. Проходы у начала
    строки тогда чужие: `lib/repeats.js` их не повторяет, и линтер по делу
    бракует «пометку прохода вне повтора». Сюда же попадают вложенные повторы
    (`//`, второй счётчик в строке) — их эта функция не моделирует, как и
    `align.expand_repeats`.

    Копии остаются, снимается только тег: пометки не будет, и песня в худшем
    случае отклонится по-старому — «разные аккорды на один слог».
    """
    s = _text(row)
    m = CLOSE_RE.search(s)
    if m: s = s[:m.start()]
    m = OPEN_RE.match(s)
    if m: s = s[m.end():]
    return "/" in s


def expand_repeats(rows):
    """Развернуть повтор `/ … /Nр.` в подряд идущие строки — как `align`.

    Возвращает пары (строка, тег), где тег — `(проход, счётчик)` у копий внутри
    повтора и None у строк вне его.

    Копии ссылаются на **те же** координаты: аккорд второго прохода ложится на
    тот же слог файла, что и первого. Тег и нужен, чтобы их различить: разошлась
    в проходах гармония — аккорд получит пометку `{2:Dm}`, а не уронит песню
    проверкой «разные аккорды на один слог».
    """
    out, tags, start = [], [], None
    for row in rows:
        s = _text(row)
        if s.lstrip().startswith("/") and start is None: start = len(out)
        out.append(row); tags.append(None)
        m = COUNT_RE.search(s)
        if m:
            b = start if start is not None else len(out) - 1
            n = int(m.group(1))
            plain = all(not _inner_slash(x) for x in out[b:])
            # повтор, открытый посреди строки, размножает строку целиком (так же
            # делает `align`), но петь дважды приложение будет только хвост от
            # слеша. Значит и тег действует с него, а не со всей строки
            from_key = None
            if not plain and start is None and len(out[b:]) == 1:
                from_key = _mid_open(out[b])
                plain = from_key is not None
            block = [strip_marks(x) for x in out[b:]]
            del out[b:]; del tags[b:]
            for k in range(n):
                out += block
                tags += [(k + 1, n, from_key) if plain else None] * len(block)
            start = None
    return [(strip_marks(x), t) for x, t in zip(out, tags)]


def syllables_of(row):
    """Слоги последовательности символов — повторяет `align.line_syllables`.

    Дублирование сознательное: сама `line_syllables` координат не знает, а
    возвращать их из неё значило бы усложнить ядро раскладки ради импорта.
    Расхождение поймает сверка со сборкой — она идёт по тексту слогов.
    """
    words, cur = [], []
    for ch in row:
        if ch[0].isspace():
            if cur: words.append(cur); cur = []
            continue
        cur.append(ch)
    if cur: words.append(cur)

    out = []
    for wch in words:
        w = _text(wch)
        syl = align.syllables(w)
        offs, acc = [], 0
        for s in syl:
            offs.append(acc); acc += len(s)
        syl_w = [x + "-" for x in syl[:-1]] + [syl[-1]]
        pts = [(wch[o][1], wch[o][2]) for o in offs]
        if not any(c.lower() in align.VOWELS for c in w):
            out.append((pts[0][0], pts[0][1], syl_w[0], None)); continue
        if out and not any(c.lower() in align.VOWELS for c in out[-1][2]):
            # предлог поётся под одной нотой со следующим слогом: слог общий, а
            # место аккорда — начало предлога, иначе он встанет посреди «в~нас».
            # Четвёртым полем идёт своя точка следующего слога: часть куплетов
            # поёт предлог отдельной нотой, и тогда слот придётся разъединить
            pl, pp, pt, _sp = out.pop()
            tail = (pts[0][0], pts[0][1], syl_w[0], None)
            out.append((pl, pp, pt + "~" + syl_w[0], tail))
            out += [(pts[k][0], pts[k][1], syl_w[k], None) for k in range(1, len(syl_w))]
            continue
        out += [(pts[k][0], pts[k][1], syl_w[k], None) for k in range(len(syl_w))]
    return out


def _syl_tag(syl, tag):
    """Тег прохода для слога: `(проход, счётчик)` или None.

    У повтора, открытого посреди строки, слоги до слеша поются один раз —
    пометка на них означала бы не тот повтор, и линтер бракует её по делу.
    """
    if tag is None: return None
    p, n, from_key = tag
    if from_key is not None and (syl[0], syl[1]) < from_key: return None
    return (p, n)


def block_syllables(block, expand=False, echo=False):
    """Слоги блока строк с координатами в одной из трактовок сборки.

    Пятое поле слога — тег прохода от `expand_repeats`. Вешается здесь, а не в
    `syllables_of`: слогоделение о повторах ничего не знает и знать не должно,
    а тег у всей строки один.
    """
    rows = [chars_of(li, off, text) for li, off, text in block]
    if echo: rows = [drop_echo(r) for r in rows]
    tagged = expand_repeats(rows) if expand else [(strip_marks(r), None) for r in rows]
    out = []
    for r, tag in tagged: out += [syl + (_syl_tag(syl, tag),) for syl in syllables_of(r)]
    return out


def _bare(tok):
    """Слог без служебных знаков подтекстовки — для сверки предлога по букве."""
    return re.sub(r"[^\w]", "", tok.replace("~", " ").split()[0] if tok.strip() else "").lower()


def split_joined(mine, row):
    """Разъединить предлог со слогом там, где подтекстовка даёт ему свою ноту.

    `align.line_syllables` всегда поёт предлог без гласной под одной нотой со
    следующим слогом («в~путь»), потому что своей гласной у него нет. В нотах это
    правило соблюдают не все куплеты: у песни 44 куплеты 6 и 9 держат «в» отдельным
    слотом, и число слогов расходится со числом слотов на единицу. Прежде такой
    куплет пропускался целиком — вместе со всей своей гармонией.

    Разъединяются только слоты, у которых подтекстовка на этом месте несёт токен
    без гласной, совпадающий с предлогом по букве. Догадок здесь нет: не совпало —
    слот остаётся слитым, и куплет по-прежнему отбрасывается сверкой в `plan`.
    """
    slots = [t for t in row.split() if t not in ("*", "_")]
    out, i = [], 0
    for syl in mine:
        tail, tag = syl[3], syl[4]
        if (tail and i + 1 < len(slots)
                and not any(c in align.VOWELS for c in slots[i].lower())
                and _bare(slots[i]) == _bare(syl[2])):
            # разъединённый слог остаётся в том же проходе, что и слитый
            out.append((syl[0], syl[1], syl[2].split("~")[0], None, tag))
            out.append(tuple(tail) + (tag,))
            i += 2
            continue
        out.append(syl)
        i += 1
    return out


# --- план и применение -----------------------------------------------------

# хвост, которым `align.build` метит нехватку слотов. Отрезается целиком: иначе
# его слова уезжают в сравнение наравне со слогами и сверка идёт с мусором
MARK_RE = re.compile(r"!!\(слогов \d+, звучащих слотов \d+\)")


def match_syllables(verse, chorus, toks):
    """Слоги куплета, совпавшие со сборкой. None — ни одна трактовка не сошлась.

    Перебираются те же трактовки, что и в `align.build`: повтор свёрнутый или
    развёрнутый, эхо на месте или снято, блок — куплет или куплет с припевом.
    Какую выбрала сборка, модуль не знает и не гадает — годится та, что совпала
    со строкой `w:` слово в слово.
    """
    for expand in (False, True):
        for echo in (False, True):
            base = block_syllables(verse, expand, echo)
            if [x[2] for x in base] == toks: return base
            full = base + block_syllables(chorus, expand, echo)
            if [x[2] for x in full] == toks: return full
    return None


def mark_chords(by_pass, count):
    """Строка `{…}` для одного слога из его аккордов, разложенных по проходам.

    `by_pass` — {номер прохода: аккорд}, где 0 значит «строка вне повтора», то
    есть проход у неё один. `count` — счётчик охватывающего повтора.

    Пометка ставится только там, где проходы расходятся: одна и та же гармония
    во всех проходах пишется без номера. Иначе получилось бы `{1,2:F}` внутри
    `/2р.` — линтер такое бракует, и по делу: это в точности `{F}`, только
    ценой разворота повтора.

    None — примирить нечем: на слоге сошлись и аккорд «во всех проходах», и
    другой аккорд отдельного прохода. Какой из них верен, знает партитура, а не
    импорт.
    """
    names = set(by_pass.values())
    if len(names) == 1:
        name = names.pop()
        # гармония одна: пометка нужна, только если проход не всякий
        if 0 in by_pass: return "{%s}" % name
        passes = sorted(by_pass)
        if len(passes) == count: return "{%s}" % name
        return "{%s:%s}" % (",".join(str(p) for p in passes), name)
    if 0 in by_pass: return None
    groups = {}
    for p in sorted(by_pass): groups.setdefault(by_pass[p], []).append(p)
    return "".join(
        "{%s}" % name if len(passes) == count
        else "{%s:%s}" % (",".join(str(p) for p in passes), name)
        for name, passes in sorted(groups.items(), key=lambda kv: kv[1][0]))


def put_chord(at, counts, syl, name):
    """Положить аккорд на слог в его проход. Строка — причина отказа песни.

    Припев в файле один, а куплетов много: на его слоги аккорды приходят от
    каждого. Расхождение **внутри одного прохода** значит, что раскладка
    куплетов разъехалась, и молча брать первый нельзя — это уже не импорт.
    Расхождение между проходами — не ошибка, а то, ради чего заведена пометка.
    """
    li, pos, tag = syl[0], syl[1], syl[4]
    p, n = tag if tag else (0, 0)
    by_pass = at.setdefault((li, pos), {})
    if by_pass.get(p, name) != name:
        return "разные аккорды на один слог"
    by_pass[p] = name
    counts[(li, pos)] = max(counts.get((li, pos), 0), n)
    return None


def build_edits(at, counts):
    """(правки, причина отказа). Правка — (строка, позиция, готовая строка `{…}`)."""
    out = []
    for key in sorted(at):
        mark = mark_chords(at[key], counts.get(key, 0))
        if mark is None:
            return None, "аккорд и на все проходы, и на отдельный"
        out.append((key[0], key[1], mark))
    return out, None


def plan(num):
    """(правки, причина отказа). Правка — (строка, позиция, строка `{…}`)."""
    raw, lines, verses, chorus = read_source(num)
    if not verses: return None, "нет куплетов"
    if CHORD.search(raw): return None, "аккорды уже есть"
    try:
        abc = io.open(align.abc_path(num), encoding="utf-8").read()
    except IOError:
        return None, "нет нот"
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            built, _bars = align.build(num)
    except align.NeedJournal:
        return None, "нужен журнал"
    except Exception as e:
        return None, "ошибка " + type(e).__name__

    hand = hand_rows(abc)
    at, counts = {}, {}
    for vi, verse_no in enumerate(sorted(verses)):
        if vi >= len(built): break
        if MARK_RE.search(built[vi]):
            # слогов в куплете больше, чем звучащих слотов: расходятся сами
            # данные, и починить это подбором трактовки нельзя
            return None, "куплет %d: слогов больше, чем слотов" % verse_no
        toks = [t for t in built[vi].split() if t not in ("_", "*", "?")]
        mine = match_syllables(verses[verse_no], chorus, toks)
        if mine is None: return None, "слоги не сходятся с раскладкой"
        # у куплета своя строка `w:`, и она может нести лишние слоты — тогда вся
        # гармония этого куплета съезжает на слог-другой. Сначала пробуем
        # объяснить лишний слот отдельной нотой под предлогом; не сошлось —
        # аккорды куплета пропускаются целиком, их с избытком дают остальные
        if vi < len(hand):
            slots = align.hand_template(hand[vi]).count("syl")
            if slots != len(mine):
                mine = split_joined(mine, hand[vi])
            if slots != len(mine):
                continue
        cmap = chords_by_syllable(abc, vi)
        if cmap is None: return None, "шаблон ≠ числу нот"
        for j, name in cmap.items():
            if j >= len(mine): continue
            why = put_chord(at, counts, mine[j], name)
            if why: return None, why
    if not at: return None, "нет аккордов"
    edits, why = build_edits(at, counts)
    return edits, why


def render(num, edits):
    """Текст файла с аккордами. Проверяет обратимость: снятие `{…}` даёт исходник."""
    raw, lines, _v, _c = read_source(num)
    by_line = {}
    for li, pos, mark in edits:
        # старая форма правки — голое имя аккорда: планы, собранные до появления
        # пометок прохода, лежат в JSON и переписывать их незачем
        if not mark.startswith("{"): mark = "{%s}" % mark
        by_line.setdefault(li, []).append((pos, mark))
    for li, items in by_line.items():
        s = lines[li]
        for pos, mark in sorted(items, reverse=True):
            s = s[:pos] + mark + s[pos:]
        lines[li] = s
    out = "\n".join(lines)
    if CHORD.sub("", out) != raw:
        raise AssertionError("вставка изменила текст песни %d" % num)
    return out


def write(num, text):
    p = os.path.join(align.ROOT, "songs-data/songs/%04d.txt" % num)
    io.open(p, "w", encoding="utf-8").write(text)


if __name__ == "__main__":
    n = int(sys.argv[1])
    edits, why = plan(n)
    if why: print("%04d: отказ — %s" % (n, why)); sys.exit(1)
    print(render(n, edits))
