# -*- coding: utf-8 -*-
"""Аккорды с листов Эппа в эталонные тексты: `{Am}` перед слогом в `NNNN.txt`.

Работает поверх карты `numbers-final.json` (наш номер → номер листа) и
`sheetchords.py` (что напечатано над каким слогом). Задача модуля одна:
вернуть слог **на его место в исходном файле**. `.txt` хранит слова, строки и
пунктуацию, поэтому текст не пересобирается из слогов — в него вставляются
скобки по координатам.

Слоги листа и наш текст сводятся сравнением сплошного потока букв
(`difflib`), а не пословно: у Эппа своя разбивка на слоги («рас-сказ» против
нашего «расс-каз»), свои повторы и «эхо» в скобках, у нас — свёрнутые репризы.
Аккорд, чья буква не попала в совпавший участок, отбрасывается: лучше не
проставить, чем поставить не туда.

Куплеты на листе напечатаны каждый своей строкой под общими нотами, поэтому
один аккорд размечает **все** куплеты сразу — каждый в своём слоге.
"""
import io, os, re, sys, json, difflib
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SONGS = os.path.join(ROOT, "songs-data", "songs")
sys.path.insert(0, HERE)
from sheetchords import read_sheet, attach, to_english

MIN_COVER = 0.5   # какую долю нашего текста лист должен узнать
CHORD = re.compile(r"\{[^}]*\}")
CYR = re.compile(r"[а-яё]")
# Граница варианта — то же правило, что в `songs-data/parse.js`: метка в своей
# строке, за которой сразу куплет или припев.
VARIANT = re.compile(r"(?:^|\n\s*\n)\(([^)]+)\)\s*(?=\d+\.|Припев[:\s])", re.I)
# Маркеры повтора: буква «р» в «/2р.» слогом не является.
REPEAT_TAIL = re.compile(r"/\s*\d*\s*р?\.?\s*$")
REPEAT_HEAD = re.compile(r"^\s*/\s*")


def letters(s):
    """Буквы строки в нижнем регистре: всё остальное для сверки не значит."""
    return [c for c in s.lower().replace("ё", "е") if CYR.match(c)]


# --- наш текст -------------------------------------------------------------

def song_path(num):
    return os.path.join(SONGS, "%04d.txt" % num)


def strip_marks(raw):
    """Текст без разметки аккордов и сами аккорды: (строка, позиция, имя)."""
    out, marks = [], []
    for li, line in enumerate(raw.split("\n")):
        s, pos = "", 0
        for m in CHORD.finditer(line):
            s += line[pos:m.start()]
            marks.append((li, len(s), m.group(0)[1:-1].lstrip("_")))
            pos = m.end()
        out.append(s + line[pos:])
    return "\n".join(out), marks


def read_source(num, raw=None):
    """Строки файла и строфы с координатами: (номер строки, позиция, текст)."""
    if raw is None:
        raw = io.open(song_path(num), encoding="utf-8").read()
    lines = raw.split("\n")
    body = len(lines)
    m = re.search(r"^@meta", raw, re.M)
    if m:
        body = raw[:m.start()].count("\n")
    # У песни с вариантами ноты одни, а текстов несколько: размечается первый.
    # Иначе куплет «1.» второго варианта затёр бы первый, и аккорды легли бы
    # на чужие слова.
    marks = list(VARIANT.finditer(raw[:len("\n".join(lines[:body]))]))
    if len(marks) > 1:
        body = min(body, raw[:marks[1].start()].count("\n") + 1)
    verses, chorus, cur, in_chorus = {}, [], None, False
    for i, line in enumerate(lines[:body]):
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        if re.match(r"^Припев:?$", t, re.I):
            in_chorus, cur = True, None
            continue
        if re.match(r"^\([а-яa-zA-ZА-Я0-9]{1,3}\)$", t):   # метка варианта
            continue
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
        if not verses and rest:
            verses[1] = rest
    return raw, lines, verses, chorus


