# -*- coding: utf-8 -*-
"""Карта номеров: наша песня → номер нотного листа Эппа.

Отличие от `match.py`: тот сопоставлял с подписями `catalog.tsv`, обрезанными
до двух-трёх слов, и вынужден был угадывать. Здесь основа — заголовок,
напечатанный на самом листе (`headings.json`, см. `headings.py`): он полный.
Подпись каталога остаётся резервом для листов, где заголовка нет.

Две зоны, и правила в них разные по существу:

* **1–830** — сборник общий, номер сам по себе почти доказательство. Задача не
  «найти», а **проверить**: сходится ли заголовок листа с нашим названием. Где
  не сходится, там либо опечатка издателя, либо под этим номером у него другая
  песня — такие случаи выписываются отдельно, вслепую их принимать нельзя.
* **выше 830** — у Эппа свой сборник по алфавиту первой строки, номера ничего
  не значат, и единственная связь — название.

Итог — `numbers.json` и `numbers.tsv`: наш номер, номер листа, основание и
уверенность. Спорное не попадает в карту, а уходит в `numbers-review.tsv`.
"""
import io, os, re, glob, json, difflib
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SPLIT = 830              # граница общей нумерации
PREF_NUM = 8             # префикс названия, когда номер уже совпал
PREF_TITLE = 18          # префикс названия, когда сверяемся только по нему
HAY_NUM = 12             # заголовок целиком найден в тексте, номер уже совпал
HAY_TITLE = 22           # то же, но номер ничего не подтверждает
PR_NUM = (10, 0.88)      # (длина, сходство) нечёткого префикса при совпавшем номере
PR_TITLE = (20, 0.95)    # то же, когда номер ничего не подтверждает


def norm(s):
    s = (s or "").replace("&nbsp;", " ").replace(" ", " ").lower().replace("ё", "е")
    return re.sub(r"\s+", " ", re.sub(r"[^а-яa-z0-9 ]+", " ", s)).strip()


def prefix_hit(a, b, least):
    """Одно название — начало другого, длиной не меньше `least` символов."""
    a, b = norm(a), norm(b)
    n = min(len(a), len(b))
    return n >= least and a[:n] == b[:n]


def ratio(a, b):
    return difflib.SequenceMatcher(None, norm(a)[:70], norm(b)[:70]).ratio()


def prefix_ratio(probe, head, limits):
    """Насколько заголовок листа похож на начало нашей строки той же длины.

    Строгое равенство префиксов ломает любая опечатка издателя («В жизненом
    море» вместо «В жизненном») и любое расхождение в форме слова («проснися»
    вместо «проснись»), а сравнение строк целиком тонет в нашем хвосте: наше
    название втрое длиннее подписи. Поэтому наша строка обрезается по длине
    подписи, и сравниваются только эти части.
    """
    least, need = limits
    a, b = norm(probe), norm(head)
    if len(b) < least:
        return False
    return difflib.SequenceMatcher(None, a[:len(b)], b).ratio() >= need


def in_text(head, hay, least):
    """Заголовок листа встречается в тексте песни как есть.

    Самый прямой признак родства и единственный, который ловит подписи по
    строке припева: наша «Он жив! Собой Он смерть попрал» подписана у Эппа
    «Он жив! Он жив!» — ни началом названия, ни похожестью такое не поймать,
    а в тексте эта строка стоит буквально. Порог длины отсекает совпадения
    вроде «к труду», которые нашлись бы у десятка песен.
    """
    head = norm(head)
    return len(head) >= least and head in hay


REPEAT = re.compile(r"/([^/]+?)/\s*(\d)\s*р")


def expand_repeats(line):
    """`/Осанна! /3р.` → «Осанна! Осанна! Осанна!» (до трёх повторов)."""
    return REPEAT.sub(lambda m: (" " + m.group(1).strip()) * min(int(m.group(2)), 3), line)


def first_line(stanza):
    """Первая пропеваемая строка строфы, очищенная от разметки.

    Номер куплета, подпись «Припев:», маркеры повтора и подголоски в круглых
    скобках к тексту не относятся: подписывая лист, издатель их не набирал.
    Если после чистки от строки ничего не осталось (подпись стояла своей
    строкой) — берётся следующая.
    """
    for raw in stanza:
        line = re.sub(r"\{[^}]*\}", " ", raw)               # аккорды
        line = re.sub(r"\([^)]*\)", " ", line)              # подголоски
        line = re.sub(r"^\s*(припев|проигрыш)\s*:?", " ", line, flags=re.I)
        line = re.sub(r"^\s*\d+\s*[.)]", " ", line)          # номер куплета
        line = re.sub(r"/\s*\d*\s*р?\.?", " ", line)        # повторы
        line = re.sub(r"\s+", " ", line).strip(" -–—")
        if len(line) > 3:
            return line
    return ""


