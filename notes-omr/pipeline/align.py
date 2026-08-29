# -*- coding: utf-8 -*-
"""Прототип алигнера: эталонный текст + журнал → строка `w:` для ABC.

Проверяет главную гипотезу фазы 9: текст под нотами не нужно держать вторым
экземпляром. Слова берутся из `songs-data/songs/NNNN.txt`, ноты дают только
число слотов, а журнал описывает те несколько мест, где раскладка «слог за
нотой» не работает — вольты, эхо-подголоски, слияние предлога с ударным слогом.

Запуск: python3 notes-omr/pipeline/align.py 655
"""
import io, os, re, sys, json, difflib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
VOWELS = "аеёиоуыэюя"

class NeedJournal(Exception):
    """Структуру этой песни автоматика не выводит — нужен журнал выравнивания."""

# --- эталонный текст -------------------------------------------------------

def read_reference(num):
    """Строфы эталона: куплеты по номерам и припев отдельно."""
    p = os.path.join(ROOT, "songs-data/songs/%04d.txt" % num)
    raw = io.open(p, encoding="utf-8").read()
    raw = re.sub(r"@meta.*?@end", "", raw, flags=re.S)      # мета-блок к тексту не относится
    verses, chorus, cur, in_chorus = {}, [], None, False
    for line in raw.splitlines():
        t = line.strip()
        if not t or t.startswith("#"): continue
        if re.match(r"^Припев:?$", t, re.I): in_chorus, cur = True, None; continue
        # метка варианта песни — «(а)», «(б)»: она стоит до первого куплета и
        # к словам не относится. Без этого строфа уезжала в куплет без номера,
        # и `min(verses)` падал на сравнении None с числом (032)
        if re.match(r"^\([а-яa-zA-ZА-Я0-9]{1,3}\)$", t): continue
        m = re.match(r"^(\d+)\.\s*(.*)", t)
        if m:
            in_chorus = False
            cur = int(m.group(1)); verses[cur] = [m.group(2).strip()]
            continue
        (chorus if in_chorus else verses.setdefault(cur, [])).append(t)
    # строки до первого номера куплета — не куплет: у ненумерованных песен они
    # единственная строфа, у нумерованных это остаток разметки
    if None in verses:
        rest = verses.pop(None)
        if not verses and rest: verses[1] = rest
    return verses, chorus

def strip_repeat_marks(line):
    """Снять разметку повтора `/…/2р.` — она про то, сколько раз петь, а не про слова."""
    return re.sub(r"\s*/\s*\d*\s*р?\.?\s*$", "", re.sub(r"^\s*/\s*", "", line)).strip()

def expand_repeats(lines):
    """Развернуть повтор `/ … /2р.` в подряд идущие строки.

    Эталон записывает повтор маркером, а ноты — двумя способами: репризой
    (текст напечатан один раз) или выписанным текстом. Какой случай перед нами,
    решает не эта функция, а сборка: она пробует обе трактовки и берёт ту, что
    сходится с числом слотов.
    """
    out, start = [], None
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith("/") and start is None: start = len(out)
        out.append(ln)
        m = re.search(r"/\s*(\d+)\s*р\.?\s*$", ln)
        if m:
            block = [strip_repeat_marks(x) for x in out[start if start is not None else len(out) - 1:]]
            del out[start if start is not None else len(out) - 1:]
            out += block * int(m.group(1))
            start = None
    return [strip_repeat_marks(x) for x in out]

def drop_echo(line):
    """Убрать эхо-подголоски в скобках: их поёт другой голос."""
    return re.sub(r"\s*\([^)]*\)", "", line).strip()

# --- слоги -----------------------------------------------------------------