def flow_of(blocks):
    """Поток букв строф: [(буква, номер строки, позиция в строке)]."""
    out = []
    for li, off, text in blocks:
        skip = set()
        for rx in (REPEAT_TAIL, REPEAT_HEAD):
            m = rx.search(text)
            if m:
                skip |= set(range(m.start(), m.end()))
        for k, c in enumerate(text):
            lc = c.lower().replace("ё", "е")
            if k not in skip and CYR.match(lc):
                out.append((lc, li, off + k))
    return out


# --- лист ------------------------------------------------------------------

def sheet_flow(systems):
    """{номер куплета: [(буква, аккорд или None)]} по строкам листа.

    Строка без номера («Припев», хвост куплета) относится ко всем голосам:
    она поётся при каждом проведении, и в нашем файле записана один раз.
    """
    numbered = sorted({l["verse"] for s in systems for l in s["lines"] if l["verse"]})
    voices = numbered or [1]
    out = {v: [] for v in voices}
    for s in systems:
        marks = attach(s)
        for line, got in zip(s["lines"], marks):
            take = [line["verse"]] if line["verse"] else voices
            for v in take:
                if v not in out:
                    continue
                for i, (_x0, _x1, t) in enumerate(line["syls"]):
                    chord = to_english(got[i]) if i in got else None
                    for k, c in enumerate(letters(t)):
                        out[v].append((c, chord if k == 0 else None))
    return out


# --- сшивка ----------------------------------------------------------------

def transfer(sheet, ours):
    """Правки (строка, позиция, аккорд), потери и сколько букв сошлось."""
    a = [c for c, _ in sheet]
    b = [c for c, _, _ in ours]
    at = {}
    for i, (_c, ch) in enumerate(sheet):
        if ch:
            at[i] = ch
    edits, lost, hit = [], 0, {}
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                hit[i1 + k] = j1 + k
    for i, ch in at.items():
        j = hit.get(i)
        if j is None:
            lost += 1
            continue
        _c, li, pos = ours[j]
        edits.append((li, pos, ch))
    return edits, lost, len(hit)


def plan(num, sheet_files, raw=None):
    """(правки, отчёт) для одной песни. Правки — (строка, позиция, аккорд)."""
    raw, lines, verses, chorus = read_source(num, raw)
    if CHORD.search(raw):
        return None, "аккорды уже есть"
    if not verses:
        return None, "нет куплетов"
    best, report = None, "нет аккордов на листе"
    # Порядок листов — по имени: `026.pdf` раньше `026b.pdf`. Буквенный
    # суффикс у Эппа значит другую редакцию — обычно в другой тональности, и
    # аккорды с неё встали бы в текст верно по месту, но неверно по звуку.
    for name in sorted(sheet_files):
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            continue
        try:
            systems = read_sheet(path)
        except Exception as e:
            report = "лист не читается: %s" % e
            continue
        flows = sheet_flow(systems)
        edits, lost, total, fit, size = [], 0, 0, 0, 0
        for v, flow in sorted(flows.items()):
            if v not in verses:
                continue
            ours = flow_of(verses[v] + chorus)
            e, l, m = transfer(flow, ours)
            edits += e
            lost += l
            fit += m
            size += len(ours)
            total += sum(1 for _c, ch in flow if ch)
        if not total:
            continue
        # Сколько нашего текста лист вообще узнал. Мало — значит совпали
        # обрывки, и аккорды сядут разрозненно и мимо слогов («Бо{G7}г»).
        # Такую песню лучше оставить без аккордов, чем разметить наугад.
        cover = fit / size if size else 0.0
        if cover < MIN_COVER:
            report = "текст не сходится с листом (%.0f%%)" % (100 * cover)
            continue
        # Припев размечается из каждого куплета: одна и та же позиция приходит
        # несколько раз. Берётся то, что встретилось чаще — расхождение значит,
        # что куплеты легли по-разному, и большинство ближе к истине.
        by_pos = defaultdict(Counter)
        for li, pos, ch in edits:
            by_pos[(li, pos)][ch] += 1
        merged = [(li, pos, c.most_common(1)[0][0]) for (li, pos), c in by_pos.items()]
        # Первый по старшинству лист, давший разметку, и есть ответ: перебор
        # «у кого вставок больше» выбирал бы редакцию с более густой гармонией.
        best = ((len(merged), -lost), merged, name, total, lost, cover)
        if merged:
            break
    if best is None:
        return None, report
    _s, merged, name, total, lost, cover = best
    return merged, "лист %s: аккордов %d, вставлено %d, потеряно %d, текст сошёлся на %.0f%%" % (
        name, total, len(merged), lost, 100 * cover)


