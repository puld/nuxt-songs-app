# -*- coding: utf-8 -*-
"""Сверка по тексту под нотами — там, где заголовок листа не помог.

`mapnums.py` работает с подписью листа и упирается в предел: у 247 наших песен
похожей подписи нет вовсе. Здесь сравнивается сам текст: строка песни ищется в
сплошном потоке слогов листа (`syllables.json`, см. `syllables.py`).

Совпадение считается по **числу разных строк**, найденных на одном листе, а не
по одной самой длинной: строка из общего оборота («ислававоверивеки») встречается
у десятков песен, а две разные строки подряд — уже почти доказательство.
"""
import io, os, re, sys, json
from collections import defaultdict
from mapnums import read_ours, first_line

HERE = os.path.dirname(os.path.abspath(__file__))
PROBE = 18        # длина зонда в буквах
MIN_HITS = 4      # столько разных зондов должно совпасть (то есть 72 буквы текста)
LEAD = 2          # на столько зондов лучший кандидат должен опережать второго


def squash(s):
    return re.sub(r"[^а-я]", "", (s or "").lower().replace("ё", "е"))


def probes_of(text):
    """Зонды песни: куски текста по PROBE букв, встык.

    Раньше зондом было начало строфы — и половина песен давала единственный
    зонд, которому нечем набрать порог в две строки. Окно по сплошному тексту
    от разбиения на строки не зависит вовсе: важно, что на листе слова идут в
    том же порядке. Встык, а не внахлёст, — иначе два «разных» зонда окажутся
    двумя половинами одной фразы, и порог перестанет что-либо значить.
    """
    flat = squash(text)
    out = []
    for i in range(0, len(flat) - PROBE + 1, PROBE):
        p = flat[i:i + PROBE]
        if p not in out:
            out.append(p)
    return out


def find(probes, sheets):
    """[(число совпавших зондов, лист, файл)] — по убыванию уверенности.

    Зонд короткий (PROBE букв) намеренно: на листе в поток слов вклиниваются
    подписи автора и ремарки («…любить {ккроманов} науч и меня…»), и зонд
    подлиннее почти всегда напарывается на такую вставку. Плату за короткий
    зонд берёт порог: MIN_HITS кусков подряд — это уже строфа, а не общее место.
    """
    hits = defaultdict(set)
    for name, text in sheets.items():
        for p in probes:
            if p in text:
                hits[name].add(p)
    # Кандидат — лист, а не файл: один и тот же лист лежит в каталоге под
    # несколькими именами (1324.pdf и 1324a.pdf — та же песня в другой
    # аранжировке). Без группировки правило отрыва сравнивало бы лист сам с
    # собой и отправляло верное совпадение на приёмку.
    best = defaultdict(lambda: (0, []))
    for name, found in hits.items():
        if len(found) < MIN_HITS:
            continue
        num = int(re.match(r"(\d+)", name).group(1))
        top, files = best[num]
        best[num] = (max(top, len(found)), files + [name])
    out = [(top, num, files) for num, (top, files) in best.items()]
    out.sort(reverse=True)
    return out


def apply(ours, sheets, known, diverged):
    """Достроить карту по тексту: несопоставленные песни и расхождения."""
    added, review, still = {}, [], []
    todo = [n for n in sorted(ours) if str(n) not in known]
    for i, n in enumerate(todo, 1):
        if i % 50 == 0:
            print("  %d/%d" % (i, len(todo)))
        found = find(probes_of(ours[n][2]), sheets)
        if not found:
            still.append(n)
            continue
        top = found[0]
        second = found[1][0] if len(found) > 1 else 0
        # Отрыв от второго кандидата — единственная защита от разных редакций
        # одной песни: у Эппа они лежат отдельными листами и совпадают почти
        # одинаково (наш 211 — «Пусть море бурное» 1005 и «Вот море бурное» 861).
        if top[0] - second >= LEAD:
            added[n] = {"sheet": top[1], "via": "текст", "conf": "высокая",
                        "files": sorted(top[2]), "hits": top[0], "src": "слоги"}
        else:
            review.append((n, ours[n][0], found[:4]))
    # Расхождения зоны 1–830: текст может указать, где песня лежит на самом деле
    fixed = {}
    for item in diverged:
        n = item["ours"]
        found = find(probes_of(ours[n][2]), sheets)
        if found and (len(found) < 2 or found[0][0] - found[1][0] >= LEAD):
            fixed[n] = {"sheet": found[0][1], "hits": found[0][0],
                        "our_title": item["our_title"], "at_our_number": item["at_our_number"]}
    return added, review, still, fixed


def verify(ours, sheets, full):
    """Проверить готовую карту текстом: где текст спорит с заголовком.

    Сначала дешёвая проверка записанного листа — совпало ли на нём MIN_HITS
    зондов. Полный поиск запускается только когда она не прошла: иначе на
    каждую из полутора тысяч песен приходился бы обход всего каталога.
    """
    ok, mute, clash = [], [], []
    items = sorted(full, key=int)
    for i, key in enumerate(items, 1):
        if i % 100 == 0:
            print("  %d/%d" % (i, len(items)))
        n, sheet = int(key), full[key]["sheet"]
        pr = probes_of(ours[n][2])
        mine = [t for name, t in sheets.items()
                if re.match(r"0*%d[a-z]*\.pdf$" % sheet, name)]
        if any(sum(1 for p in pr if p in t) >= MIN_HITS for t in mine):
            ok.append(n)
            continue
        found = find(pr, sheets)
        if not found:
            mute.append(n)
        elif len(found) == 1 or found[0][0] - found[1][0] >= LEAD:
            clash.append((n, sheet, found[0][1], found[0][0], full[key]["via"]))
        else:
            mute.append(n)
    return ok, mute, clash