def syllables(word):
    """Слоги слова.

    Их ЧИСЛО задаётся гласными и потому точно. Место разреза — правило,
    выведенное из нотных изданий: из группы согласных к предыдущему слогу
    отходят все, кроме последней («жиз-ни», «жерт-вуй», «солн-це»), но группа
    «ст/сп/ск/шт» не рвётся и уходит к следующему целиком («вме-сте»,
    «ра-до-сти»). Мягкий знак остаётся при своей согласной, а перед гласной
    уводит её за собой («спа-се-нья»).
    """
    # Группы, уходящие к следующему слогу целиком. Список не умозрительный:
    # он снят со всех рукописных `w:` Эппа — там, где издатель делит иначе, чем
    # «одна согласная к предыдущему». Muta cum liquida в него НЕ входит: данные
    # против («доб-ро-е», «мед-лит», «яв-люсь»).
    KEEP = ("ст", "гд", "шл", "св", "мр", "сл", "жн")
    head = re.match(r"^[^\w]*", word).group(0)
    tail = re.search(r"[^\w]*$", word).group(0)
    core = word[len(head):len(word) - len(tail)] if tail else word[len(head):]
    idx = [i for i, c in enumerate(core) if c.lower() in VOWELS]
    if len(idx) <= 1:
        return [head + core + tail]
    parts, start = [], 0
    for k in range(len(idx) - 1):
        g1, g2 = idx[k], idx[k + 1]
        cons = core[g1 + 1:g2].lower()
        if not cons:               cut = g2
        elif len(cons) == 1:       cut = g1 + 1
        elif cons[:2] in KEEP:     cut = g1 + 1
        else:                      cut = g2 - 1
        if core[cut] == "ь":
            cut = cut + 1 if cut + 1 >= len(core) or core[cut + 1].lower() not in VOWELS else cut - 1
        parts.append(core[start:cut]); start = cut
    parts.append(core[start:])
    parts[0] = head + parts[0]; parts[-1] = parts[-1] + tail
    return parts

def line_syllables(line):
    """Слоги строки в записи `w:`: внутри слова слоги связаны дефисом."""
    out = []
    for w in line.split():
        syl = syllables(w)
        syl = [x + "-" for x in syl[:-1]] + [syl[-1]]
        if not any(c.lower() in VOWELS for c in w):
            out.append(syl[0])          # предлог без гласной слога не образует
            continue
        if out and not any(c.lower() in VOWELS for c in out[-1]):
            syl[0] = out.pop() + "~" + syl[0]   # …он поётся под одной нотой со следующим слогом
        out += syl
    return out

# --- ноты ------------------------------------------------------------------

NOTE = re.compile(r"""(?:\[[^\]]*\])|          # аккорд в квадратных скобках — один слот
                      (?:[_^=]*[A-Ga-g][,']*\d*/*\d*)""", re.X)
INLINE = re.compile(r"\[[A-Za-z]:[^\]]*\]")     # смена тональности и прочие поля в строке

def voice_music(abc_text, voice):
    """Строка нот голоса, очищенная от всего, что слогов не несёт."""
    lines, grab = [], False
    for line in abc_text.splitlines():
        if line.startswith("V:"):
            grab = line[2:].split()[0] == voice; continue
        if grab and line and not line.startswith(("w:", "%", "X:", "T:", "K:")):
            lines.append(line)
    m = " ".join(lines)
    m = re.sub(r'"[^"]*"', " ", m)      # аннотации и буквенные аккорды
    m = re.sub(r"![^!]*!", " ", m)      # динамика: «f» в !mf! иначе читается нотой
    m = INLINE.sub(" ", m)              # [K:F#m] — не аккорд из трёх нот
    return m

def voice_slots(abc_text, voice):
    """Слоты голоса по тактам.

    Слот — это нота. Лига и лига продлённого звука (tie) слот НЕ убирают: под
    второй нотой распева в `w:` стоит `_`. Такой слот помечается `mute` — текст
    эталона на него не тратится.
    """
    m = voice_music(abc_text, voice)
    bars, cur, volta = [], [], None
    depth, first, tie = 0, True, False
    i = 0
    def close():
        if cur: bars.append({"slots": len(cur), "mute": list(cur), "volta": volta})
        del cur[:]
    while i < len(m):
        c = m[i]
        if c == "(" and not re.match(r"\(\d", m[i:]):
            depth += 1; first = True; i += 1; continue
        if c == ")":
            depth = max(0, depth - 1); i += 1; continue
        bar = re.match(r"(?::\||\|:|\||\]|\[)\s*([\d,]*)", m[i:])
        if bar and bar.group(0).strip():
            close()
            if bar.group(1): volta = bar.group(1)
            i += len(bar.group(0)); continue
        note = NOTE.match(m, i)
        if note:
            if not re.match(r"^[zZxX]", note.group(0)):
                cur.append(bool(tie or (depth and not first)))
                first = False
                tie = m[note.end():note.end() + 1] == "-"
            i = note.end(); continue
        if c in "zZxX":
            z = re.match(r"[zZxX]\d*", m[i:]); i += len(z.group(0)); continue
        i += 1
    close()
    return bars