def apply_edits(num, edits):
    """Вставить `{X}` по координатам, справа налево — иначе поедут позиции."""
    p = os.path.join(SONGS, "%04d.txt" % num)
    lines = io.open(p, encoding="utf-8").read().split("\n")
    by_line = defaultdict(list)
    for li, pos, ch in edits:
        by_line[li].append((pos, ch))
    for li, items in by_line.items():
        s = lines[li]
        for pos, ch in sorted(items, reverse=True):
            s = s[:pos] + "{%s}" % ch + s[pos:]
        lines[li] = s
    io.open(p, "w", encoding="utf-8").write("\n".join(lines))


def load_map():
    data = json.load(io.open(os.path.join(HERE, "numbers-final.json"), encoding="utf-8"))
    return data["mapping"]


def run(apply_it=False):
    """Прогон по всей карте: отчёт, а при apply_it — ещё и запись в файлы."""
    mp = load_map()
    done, skipped, stats = [], [], Counter()
    for key in sorted(mp, key=int):
        num = int(key)
        if not os.path.exists(song_path(num)):
            skipped.append((num, "нет файла песни"))
            continue
        it = mp[key]
        files = it.get("files") or ["%03d.pdf" % it["sheet"]]
        try:
            edits, report = plan(num, files)
        except Exception as e:
            skipped.append((num, "сбой: %s" % e))
            continue
        if not edits:
            skipped.append((num, report))
            stats[report.split(":")[0]] += 1
            continue
        done.append((num, len(edits), report))
        stats["размечено"] += 1
        if apply_it:
            apply_edits(num, edits)
    with io.open(os.path.join(HERE, "chords-done.tsv"), "w", encoding="utf-8") as f:
        f.write("наш\tаккордов\tотчёт\n")
        for num, n, rep in done:
            f.write("%d\t%d\t%s\n" % (num, n, rep))
    with io.open(os.path.join(HERE, "chords-skipped.tsv"), "w", encoding="utf-8") as f:
        f.write("наш\tпричина\n")
        for num, why in skipped:
            f.write("%d\t%s\n" % (num, why))
    print("в карте %d, размечено %d, пропущено %d" % (len(mp), len(done), len(skipped)))
    print("аккордов вставлено: %d" % sum(n for _n, n, _r in done))
    for why, n in stats.most_common():
        print("   %-40s %d" % (why, n))
    return done, skipped


if __name__ == "__main__":
    if sys.argv[1] in ("run", "apply"):
        run(sys.argv[1] == "apply")
        sys.exit()
    num = int(sys.argv[1])
    mp = load_map()
    it = mp[str(num)]
    edits, report = plan(num, it.get("files") or ["%03d.pdf" % it["sheet"]])
    print(report)
    if edits:
        raw, lines, _v, _c = read_source(num)
        by_line = defaultdict(list)
        for li, pos, ch in edits:
            by_line[li].append((pos, ch))
        for li in sorted(by_line):
            s = lines[li]
            for pos, ch in sorted(by_line[li], reverse=True):
                s = s[:pos] + "{%s}" % ch + s[pos:]
            print("  %s" % s)