def report(ours, added, review, still, fixed, known):
    with io.open(os.path.join(HERE, "text-matches.tsv"), "w", encoding="utf-8") as f:
        f.write("наш\tлист\tзондов\tназвание\tфайлы\n")
        for n in sorted(added):
            it = added[n]
            f.write("%d\t%d\t%d\t%s\t%s\n" % (n, it["sheet"], it["hits"],
                                                 ours[n][0], ",".join(it["files"])))
    with io.open(os.path.join(HERE, "text-review.tsv"), "w", encoding="utf-8") as f:
        f.write("наш\tназвание\tкандидаты (зондов:лист)\n")
        for n, title, cands in review:
            f.write("%d\t%s\t%s\n" % (n, title, " ".join("%d:%d" % (c, s) for c, s, _f in cands)))
    with io.open(os.path.join(HERE, "text-missing.txt"), "w", encoding="utf-8") as f:
        for n in still:
            f.write("%d\t%s\n" % (n, ours[n][0]))
    full = dict(known)
    for n, it in added.items():
        full[str(n)] = it
    json.dump({"mapping": full, "text_fixed_diverged": {str(k): v for k, v in fixed.items()}},
              io.open(os.path.join(HERE, "numbers-final.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, sort_keys=True)
    with io.open(os.path.join(HERE, "numbers-final.tsv"), "w", encoding="utf-8") as f:
        f.write("наш\tлист\tкак\tуверенность\n")
        for k in sorted(full, key=int):
            it = full[k]
            f.write("%s\t%s\t%s\t%s\n" % (k, it["sheet"], it["via"], it["conf"]))
    print("по тексту добавлено %d, на приёмку %d, не нашлось %d" % (len(added), len(review), len(still)))
    print("итого в карте %d из %d" % (len(full), len(ours)))
    print("расхождения 1-830: текст указал лист у %d" % len(fixed))
    for n in sorted(fixed):
        it = fixed[n]
        print("   %-5d %-38s → лист %-5d (зондов %d, под нашим номером «%s»)"
              % (n, it["our_title"][:38], it["sheet"], it["hits"], it["at_our_number"]))


def main():
    sheets = json.load(io.open(os.path.join(HERE, "syllables.json"), encoding="utf-8"))
    ours = read_ours()
    known = json.load(io.open(os.path.join(HERE, "numbers.json"), encoding="utf-8"))["mapping"]

    mode = sys.argv[1] if len(sys.argv) > 1 else "check"

    if mode == "check":
        # Контроль: песни, чей лист уже известен по заголовку. Метод обязан
        # находить тот же лист — иначе им нельзя закрывать неизвестное.
        sample = sorted(int(k) for k in known)[::40]
        same = other = none = 0
        for n in sample:
            found = find(probes_of(ours[n][2]), sheets)
            want = known[str(n)]["sheet"]
            if not found:
                none += 1
                print("  %-5d нет совпадений (ждали лист %s)" % (n, want))
            elif found[0][1] == want:
                same += 1
            else:
                other += 1
                print("  %-5d нашёл лист %d, а по заголовку %s" % (n, found[0][1], want))
        print("контроль на %d песнях: совпало %d, разошлось %d, не нашлось %d"
              % (len(sample), same, other, none))
        return

    if mode == "verify":
        full = json.load(io.open(os.path.join(HERE, "numbers-final.json"), encoding="utf-8"))["mapping"]
        ok, mute, clash = verify(ours, sheets, full)
        with io.open(os.path.join(HERE, "verify-clash.tsv"), "w", encoding="utf-8") as f:
            f.write("наш\tв карте\tтекст\tзондов\tкак сопоставлено\tназвание\n")
            for n, sheet, other, hits, via in clash:
                f.write("%d\t%d\t%d\t%d\t%s\t%s\n" % (n, sheet, other, hits, via, ours[n][0]))
        with io.open(os.path.join(HERE, "verify-mute.tsv"), "w", encoding="utf-8") as f:
            f.write("наш\tлист\tкак сопоставлено\tназвание\n")
            for n in mute:
                it = full[str(n)]
                f.write("%d\t%s\t%s\t%s\n" % (n, it["sheet"], it["via"], ours[n][0]))
        print("текст подтвердил %d, промолчал %d, спорит %d" % (len(ok), len(mute), len(clash)))
        return

    if mode == "apply":
        diverged = json.load(io.open(os.path.join(HERE, "numbers.json"), encoding="utf-8"))["diverged"]
        added, review, still, fixed = apply(ours, sheets, known, diverged)
        report(ours, added, review, still, fixed, known)


if __name__ == "__main__":
    main()