def hand_template(row):
    """Подтекстовка, напечатанная в нотах, как шаблон раскладки.

    Возвращает позиции строки `w:`: `"syl"` — сюда ложится слог эталона, `"*"` —
    нота без слога, `"_"` — продолжение слога (распев, лига).

    Нужна потому, что счёт слотов по нотам знает только про лиги, а издатель
    метит звёздочкой и распевы без лиги. Отсюда расхождение вида «слогов вдвое
    меньше слотов», которое выглядело как невыведенная структура.
    """
    out = []
    for tok in row.split():
        out.append("*" if tok == "*" else "_" if tok == "_" else "syl")
    return out

def sound_templates(hand):
    """Кандидаты в шаблон: строки `w:`, сведённые к разным длинам.

    Куплеты поются под одни и те же ноты, поэтому у исправных строк одинаковое
    число позиций. Расходятся они у 31 песни из 150 — разбор подтекстовки местами
    теряет и склеивает слоги. Выбрать кандидата берётся сборка: верной считается
    длина, при которой сходится число слогов эталона.
    """
    if not hand: return []
    lens = {}
    for h in hand: lens.setdefault(len(h.split()), []).append(h)
    # Кандидаты — по одному представителю каждой длины, чаще встречающаяся первой.
    # Какая трактовка верна, решает не голосование, а сходимость со слогами
    # эталона: в 13 три строки из четырёх длиннее первой, и большинство неправо.
    return [lens[n][0] for n in sorted(lens, key=lambda n: (-len(lens[n]), n))]

def _n(x):
    return x.strip(".,!?;:-—«»()\"~").lower().replace("ё", "е")

def _repeat_phrase(ours, a, seg, need):
    """Чем заполнить кусок нот, которому в эталоне нет пары.

    Сравнение идёт по буквам, а не по слогам: издатель вяжет слова на одну ноту
    тильдой («как~хо-»), и послоговое сходство такую запись не узнаёт. Найденная
    фраза повторяется по кругу, пока не закроет кусок, — так кода из четырёх
    «Как хочешь Ты» получает наш текст, а не случайный обрывок соседней строки.
    """
    letters = lambda toks: "".join(re.sub(r"[^\w]", "", t) for t in toks)
    seg_l = letters(seg)
    if not seg_l: return [None] * need
    # границы каждого слога в буквенной склейке эталона — чтобы вернуться от
    # найденного места к слогам
    pos, cur = [], 0
    for t in a:
        w = re.sub(r"[^\w]", "", t)
        pos.append((cur, cur + len(w))); cur += len(w)
    ours_l = "".join(re.sub(r"[^\w]", "", t) for t in a)
    m = difflib.SequenceMatcher(None, ours_l, seg_l, autojunk=False).find_longest_match(0, len(ours_l), 0, len(seg_l))
    # покрытие: найденная фраза должна объяснять кусок целиком, а не краешком.
    # Иначе разворачивается случайный обрывок — в 053 кусок захватывает склейку
    # начал пяти куплетов («Ска- Со Чтоб О, То-»), и повтор выходит бессмысленным
    if m.size < 4 or m.size < 0.6 * len(seg_l): return [None] * need
    lo = next((i for i, (s0, e0) in enumerate(pos) if e0 > m.a), 0)
    hi = next((i + 1 for i in range(len(pos) - 1, -1, -1) if pos[i][0] < m.a + m.size), lo + 1)
    phrase = ours[lo:hi] or [None]
    return [phrase[i % len(phrase)] for i in range(need)]

