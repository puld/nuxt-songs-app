# -*- coding: utf-8 -*-
"""Обвязка пакетного прогона очереди 1: разбор PDF → ABC → раскладка → аккорды.

Конвейер pipeline/ не трогается. Адаптация здесь:
- теневой ROOT: эталоны songs-data очищены от разметки {Am} (латиница аккордов
  ломает буквенное сравнение в fit_by_alignment и триггерит «аккорды уже есть»
  в chordimport), журналов align нет, notes-omr/out — симлинк на out-epp;
- файл листа берётся из pdf-epp/queues.json (queue == 1), а не по списку файлов;
- посадка аккордов работает с fit-раскладкой: сборка зовётся с fit=True, а для
  куплетов, разложенных fit_by_alignment, координаты слогов восстанавливаются
  маппингом индексов, который сверяется со строкой сборки токен в токен —
  совпадение — проверка, а не догадка (то же правило, что в chordimport.plan).
"""
import io, os, re, sys, json, glob, difflib, contextlib, traceback

SCRATCH = os.path.dirname(os.path.abspath(__file__))
NOTES = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr"
REPO = os.path.dirname(NOTES)
PIPE = os.path.join(NOTES, "pipeline")
OUT = os.path.join(NOTES, "out-epp")
SHADOW = os.path.join(SCRATCH, "shadow")
PARSE_LOG = os.path.join(SCRATCH, "parse.jsonl")
ALIGN_LOG = os.path.join(SCRATCH, "align.jsonl")

sys.path.insert(0, PIPE)
import align as al
import chordimport as ci
import abcout, satb, fontmap, fitz

CHORD = re.compile(r"\{[^}]*\}")


def queue1():
    q = json.load(open(os.path.join(NOTES, "pdf-epp/queues.json")))
    return {int(n): v for n, v in q.items() if v["queue"] == 1}


def setup():
    """Теневой ROOT: чистые эталоны, пустой align, out → out-epp."""
    sd = os.path.join(SHADOW, "songs-data/songs")
    os.makedirs(sd, exist_ok=True)
    os.makedirs(os.path.join(SHADOW, "notes-omr/align"), exist_ok=True)
    link = os.path.join(SHADOW, "notes-omr/out")
    if not os.path.islink(link):
        os.symlink(OUT, link)
    n = 0
    for num in queue1():
        src = os.path.join(REPO, "songs-data/songs/%04d.txt" % num)
        raw = io.open(src, encoding="utf-8").read()
        io.open(os.path.join(sd, "%04d.txt" % num), "w", encoding="utf-8").write(CHORD.sub("", raw))
        n += 1
    print("эталонов очищено:", n)


def use_shadow():
    al.ROOT = SHADOW


# --- разбор PDF → ABC + метрики, один проход -------------------------------

def parse_bad(sc):
    bad = tot = 0
    for si, it in enumerate(sc["systems"]):
        tot += it["nbars"]
        for hi, lo in (("S", "A"), ("T", "B")):
            for bi in range(it["nbars"]):
                sums = satb.staff_sums(it, hi, lo, bi, sc["beats"])
                e = satb.expected(sc, si, bi, sc["pickup"])
                for v, s in zip((hi, lo), sums):
                    if abs(s - e) < 1e-6 and satb.notes_sum(it["voices"][v], it, bi):
                        continue
                    if satb.notes_sum(it["voices"][v], it, bi) == 0:
                        continue
                    bad += 1
    return tot, bad


def crossings(sc):
    STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    ACCS = {"#": 1, "b": -1}
    def pitch(e):
        p = e["pitches"][0]
        return p["o"] * 12 + STEP[p["p"]] + ACCS.get(p["acc"], 0)
    n = 0
    for it in sc["systems"]:
        for hi, lo in (("S", "A"), ("A", "T"), ("T", "B")):
            a = {round(e["x"]): e for bar in it["cells"][hi] for e in bar if not e["rest"]}
            b = {round(e["x"]): e for bar in it["cells"][lo] for e in bar if not e["rest"]}
            for x in set(a) & set(b):
                if pitch(a[x]) < pitch(b[x]):
                    n += 1
    return n


def abc_chords_n(abc):
    """Буквенные обозначения в ABC: кавычки в голосах, аннотации `^…` не в счёт."""
    n, in_voice = 0, False
    for line in abc.splitlines():
        if line.startswith("V:"):
            in_voice = True
            continue
        if not in_voice or line.startswith(("w:", "%")):
            continue
        n += sum(1 for m in re.finditer(r'"([^"]*)"', line) if not m.group(1).startswith("^"))
    return n


