# -*- coding: utf-8 -*-
"""Детектор природы межкуплетного расхождения.

Для каждого (песня, куплет) с конфликтами на общих координатах:
- сдвиг: доля совпадений имён с консенсусом при сдвиге позиции на k=-2..2
  (съехавшая раскладка даст пик при k != 0);
- транспозиция: постоянен ли интервал между корнем куплета и корнем консенсуса
  (модуляция куплета даст один и тот же интервал != 0)."""
import json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "diag-conflicts.json")))

PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11, "H": 11}
def pitch(name):
    m = re.match(r"^([A-Ha-h])(#|b)?", name.strip())
    if not m:
        return None
    p = PC[m.group(1).upper()]
    if m.group(2) == "#": p += 1
    if m.group(2) == "b": p -= 1
    return p % 12

rows = []
for num, rec in sorted(data.items()):
    pl = rec.get("placements")
    if not pl:
        continue
    at = collections.defaultdict(list)
    for vi, vno, j, li, pos, name in pl:
        at[(li, pos)].append((vi, name))
    # общие координаты, упорядоченные по файлу — это слоги припева по порядку
    shared = sorted(k for k, v in at.items() if len(set(x[0] for x in v)) > 1)
    if not shared:
        continue
    by_vi = collections.defaultdict(dict)   # vi -> {slot_index: name}
    for idx, k in enumerate(shared):
        for vi, name in at[k]:
            by_vi[vi].setdefault(idx, name)  # при вольте берём первый проход
    for vi, mine in sorted(by_vi.items()):
        cons = {}
        for idx in range(len(shared)):
            votes = collections.Counter()
            for ovi, om in by_vi.items():
                if ovi != vi and idx in om:
                    votes[om[idx]] += 1
            if votes:
                cons[idx] = votes.most_common(1)[0][0]
        common = [i for i in mine if i in cons]
        if not common:
            continue
        bad = sum(1 for i in common if mine[i] != cons[i])
        if bad == 0:
            continue
        share = bad / len(common)
        # сдвиг
        best_k, best_hit = 0, 1 - share
        for k in (-2, -1, 1, 2):
            pts = [i for i in mine if i + k in cons]
            if len(pts) < 3:
                continue
            hit = sum(1 for i in pts if mine[i] == cons[i + k]) / len(pts)
            if hit > best_hit + 1e-9:
                best_k, best_hit = k, hit
        # транспозиция
        ivals = collections.Counter()
        for i in common:
            a, b = pitch(mine[i]), pitch(cons[i])
            if a is not None and b is not None:
                ivals[(a - b) % 12] += 1
        top_iv, top_n = (ivals.most_common(1)[0] if ivals else ((0), 0))
        rows.append(dict(num=num, vi=vi, n=len(common), bad=bad, share=round(share, 2),
                         base_hit=round(1 - share, 2), best_k=best_k,
                         best_hit=round(best_hit, 2),
                         iv=top_iv, iv_share=round(top_n / max(1, sum(ivals.values())), 2)))

json.dump(rows, open(os.path.join(HERE, "diag-shift.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

hi = [r for r in rows if r["share"] >= 0.5 and r["bad"] >= 3]
lo = [r for r in rows if r["share"] < 0.3]
print("куплетов с расхождением: всего %d, сильным (>=50%%, >=3): %d, слабым (<30%%): %d"
      % (len(rows), len(hi), len(lo)))

shifted = [r for r in hi if r["best_k"] != 0 and r["best_hit"] >= 0.7]
transposed = [r for r in hi if r["iv"] != 0 and r["iv_share"] >= 0.7]
print("\nсреди сильных (кандидаты «съехало»):")
print("  объяснимы сдвигом на +-1..2 слога (hit>=0.7): %d" % len(shifted))
print("  объяснимы транспозицией (один интервал, >=70%% пар): %d" % len(transposed))
print("  прочие: %d" % len([r for r in hi if r not in shifted and r not in transposed]))
print("\nсдвиговые:")
for r in shifted:
    print("  %s" % r)
print("\nтранспонированные (топ-10):")
for r in sorted(transposed, key=lambda x: -x["iv_share"])[:10]:
    print("  %s" % r)
print("\nпрочие сильные (топ-15 по bad):")
rest = [r for r in hi if r not in shifted and r not in transposed]
for r in sorted(rest, key=lambda x: -x["bad"])[:15]:
    print("  %s" % r)

print("\nслабые: объяснимы сдвигом: %d из %d"
      % (len([r for r in lo if r["best_k"] != 0 and r["best_hit"] >= 0.7]), len(lo)))