def fit_by_alignment(ours, notes):
    """Разложить слоги эталона по слогам подтекстовки, разворачивая повторы.

    Нужна там, где число не сходится: в нотах выписано то, что эталон свернул.
    У Эппа это хоровая кода (053: «Как хочешь Ты» напечатано четырежды) и повтор
    половины фразы (004: «а в нём земных, а в нём земных скорбей забвенье»).

    Правило то же, что и везде: текст берётся наш, а сколько раз и на каких нотах
    он поётся — из нот. Лишнему куску нот подбирается наиболее похожий фрагмент
    нашего текста; не нашёлся — на его месте `None`, то есть честная дырка, а не
    выдуманные слова.
    """
    a, b = [_n(x) for x in ours], [_n(x) for x in notes]
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        need = j2 - j1
        if tag == "equal":
            out += ours[i1:i2]
        elif tag == "replace":
            seg = ours[i1:i2]
            out += (seg + [None] * need)[:need]
        elif tag == "insert":
            out += _repeat_phrase(ours, a, notes[j1:j2], need)
        # delete: слог эталона, которому в нотах места нет, просто выпадает
    return out

def abc_path(num):
    """Файлы нот бывают и `655.abc`, и `093.abc` — номер писался как в каталоге."""
    for name in ("%d.abc" % num, "%03d.abc" % num, "%04d.abc" % num):
        p = os.path.join(ROOT, "notes-omr/out", name)
        if os.path.exists(p): return p
    raise IOError("нет нот для %d" % num)

# --- сборка ----------------------------------------------------------------

def build(num, voice="S", fit=False):
    """Собрать строки `w:` для всех куплетов эталона.

    Журнал `notes-omr/align/NNNN.json` необязателен: если его нет, структура
    выводится сама — блок «куплет» или «куплет + припев», смотря что сходится
    с числом звучащих слотов.
    """
    verses, chorus, tmpl = read_reference(num) + (None, )
    abc = io.open(os.path.join(ROOT, abc_path(num)), encoding="utf-8").read()
    bars = voice_slots(abc, voice)
    hand = [l[2:].strip() for l in abc.splitlines() if l.startswith("w:")]
    cands = sound_templates(hand)
    jp = os.path.join(ROOT, "notes-omr/align/%04d.json" % num)
    plan = (json.load(io.open(jp, encoding="utf-8"))["voices"][voice]
            if os.path.exists(jp) else None)

    def syllables_for(block, fixes, expand=False):
        lines = verses[block] if isinstance(block, int) else chorus
        lines = expand_repeats(lines) if expand else [strip_repeat_marks(l) for l in lines]
        syl = []
        for ln in lines:
            if fixes.get("drop_echo", True): ln = drop_echo(ln)
            syl += line_syllables(ln)
        return syl

    expand = False
    if plan is None:
        # Структура выводится перебором: куплет или куплет с припевом, повтор
        # свёрнут или развёрнут. Годится та трактовка, что сходится со слотами.
        # Мерило — число слогов, напечатанных в нотах: издатель метит звёздочкой
        # ноты без слога, и счёт по одним лигам их не видит. Шаблона нет —
        # остаётся прежний счёт слотов.
        first = min(verses)
        blocks, tmpl = None, None
        opts = ([hand_template(h) for h in cands] or
                [[("_" if m else "syl") for b in bars for m in b["mute"]]])
        for cand in opts:
            live = cand.count("syl")
            for exp in (False, True):
                for bl in ([{"block": "verse"}],
                           [{"block": "verse"}, {"block": "chorus"}]):
                    if sum(len(syllables_for(first if b["block"] == "verse" else "chorus", {}, exp))
                           for b in bl) == live:
                        blocks, expand, tmpl = [dict(b, bars=[0, len(bars)]) for b in bl], exp, cand
                        break
                if blocks: break
            if blocks: break
        if blocks is None and fit:
            # Число не сошлось ни при одной трактовке: в нотах выписано больше или
            # меньше, чем в эталоне. Состав блоков берём по близости, а раскладку —
            # выравниванием на подтекстовку.
            tmpl = hand_template(cands[0]) if cands else None
            if tmpl:
                live = tmpl.count("syl")
                opts = []
                for exp in (False, True):
                    for bl in ([{"block": "verse"}],
                               [{"block": "verse"}, {"block": "chorus"}]):
                        n = sum(len(syllables_for(first if b["block"] == "verse" else "chorus", {}, exp))
                                for b in bl)
                        opts.append((abs(n - live), exp, bl))
                _, expand, bl = min(opts, key=lambda o: o[0])
                blocks = [dict(b, bars=[0, len(bars)]) for b in bl]
        if blocks is None:
            # Ни одна трактовка не сошлась — структуру должен описать журнал.
            raise NeedJournal("слоты (%d) не сходятся ни с куплетом, ни с куплетом и припевом" % live)

    out = []
    for vi, verse_no in enumerate(sorted(verses)):
        row, slot = [], 0
        # Раскладка идёт по подтекстовке нот, когда она есть: место слога, распева
        # и молчания уже решено издателем. У каждого куплета своя строка `w:` —
        # растяжка слога бывает не во всех, — а если строк меньше, берётся первая.
        tp = None
        if plan is None and tmpl:
            own = hand_template(hand[vi]) if vi < len(hand) else None
            # своя строка куплета годится, только если её длина совпала с выбранной:
            # растяжка слога у куплетов разная, а испорченный разбор — тоже
            tp = own if own and len(own) == len(tmpl) else tmpl
        flat = ([(t == "_", t) for t in tp] if tp
                else [(m, None) for b in bars for m in b["mute"]])
        pool = []
        for block in (plan or blocks):
            fixes = block.get("fixes", {})
            src = verse_no if block["block"] == "verse" else block["block"]
            syl = ([line_syllables(strip_repeat_marks(fixes["tail"]))] and
                   line_syllables(strip_repeat_marks(fixes["tail"]))) if "tail" in fixes \
                  else syllables_for(src, fixes, expand)
            skip = fixes.get("skip", 0)
            pool += ["*"] * skip + syl[fixes.get("start_at", 0):]
        if fit and tp and plan is None:
            want = sum(1 for k in tp if k == "syl")
            if len(pool) != want:
                pool = fit_by_alignment(pool, [t for t in (hand[vi] if vi < len(hand) else hand[0]).split()
                                               if t not in ("*", "_")])
        i = 0
        for mute, kind in flat:
            if mute: row.append("_")
            elif kind == "*": row.append("*")
            elif i < len(pool):
                row.append(pool[i] if pool[i] is not None else "?"); i += 1
            else: row.append("?")
        if i != len(pool):
            live_n = sum(1 for m, k in flat if not m and k != "*")
            row.append("!!(слогов %d, звучащих слотов %d)" % (len(pool), live_n))
        out.append(" ".join(row))
    return out, bars

