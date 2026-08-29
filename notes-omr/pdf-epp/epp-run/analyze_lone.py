# -*- coding: utf-8 -*-
"""Третий разрез: рассогласование КООРДИНАТ (не имён) на припевных строках.

Съехавший куплет в однородной гармонии (C-мажор) почти не даёт конфликтов
имён — C совпадает с C. Но его посадки не совпадают с большинством по
координатам. Меряем: для куплета vi — доля его посадок на припевных строках
(строки, куда пишут >=2 куплетов), координату которых не использует ни один
другой куплет."""
import json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "diag-conflicts.json")))

rows = []
for num, rec in sorted(data.items()):
    pl = rec.get("placements")
    if not pl:
        continue
    by_line_vi = collections.defaultdict(set)
    for vi, vno, j, li, pos, name in pl:
        by_line_vi[li].add(vi)
    chorus_lines = {li for li, s in by_line_vi.items() if len(s) > 1}
    coord_vis = collections.defaultdict(set)
    for vi, vno, j, li, pos, name in pl:
        coord_vis[(li, pos)].add(vi)
    per_vi = collections.defaultdict(lambda: [0, 0])
    for vi, vno, j, li, pos, name in pl:
        if li not in chorus_lines:
            continue
        d = per_vi[vi]
        d[0] += 1
        if len(coord_vis[(li, pos)] - {vi}) == 0:
            d[1] += 1
    for vi, (n, lone) in sorted(per_vi.items()):
        if n >= 3:
            rows.append((num, vi, n, lone, lone / n))

import math
hist = collections.Counter()
bins = [(0, 0), (0, .1), (.1, .2), (.2, .3), (.3, .5), (.5, .7), (.7, .9), (.9, 1.01)]
labels = ["0", "0-10%", "10-20%", "20-30%", "30-50%", "50-70%", "70-90%", "90-100%"]
for num, vi, n, lone, share in rows:
    if lone == 0:
        hist["0"] += 1
        continue
    for (lo, hi), l in zip(bins[1:], labels[1:]):
        if lo < share <= hi:
            hist[l] += 1
            break
print("куплетов на припевных строках (>=3 посадок): %d" % len(rows))
for l in labels:
    n = hist.get(l, 0)
    print("  %-8s %5d %s" % (l, n, "#" * min(n, 80)))
print("\nпримеры 20-50%:")
for r in [r for r in rows if 0.2 < r[4] <= 0.5][:12]:
    print("  %s vi=%d n=%d lone=%d share=%.2f" % r)
print("\n0112 по куплетам:", [(r[1], r[2], r[3]) for r in rows if r[0] == "0112"])