def cmd_parse(start, count):
    q1 = queue1()
    nums = sorted(q1)[start:start + count]
    done = set()
    if os.path.exists(PARSE_LOG):
        for ln in open(PARSE_LOG):
            done.add(json.loads(ln)["num"])
    log = open(PARSE_LOG, "a", encoding="utf-8")
    for num in nums:
        if num in done:
            continue
        pdf = os.path.join(NOTES, "pdf-epp", q1[num]["pdf"])
        rec = {"num": num, "pdf": q1[num]["pdf"]}
        try:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                abc, sc, lynums = abcout.build(pdf)
            io.open(os.path.join(OUT, "%04d.abc" % num), "w", encoding="utf-8").write(abc)
            m = abcout.meta_json(abc, sc, "%d" % num, len(lynums))
            json.dump(m, open(os.path.join(OUT, "%04d.json" % num), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            tot, bad = parse_bad(sc)
            doc = fitz.open(pdf)
            rec.update(ok=True, bars=tot, bad=bad, cross=crossings(sc),
                       unk=sum(fontmap.unknown(doc).values()),
                       chords=abc_chords_n(abc), verses=len(lynums),
                       title=sc["title"] or "")
            doc.close()
        except Exception as e:
            rec.update(ok=False, err="%s: %s" % (type(e).__name__, str(e).split("\n")[0][:100]))
        log.write(json.dumps(rec, ensure_ascii=False) + "\n")
        log.flush()
    log.close()
    print("parse batch done: %d..%d" % (start, start + count))


# --- fit-маппинг: индексы слогов эталона для разложенного куплета ----------

def _repeat_idx(a, seg, need):
    """Как align._repeat_phrase, но возвращает индексы найденной фразы."""
    letters = lambda toks: "".join(re.sub(r"[^\w]", "", t) for t in toks)
    seg_l = letters(seg)
    if not seg_l:
        return [None] * need
    pos, cur = [], 0
    for t in a:
        w = re.sub(r"[^\w]", "", t)
        pos.append((cur, cur + len(w)))
        cur += len(w)
    ours_l = "".join(re.sub(r"[^\w]", "", t) for t in a)
    m = difflib.SequenceMatcher(None, ours_l, seg_l, autojunk=False).find_longest_match(
        0, len(ours_l), 0, len(seg_l))
    if m.size < 4 or m.size < 0.6 * len(seg_l):
        return [None] * need
    lo = next((i for i, (s0, e0) in enumerate(pos) if e0 > m.a), 0)
    hi = next((i + 1 for i in range(len(pos) - 1, -1, -1) if pos[i][0] < m.a + m.size), lo + 1)
    idxs = list(range(lo, hi)) or [None]
    return [idxs[i % len(idxs)] for i in range(need)]


def fit_map(ours_toks, notes_toks):
    """Индексная копия align.fit_by_alignment: те же opcodes, те же правила."""
    a = [al._n(x) for x in ours_toks]
    b = [al._n(x) for x in notes_toks]
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        need = j2 - j1
        if tag == "equal":
            out += list(range(i1, i2))
        elif tag == "replace":
            out += (list(range(i1, i2)) + [None] * need)[:need]
        elif tag == "insert":
            out += _repeat_idx(a, notes_toks[j1:j2], need)
    return out


def _plan_fit_once(num, order):
    """chordimport.plan, работающий с fit-раскладкой, при заданном приоритете
    трактовок повтора (`order` — порядок значений `expand`).

    Отличия от оригинала: сборка с fit=True; куплет, который match_syllables не
    узнал, раскладывается fit-маппингом и принимается только при дословном
    совпадении со строкой сборки; несошедшийся куплет пропускается (аккорды с
    избытком дают остальные), а не роняет песню.
    """
    raw, lines, verses, chorus = ci.read_source(num)
    if not verses:
        return None, "нет куплетов", 0
    if ci.CHORD.search(raw):
        return None, "аккорды уже есть", 0
    try:
        abc = io.open(al.abc_path(num), encoding="utf-8").read()
    except IOError:
        return None, "нет нот", 0
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            built, _bars = al.build(num, fit=True)
    except al.NeedJournal:
        return None, "нужен журнал", 0
    except Exception as e:
        return None, "ошибка " + type(e).__name__, 0

    hand = ci.hand_rows(abc)
    at, counts = {}, {}
    skipped = 0
    for vi, verse_no in enumerate(sorted(verses)):
        if vi >= len(built):
            break
        row = ci.MARK_RE.sub("", built[vi]).strip()
        toks = [t for t in row.split() if t not in ("_", "*", "?")]
        toks_q = [t for t in row.split() if t not in ("_", "*")]  # с дырками «?»
        mine = ci.match_syllables(verses[verse_no], chorus, toks)
        mine_full = None
        if mine is not None:
            # точное совпадение: дырок в куплете нет, порядок исходный
            if len(toks_q) == len(mine):
                mine_full = mine
            else:
                # «?» в хвосте (пул короче слотов): позиции после — дырки
                mine_full = list(mine) + [None] * (len(toks_q) - len(mine))
        else:
            # fit-раскладка: подобрать трактовку, чей fit-маппинг дословно
            # воспроизводит строку сборки
            nrow = hand[vi] if vi < len(hand) else (hand[0] if hand else "")
            notes_toks = [t for t in nrow.split() if t not in ("*", "_")]
            # порядок трактовок задаёт вызывающий: развёрнутая нужна, чтобы у
            # слогов появился тег прохода (свёрнутую fit_map доразмножит сам
            # opcode-ом «insert», и пометку `{2:Dm}` ставить будет не из чего),
            # но она же меняет раскладку — какая из двух сядет без конфликта,
            # заранее не известно. Обе одинаково сверяются со строкой сборки
            # токен в токен, так что предпочтение ничего не ослабляет
            for expand in order:
                for echo in (False, True):
                    for with_chorus in (False, True):
                        base = ci.block_syllables(verses[verse_no], expand, echo)
                        if with_chorus:
                            base = base + ci.block_syllables(chorus, expand, echo)
                        pool = [x[2] for x in base]
                        mapping = fit_map(pool, notes_toks)
                        recon = [pool[k] if k is not None else "?" for k in mapping]
                        if recon == toks_q:
                            mine_full = [base[k] if k is not None else None for k in mapping]
                            break
                    if mine_full is not None:
                        break
                if mine_full is not None:
                    break
        if mine_full is None:
            skipped += 1
            continue
        # слот отдельной ноты под предлогом — как в оригинале, только для
        # куплетов, прошедших точную сверку
        if mine is not None and vi < len(hand):
            slots = al.hand_template(hand[vi]).count("syl")
            if slots != len(mine_full):
                mine_full = ci.split_joined(mine_full, hand[vi])
            if slots != len(mine_full):
                skipped += 1
                continue
        cmap = ci.chords_by_syllable(abc, vi)
        if cmap is None:
            return None, "шаблон ≠ числу нот", skipped
        for j, name in cmap.items():
            if j >= len(mine_full) or mine_full[j] is None:
                continue  # аккорд над дыркой — сажать некуда
            why = ci.put_chord(at, counts, mine_full[j], name)
            if why:
                return None, why, skipped
    if not at:
        return None, "нет аккордов", skipped
    edits, why = ci.build_edits(at, counts)
    return edits, why, skipped


def plan_fit(num):
    """Посадка аккордов: сначала с развёрнутым повтором, при отказе — со
    свёрнутым.

    Порядок именно такой, потому что тег прохода даёт только развёрнутая
    трактовка: без неё песня с разной гармонией проходов упирается в «разные
    аккорды на один слог». Но развёртка меняет и саму раскладку, поэтому
    предпочтение не должно быть безусловным: там, где она уводит слоги, вторая
    попытка возвращает ровно прежнее поведение конвейера. Выбор делается по
    результату, а не по приоритету — цена этого одна лишняя раскладка, и только
    у песен, которые иначе были бы отклонены.
    """
    edits, why, skipped = _plan_fit_once(num, (True, False))
    if why is None or not why:
        return edits, why, skipped
    alt, why2, skipped2 = _plan_fit_once(num, (False, True))
    if not why2:
        return alt, why2, skipped2
    return edits, why, skipped


# --- раскладка + аккорды ----------------------------------------------------

def cmd_align(start, count):
    use_shadow()
    parsed = [json.loads(ln) for ln in open(PARSE_LOG)]
    ok_nums = sorted(r["num"] for r in parsed if r.get("ok"))
    nums = ok_nums[start:start + count]
    done = set()
    if os.path.exists(ALIGN_LOG):
        for ln in open(ALIGN_LOG):
            done.add(json.loads(ln)["num"])
    log = open(ALIGN_LOG, "a", encoding="utf-8")
    for num in nums:
        if num in done:
            continue
        rec = {"num": num}
        # раскладка без fit — честный сигнал «нужен журнал»
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                rows, _ = al.build(num)
            rec["plain"] = "ok"
            rec["q_plain"] = sum(r.split().count("?") for r in rows)
            rec["bang"] = sum(1 for r in rows if "!!(" in r)
            rec["verses"] = len(rows)
        except al.NeedJournal as e:
            rec["plain"] = "journal"
            rec["why"] = str(e)[:80]
        except Exception as e:
            rec["plain"] = "err"
            rec["why"] = "%s: %s" % (type(e).__name__, str(e).split("\n")[0][:80])
        # раскладка с fit
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                rows, _ = al.build(num, fit=True)
            rec["fit"] = "ok"
            rec["q_fit"] = sum(r.split().count("?") for r in rows)
            rec["bang_fit"] = sum(1 for r in rows if "!!(" in r)
            rec["verses"] = len(rows)
        except al.NeedJournal as e:
            rec["fit"] = "journal"
            rec["fit_why"] = str(e)[:80]
        except Exception as e:
            rec["fit"] = "err"
            rec["fit_why"] = "%s: %s" % (type(e).__name__, str(e).split("\n")[0][:80])
        # посадка аккордов
        if rec.get("fit") == "ok" or rec.get("plain") == "ok":
            try:
                edits, why, skipped = plan_fit(num)
            except Exception as e:
                edits, why, skipped = None, "ошибка " + type(e).__name__, 0
            rec["chords_planted"] = len(edits) if edits else 0
            rec["verses_skipped"] = skipped
            if why:
                rec["chords_why"] = why
            elif edits:
                rec["edits"] = edits
        log.write(json.dumps(rec, ensure_ascii=False) + "\n")
        log.flush()
    log.close()
    print("align batch done: %d..%d" % (start, start + count))


# --- сводка ------------------------------------------------------------------

def status_of(p, a):
    """Приёмка: «чисто» / «с дырками» / «отказ» + причины."""
    reasons = []
    if not p.get("ok"):
        return "отказ", ["разбор: " + p.get("err", "?")]
    if a is None:
        return "отказ", ["раскладка не прогонялась"]
    layout_clean = (a.get("plain") == "ok" and a.get("q_plain", 0) == 0 and a.get("bang", 0) == 0) or \
                   (a.get("fit") == "ok" and a.get("q_fit", 0) == 0 and a.get("bang_fit", 0) == 0)
    layout_holes = a.get("fit") == "ok" or a.get("plain") == "ok"
    if not layout_holes:
        return "отказ", ["раскладка: " + a.get("fit_why", a.get("why", "нужен журнал"))]
    if p.get("bad", 0) > 0:
        reasons.append("суммы длительностей: %d такт(ов)" % p["bad"])
    if p.get("cross", 0) > 0:
        reasons.append("перекрёст голосов: %d" % p["cross"])
    if p.get("unk", 0) > 0:
        reasons.append("неопознанные глифы: %d" % p["unk"])
    if not layout_clean:
        holes = a.get("q_fit", 0)
        bang = a.get("bang_fit", a.get("bang", 0))
        if holes:
            reasons.append("дырок в раскладке: %d" % holes)
        if bang:
            reasons.append("куплетов с нехваткой слотов: %d" % bang)
    if reasons:
        return "с дырками", reasons
    return "чисто", []


def cmd_report():
    parsed = {r["num"]: r for r in (json.loads(ln) for ln in open(PARSE_LOG))}
    aligned = {r["num"]: r for r in (json.loads(ln) for ln in open(ALIGN_LOG))}
    plan = {"_note": ("координаты аккордов: [строка, позиция, разметка] в файле "
                      "songs-data/songs/NNNN.txt, ОЧИЩЕННОМ от прежней разметки {…}; "
                      "номер строки совпадает с исходным файлом, позиция — в строке без {…}. "
                      "Разметка — готовая строка вида {Am} или {2:Dm} (аккорд второго "
                      "прохода охватывающего повтора), иногда две подряд на одном слоге")}
    stat = {}
    for num in sorted(queue1()):
        p = parsed.get(num, {"ok": False, "err": "не прогонялся"})
        a = aligned.get(num)
        st, reasons = status_of(p, a)
        stat[st] = stat.get(st, 0) + 1
        rec = {"status": st}
        if reasons:
            rec["reasons"] = reasons
        if p.get("ok"):
            rec["parse"] = {k: p[k] for k in ("bars", "bad", "cross", "unk", "verses") if k in p}
        if a:
            rec["layout"] = {k: a[k] for k in ("plain", "q_plain", "bang", "fit", "q_fit", "bang_fit") if k in a}
            rec["chords_n"] = a.get("chords_planted", 0)
            if a.get("chords_why"):
                rec["chords_why"] = a["chords_why"]
            if a.get("edits"):
                rec["chords"] = a["edits"]
        plan["%04d" % num] = rec
    out = os.path.join(OUT, "chords-plan.json")
    json.dump(plan, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("chords-plan.json:", out)
    print("статусы:", stat)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "setup":
        setup()
    elif cmd == "parse":
        cmd_parse(int(sys.argv[2]), int(sys.argv[3]))
    elif cmd == "align":
        cmd_align(int(sys.argv[2]), int(sys.argv[3]))
    elif cmd == "report":
        cmd_report()