if __name__ == "__main__":
    num = int(sys.argv[1]) if len(sys.argv) > 1 else 655
    built, bars = build(num)
    abc = io.open(os.path.join(ROOT, abc_path(num)), encoding="utf-8").read()
    hand = [l[2:].strip() for l in abc.splitlines() if l.startswith("w:")]
    print("тактов у сопрано: %d, слотов всего: %d" % (len(bars), sum(b["slots"] for b in bars)))
    print("по тактам:", [b["slots"] for b in bars])
    print("\nсобранная строка первого куплета:\nw: " + built[0])
    ok_all = True
    for i, (g, h) in enumerate(zip(built, hand), 1):
        gs, hs = g.split(), h.split()
        same = sum(1 for a, b in zip(gs, hs) if a.strip(".,!?;:") == b.strip(".,!?;:"))
        print("\n— куплет %d: слогов собрано %d, в рукописной %d, совпало дословно %d/%d (%.0f%%)"
              % (i, len(gs), len(hs), same, max(len(gs), len(hs)), 100.0 * same / max(len(gs), len(hs))))
        if len(gs) != len(hs): ok_all = False; print("  !! РАСХОЖДЕНИЕ ПО ЧИСЛУ СЛОГОВ")
        def n(x): return x.strip(".,!?;:").lower().replace("ё", "е")
        diff = [(j, a, b) for j, (a, b) in enumerate(zip(gs, hs)) if n(a) != n(b)]
        soft = [(j, a, b) for j, (a, b) in enumerate(zip(gs, hs))
                if a.strip(".,!?;:") != b.strip(".,!?;:") and n(a) == n(b)]
        print("     мягких (регистр и «ё» — наш эталон точнее): %d" % len(soft))
        if diff:
            print("     по существу: %d" % len(diff))
            for j, a, b in diff[:12]:
                print("       слот %3d: собрано «%s» ← в нотах «%s»" % (j, a, b))
        else:
            print("     по существу: расхождений нет")
    print("\nчисло слогов сошлось во всех куплетах:", "ДА" if ok_all else "НЕТ")