# --- наши песни: номер → (название, начала строф, текст целиком) ---
def read_ours():
    """Номер → (название, первые строки всех строф).

    Начала строф нужны потому, что Эпп подписывает лист **первой строкой** —
    и нередко это первая строка припева, а не куплета: наша «Он жив! Собой Он
    смерть попрал» лежит у него как «Он жив! Он жив!». Сверяясь только с
    названием, такие песни выглядят несопоставимыми, хотя номер совпадает.
    """
    ours = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "songs-data/songs/*.txt"))):
        lines = io.open(path, encoding="utf-8").read().splitlines()
        m = re.match(r"#(\d+)\s+(.*)", lines[0].strip())
        if not m:
            continue

        stanzas, cur = [], []
        for raw in lines[1:]:
            line = raw.strip()
            if line.startswith(("#", "@")):
                continue
            if not line:
                if cur:
                    stanzas.append(cur)
                    cur = []
                continue
            cur.append(line)
        if cur:
            stanzas.append(cur)

        starts = []
        for stanza in stanzas:
            line = first_line(stanza)
            if line and line not in starts:
                starts.append(line)

        # Полный текст — без чистки скобок: издатель подписывает лист строкой
        # как она напечатана, а в ней подголоски бывают частью строки
        # («Он жив! (Он жив!)» → лист «Он жив! Он жив!»). Повторы раскрываются
        # по той же причине: у нас `/Осанна! /3р.`, а на листе выписано
        # «Осанна, осанна, осанна!».
        hay = norm(" ".join(expand_repeats(l) for st in stanzas for l in st))
        ours[int(m.group(1))] = (m.group(2).strip(), starts, hay)
    return ours


# --- их листы: номер → [(файл, название, источник названия)] ---
def read_sheets():
    heads = {}
    hpath = os.path.join(HERE, "headings.json")
    if os.path.exists(hpath):
        heads = json.load(io.open(hpath, encoding="utf-8"))

    sheets = defaultdict(list)
    for line in io.open(os.path.join(HERE, "catalog.tsv"), encoding="utf-8"):
        url, _, cap = line.rstrip("\n").partition("\t")
        m = re.match(r"Daten/(\d+)([a-zA-Zа-яА-Я]*)\.pdf$", url)
        if not m:
            continue
        name = os.path.basename(url)
        num = int(m.group(1))
        # Заголовок с листа полный, подпись каталога обрезана — лист в приоритете
        head = heads.get(name) or {}
        if head.get("title"):
            title, src = head["title"], "лист"
        else:
            cap = cap.replace("&nbsp;", " ").replace(" ", " ")
            title, src = re.sub(r"^[^А-Яа-яЁё]*", "", cap).strip(), "каталог"
        sheets[num].append({"file": name, "title": title, "src": src})
    return sheets


