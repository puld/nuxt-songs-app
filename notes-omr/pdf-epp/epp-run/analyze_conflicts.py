# -*- coding: utf-8 -*-
"""Анализ diag-conflicts.json: гистограмма доли конфликтов, типология пар,
локализация по куплетам, кучность (подряд ли конфликтующие слоги куплета)."""
import json, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "diag-conflicts.json")))

ROOT_RE = re.compile(r"^([A-Ha-h])(#|b|is|es)?")

def root(name):
    m = ROOT_RE.match(name.strip())
    return (m.group(1).upper() + (m.group(2) or "")) if m else name

songs = {}
pair_counter = collections.Counter()
pair_kind = collections.Counter()

for num, rec in sorted(data.items()):
    pl = rec.get("placements")
    if pl is None:
        songs[num] = {"why": rec.get("why")}
        continue
    at = collections.defaultdict(list)   # (li,pos) -> [(vi, verse_no, j, name)]
    for vi, vno, j, li, pos, name in pl:
        at[(li, pos)].append((vi, vno, j, name))
    total = len(at)
    conf_coords = {k: v for k, v in at.items() if len(set(x[3] for x in v)) > 1}
    conf = len(conf_coords)

    # типология пар: уникальные пары имён на координате
    intra = 0  # конфликт внутри одного куплета (развёрнутый повтор)
    for k, v in conf_coords.items():
        names = sorted(set(x[3] for x in v))
        by_vi = collections.defaultdict(set)
        for vi, vno, j, name in v:
            by_vi[vi].add(name)
        if any(len(s) > 1 for s in by_vi.values()):
            intra += 1
        for a in range(len(names)):
            for b in range(a + 1, len(names)):
                pair_counter[(names[a], names[b])] += 1
                pair_kind["same_root" if root(names[a]) == root(names[b]) else "other_harmony"] += 1

    # локализация: для каждого куплета — его посадки и конфликтные среди них
    # эталон координаты = имя от куплета с наименьшим vi
    ref = {}
    for k, v in at.items():
        ref[k] = min(v)[3]
    per_verse = {}
    for vi, vno, j, li, pos, name in pl:
        d = per_verse.setdefault(vi, {"total": 0, "bad": [], "vno": vno})
        d["total"] += 1
        if name != ref[(li, pos)]:
            d["bad"].append(j)
    verse_stats = []
    for vi, d in sorted(per_verse.items()):
        bad = sorted(set(d["bad"]))
        # max run подряд идущих конфликтных j (по звучащим слогам куплета)
        run, best, prev = 0, 0, None
        for j in bad:
            run = run + 1 if prev is not None and j == prev + 1 else 1
            best = max(best, run)
            prev = j
        verse_stats.append({"vi": vi, "vno": d["vno"], "total": d["total"],
                            "bad": len(bad), "share": len(bad) / d["total"] if d["total"] else 0,
                            "max_run": best})
    songs[num] = {"total": total, "conf": conf, "share": conf / total if total else 0,
                  "intra": intra, "verses": verse_stats,
                  "skipped": rec.get("skipped", [])}

json.dump(songs, open(os.path.join(HERE, "diag-analysis.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# --- сводки -----------------------------------------------------------------
ok = {k: v for k, v in songs.items() if "why" not in v}
noconf = [k for k, v in ok.items() if v["conf"] == 0]
print("песен разобрано: %d, с посадками: %d, без единого конфликта при пересборе: %d"
      % (len(songs), len(ok), len(noconf)))
if noconf:
    print("  без конфликта:", " ".join(noconf[:20]))
for k, v in songs.items():
    if "why" in v:
        print("  отказ до посадки: %s — %s" % (k, v["why"]))

print("\nГистограмма доли конфликтных слогов (по песням):")
bins = [0, .01, .02, .03, .05, .08, .12, .2, .3, .5, 1.01]
labels = ["0", "0-1%", "1-2%", "2-3%", "3-5%", "5-8%", "8-12%", "12-20%", "20-30%", "30-50%", ">50%"]
hist = collections.Counter()
for k, v in ok.items():
    s = v["share"]
    if s == 0:
        hist["0"] += 1
        continue
    for i in range(1, len(bins)):
        if bins[i - 1] < s <= bins[i] or (i == len(bins) - 1 and s > bins[i - 1]):
            hist[labels[i]] += 1
            break
for l in labels:
    n = hist.get(l, 0)
    print("  %-7s %4d %s" % (l, n, "#" * n))

print("\nТипология конфликтующих пар (по координатам):")
tot = sum(pair_kind.values())
for k, n in pair_kind.most_common():
    print("  %-14s %5d (%.0f%%)" % (k, n, 100.0 * n / tot))
print("топ-пары:")
for (a, b), n in pair_counter.most_common(15):
    print("  %-8s vs %-8s %4d  %s" % (a, b, n, "same-root" if root(a) == root(b) else "HARM"))

print("\nВнутрикуплетные конфликты (развёрнутый повтор): песен=%d, координат=%d"
      % (sum(1 for v in ok.values() if v["intra"]), sum(v["intra"] for v in ok.values())))

print("\nГистограмма доли конфликтов по КУПЛЕТАМ (bad/total куплета):")
vhist = collections.Counter()
vtot = 0
runs_ge3 = 0
for k, v in ok.items():
    for vs in v["verses"]:
        if vs["bad"] == 0:
            vhist["0"] += 1
        else:
            s = vs["share"]
            for i in range(1, len(bins)):
                if bins[i - 1] < s <= bins[i] or (i == len(bins) - 1 and s > bins[i - 1]):
                    vhist[labels[i]] += 1
                    break
            if vs["max_run"] >= 3:
                runs_ge3 += 1
        vtot += 1
for l in labels:
    n = vhist.get(l, 0)
    print("  %-7s %5d %s" % (l, n, "#" * min(n, 80)))
print("куплетов всего: %d; конфликтных куплетов с серией >=3 подряд: %d" % (vtot, runs_ge3))

# связь доли и кучности: у куплетов с высокой долей — длинные серии?
print("\nдоля конфликтов куплета -> средний max_run:")
buck = collections.defaultdict(list)
for k, v in ok.items():
    for vs in v["verses"]:
        if vs["bad"]:
            key = min(int(vs["share"] * 10), 9)
            buck[key].append(vs["max_run"])
for key in sorted(buck):
    arr = buck[key]
    print("  %2d0%%..: n=%4d, mean_run=%.1f, run>=3: %d%%"
          % (key, len(arr), sum(arr) / len(arr), 100 * sum(1 for x in arr if x >= 3) // len(arr)))
