# -*- coding: utf-8 -*-
"""Правило v2 для «разные аккорды на один слог» — реализация в обвязке.

Вместо отказа всей песни:
1) МОДА ИМЁН: по каждой общей координате голосуют куплеты (вольта даёт куплету
   оба имени). Куплет, чьи имена расходятся с модой в доле >= DROP своих
   посадок на общих координатах (и таких расхождений >= MIN_BAD), отброшен
   ЦЕЛИКОМ: замер показал, что такая доля — съехавшая раскладка (сдвиг на
   1-2 слога) или модуляция, и его куплетные строки так же подозрительны.
   При ничьей голосов никто не «расходится» — координата просто конфликтна.
2) КООРДИНАТНАЯ БАЗА: на припевной строке (куда пишут >=2 уцелевших куплетов)
   сажаются только координаты самого раннего уцелевшего куплета: шаблон нот в
   chords_by_syllable считан по hand[0], и ранняя раскладка надёжнее всех;
   съехавшая группа куплетов иначе давала бы ДУБЛИ на соседних слогах
   (найдено контролем на песне 0112 — C на «Смот» и на «ри» разом).
   Прочие посадки строки не сажаются, но работают контролёрами имён.
3) Конфликт имён на принятой координате — слог остаётся БЕЗ аккорда: 83%
   конфликтных пар — другая гармония (не обращение), молча выбранный аккорд
   был бы ложью для части проходов.

Пороги из замера (analyze_shared.py): доля <30% нигде не объяснима сдвигом
(0% серий из 3+ подряд), >=50% объяснима в большинстве; DROP=0.3 — снизу.

pipeline/ не меняется; всё поверх diag_conflicts.collect.
"""
import json, os, sys, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import driver
from driver import ci

DROP = 0.30
MIN_BAD = 2

HERE = os.path.dirname(os.path.abspath(__file__))


def resolve(placements):
    """(правки, dropped, empty, offbase). Правка — (li, pos, name)."""
    at = collections.defaultdict(list)
    for vi, vno, j, li, pos, name in placements:
        at[(li, pos)].append((vi, name))

    # --- шаг 1: отбраковка по моде имён ---------------------------------
    names_by_vi = {}
    for k, v in at.items():
        d = collections.defaultdict(set)
        for vi, name in v:
            d[vi].add(name)
        names_by_vi[k] = d
    stats = collections.defaultdict(lambda: [0, 0])   # vi -> [общих, расхождений]
    for k, d in names_by_vi.items():
        if len(d) < 2:
            continue
        votes = collections.Counter()
        for vi, ns in d.items():
            for n in ns:
                votes[n] += 1
        top = max(votes.values())
        winners = {n for n, c in votes.items() if c == top}
        for vi, ns in d.items():
            st = stats[vi]
            st[0] += 1
            if not (ns & winners):
                st[1] += 1
    dropped = sorted(vi for vi, (sh, bad) in stats.items()
                     if sh and bad >= MIN_BAD and bad / sh >= DROP)

    # --- шаг 2: координатная база на припевных строках -------------------
    live = collections.defaultdict(list)
    for vi, vno, j, li, pos, name in placements:
        if vi not in dropped:
            live[(li, pos)].append((vi, name))
    line_vis = collections.defaultdict(set)
    for (li, pos), v in live.items():
        for vi, _ in v:
            line_vis[li].add(vi)
    base_vi = {li: min(s) for li, s in line_vis.items() if len(s) > 1}

    edits, empty, offbase = [], 0, 0
    for (li, pos), v in sorted(live.items()):
        if li in base_vi and base_vi[li] not in {vi for vi, _ in v}:
            offbase += 1
            continue
        names = {name for _, name in v}
        if len(names) > 1:
            empty += 1
            continue
        edits.append((li, pos, names.pop()))
    return edits, dropped, empty, offbase


def main():
    data = json.load(open(os.path.join(HERE, "diag-conflicts.json")))
    driver.use_shadow()
    res = {}
    tot = collections.Counter()
    for num, rec in sorted(data.items()):
        pl = rec.get("placements")
        if not pl:
            res[num] = {"why": rec.get("why")}
            tot["отказ до посадки"] += 1
            continue
        edits, dropped, empty, offbase = resolve(pl)
        if not edits:
            res[num] = {"why": "нет аккордов после правила", "dropped": dropped}
            tot["нет аккордов после правила"] += 1
            continue
        try:
            ci.render(int(num), edits)   # проверка обратимости, БЕЗ записи
        except AssertionError:
            res[num] = {"why": "вставка меняет текст"}
            tot["вставка меняет текст"] += 1
            continue
        res[num] = {"chords_n": len(edits), "dropped_verses": dropped,
                    "empty_slots": empty, "offbase": offbase,
                    "verses_skipped_match": rec.get("skipped", []),
                    "edits": edits}
        tot["посажено"] += 1
        tot["аккордов"] += len(edits)
        tot["куплетов отброшено"] += len(dropped)
        tot["слогов без аккорда (конфликт)"] += empty
        tot["посадок мимо базовой раскладки"] += offbase
    out = os.path.join(HERE, "rescue-plan.json")
    json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print("итог по %d песням:" % len(res))
    for k, v in tot.items():
        print("  %-32s %d" % (k, v))
    print("записано:", out)
    dd = [len(r.get("dropped_verses", [])) for r in res.values() if "chords_n" in r]
    print("песен с отброшенными куплетами: %d; максимум в песне: %d"
          % (sum(1 for x in dd if x), max(dd) if dd else 0))


if __name__ == "__main__":
    main()