def main():
    ours, sheets = read_ours(), read_sheets()

    # Инвертированный индекс «слово → номер листа»: перебор всех листов на
    # каждую песню — это миллионы вызовов difflib и минуты вместо секунд.
    words = defaultdict(set)
    for num, items in sheets.items():
        for it in items:
            for w in set(norm(it["title"]).split()):
                if len(w) > 2:
                    words[w].add(num)

    def candidates(probes):
        cnt = defaultdict(int)
        for probe in probes:
            for w in set(norm(probe).split()):
                if len(w) > 2:
                    for num in words.get(w, ()):
                        cnt[num] += 1
        return [num for num, c in cnt.items() if c >= 2]

    mapping, review, missing, diverged = {}, [], [], []

    for n, (title, starts, hay) in sorted(ours.items()):
        probes = [title] + starts
        same = sheets.get(n, [])

        # 1) тот же номер — проверяем, а не ищем
        conflict = None
        if same:
            hit = [it for it in same
                   if in_text(it["title"], hay, HAY_NUM)
                   or any(prefix_hit(p, it["title"], PREF_NUM)
                          or prefix_ratio(p, it["title"], PR_NUM)
                          or ratio(p, it["title"]) > 0.75
                          for p in probes)]
            if hit:
                mapping[n] = {"sheet": n, "via": "номер", "conf": "высокая",
                              "files": [it["file"] for it in same],
                              "their_title": hit[0]["title"], "src": hit[0]["src"]}
                continue
            # Под нашим номером у издателя лежит не наша песня. Это и есть
            # расхождение нумерации — независимо от того, найдётся ли наша
            # песня где-то ещё: половина таких случаев не находится вовсе.
            if n <= SPLIT:
                conflict = same[0]["title"]

        # 2) поиск по названию во всём каталоге
        cands = []
        for num in candidates(probes):
            for it in sheets[num]:
                pref = (any(prefix_hit(p, it["title"], PREF_TITLE)
                            or prefix_ratio(p, it["title"], PR_TITLE) for p in probes)
                        or in_text(it["title"], hay, HAY_TITLE))
                r = max(ratio(p, it["title"]) for p in probes)
                if pref or r >= 0.70:
                    cands.append((round(r, 3), pref, num, it["title"], it["src"]))
        cands.sort(reverse=True)
        strong = [c for c in cands if c[1] or c[0] >= 0.90]

        # Найденное «по названию» под ДРУГИМ номером в общей зоне — самое
        # интересное: именно там наша нумерация расходится с нотами.
        if strong:
            sheet = strong[0][2]
            conf = "высокая" if strong[0][1] else "средняя"
            mapping[n] = {"sheet": sheet, "via": "название", "conf": conf,
                          "files": [it["file"] for it in sheets[sheet]],
                          "their_title": strong[0][3], "src": strong[0][4]}
            if conflict is not None:
                diverged.append((n, title, conflict, sheet, strong[0][3]))
            continue

        if conflict is not None:
            diverged.append((n, title, conflict, None, ""))

        if cands or same:
            extra = [(0.0, False, n, it["title"], it["src"]) for it in same]
            review.append((n, title, (cands[:3] + extra)[:4]))
        else:
            missing.append((n, title))

    # --- запись ---
    json.dump({"split": SPLIT,
               "mapping": {str(k): v for k, v in sorted(mapping.items())},
               "diverged": [{"ours": n, "our_title": t, "at_our_number": c,
                             "sheet": s, "their_title": tt}
                            for n, t, c, s, tt in diverged]},
              io.open(os.path.join(HERE, "numbers.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    with io.open(os.path.join(HERE, "numbers.tsv"), "w", encoding="utf-8") as f:
        f.write("наш\tлист\tоснование\tуверенность\tнаше название\tназвание листа\n")
        for n, v in sorted(mapping.items()):
            f.write("%d\t%s\t%s\t%s\t%s\t%s\n" % (
                n, v["sheet"], v["via"], v["conf"], ours[n][0], v.get("their_title", "")))

    with io.open(os.path.join(HERE, "numbers-review.tsv"), "w", encoding="utf-8") as f:
        f.write("наш\tнаше название\tсходство\tлист\tназвание листа\n")
        for n, t, cs in review:
            for r, _pref, num, ct, _src in cs:
                f.write("%d\t%s\t%.2f\t%s\t%s\n" % (n, t, r, num, ct))

    with io.open(os.path.join(HERE, "numbers-diverged.tsv"), "w", encoding="utf-8") as f:
        f.write("наш\tнаше название\tчто у них под нашим номером\tнаш лист\tназвание листа\n")
        for n, t, c, s, tt in diverged:
            f.write("%d\t%s\t%s\t%s\t%s\n" % (n, t, c, s if s else "не найдена", tt))

    io.open(os.path.join(HERE, "numbers-missing.txt"), "w", encoding="utf-8").write(
        "\n".join("%d\t%s" % (n, t) for n, t in missing) + "\n")

    hi = sum(1 for v in mapping.values() if v["conf"] == "высокая")
    zone1 = [n for n in mapping if n <= SPLIT]
    zone2 = [n for n in mapping if n > SPLIT]
    print("наших песен: %d" % len(ours))
    print("  сопоставлено: %d (высокая %d, средняя %d)" % (len(mapping), hi, len(mapping) - hi))
    print("    в зоне 1-%d: %d из %d" % (SPLIT, len(zone1), sum(1 for n in ours if n <= SPLIT)))
    print("    выше %d:    %d из %d" % (SPLIT, len(zone2), sum(1 for n in ours if n > SPLIT)))
    print("  на приёмку:   %d  → numbers-review.tsv" % len(review))
    print("  без кандидатов: %d  → numbers-missing.txt" % len(missing))
    print("номер расходится в зоне 1-%d: %d  → numbers-diverged.tsv" % (SPLIT, len(diverged)))
    for n, t, c, s, tt in diverged:
        print("  наш %-5d «%s»" % (n, t))
        print("        под их №%d: «%s»" % (n, c))
        print("        наша песня: %s" % ("лист %d «%s»" % (s, tt) if s else "не найдена"))


if __name__ == "__main__":
    main()
