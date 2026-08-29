# -*- coding: utf-8 -*-
"""Второй разрез: конфликты только на РАЗДЕЛЯЕМЫХ координатах.

Конфликт физически возможен лишь там, куда пишут двое: припев (разные куплеты)
и развёрнутый повтор (два прохода одного куплета). Метрика «куплет съехал» —
доля его посадок на разделяемых координатах, расходящихся с консенсусом
остальных куплетов, и её кучность."""
import json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "diag-conflicts.json")))

per_song = {}
verse_rows = []   # (num, vi, shared_n, dissent_n, share, max_run)
coord_votes = []  # (num, coord, {name: votes_by_verse}) для конфликтных
intra_pairs = collections.Counter()
inter_pairs = collections.Counter()

ROOT_RE = re.compile(r"^([A-Ha-h])(#|b|is|es)?")
def root(name):
    m = ROOT_RE.match(name.strip())
    return (m.group(1).upper() + (m.group(2) or "")) if m else name

for num, rec in sorted(data.items()):
    pl = rec.get("placements")
    if not pl:
        continue
    at = collections.defaultdict(list)
    for vi, vno, j, li, pos, name in pl:
        at[(li, pos)].append((vi, vno, j, name))
    shared = {k: v for k, v in at.items() if len(set(x[0] for x in v)) > 1 or len(v) > 1}
    conf = {k: v for k, v in shared.items() if len(set(x[3] for x in v)) > 1}

    # интра-конфликт: один vi, разные имена (вольта повтора)
    intra_only = inter_only = mixed = 0
    for k, v in conf.items():
        by_vi = collections.defaultdict(set)
        for vi, vno, j, name in v:
            by_vi[vi].add(name)
        has_intra = any(len(s) > 1 for s in by_vi.values())
        # межкуплетный: имена «позиций куплетов» (по одному от vi) расходятся
        verse_names = [sorted(s)[0] for s in by_vi.values()]  # грубая, уточнится ниже
        has_inter = len(set(n for s in by_vi.values() for n in s)) > 1 and len(by_vi) > 1 and \
                    len(set(frozenset(s) for s in by_vi.values())) > 1
        if has_intra and not has_inter:
            intra_only += 1
            names = sorted(set(x[3] for x in v))
            for a in range(len(names)):
                for b in range(a + 1, len(names)):
                    intra_pairs[(names[a], names[b])] += 1
        elif has_inter and not has_intra:
            inter_only += 1
            names = sorted(set(x[3] for x in v))
            for a in range(len(names)):
                for b in range(a + 1, len(names)):
                    inter_pairs[(names[a], names[b])] += 1
        else:
            mixed += 1

    # куплет vs консенсус остальных на межкуплетных координатах
    vstats = {}
    for k, v in shared.items():
        by_vi = collections.defaultdict(list)
        for vi, vno, j, name in v:
            by_vi[vi].append((j, name))
        if len(by_vi) < 2:
            continue
        for vi in by_vi:
            others = collections.Counter(
                name for ovi, lst in by_vi.items() if ovi != vi for _, name in lst)
            cons = others.most_common(1)[0][0]
            for j, name in by_vi[vi]:
                d = vstats.setdefault(vi, {"shared": 0, "bad": []})
                d["shared"] += 1
                if name != cons:
                    d["bad"].append(j)
    for vi, d in sorted(vstats.items()):
        bad = sorted(set(d["bad"]))
        run = best = 0
        prev = None
        for j in bad:
            run = run + 1 if prev is not None and j == prev + 1 else 1
            best = max(best, run)
            prev = j
        verse_rows.append((num, vi, d["shared"], len(bad),
                           len(bad) / d["shared"], best))
    per_song[num] = {"coords": len(at), "shared": len(shared), "conf": len(conf),
                     "intra_only": intra_only, "inter_only": inter_only, "mixed": mixed}

json.dump(per_song, open(os.path.join(HERE, "diag-shared.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

tot_conf = sum(v["conf"] for v in per_song.values())
print("конфликтных координат всего: %d" % tot_conf)
print("  чисто вольта (внутри одного куплета): %d (%.0f%%)"
      % (sum(v["intra_only"] for v in per_song.values()),
         100 * sum(v["intra_only"] for v in per_song.values()) / tot_conf))
print("  чисто межкуплетные:                   %d (%.0f%%)"
      % (sum(v["inter_only"] for v in per_song.values()),
         100 * sum(v["inter_only"] for v in per_song.values()) / tot_conf))
print("  смешанные:                            %d (%.0f%%)"
      % (sum(v["mixed"] for v in per_song.values()),
         100 * sum(v["mixed"] for v in per_song.values()) / tot_conf))

print("\nпесни только с вольтами (межкуплетных и смешанных нет): %d"
      % sum(1 for v in per_song.values() if v["inter_only"] == 0 and v["mixed"] == 0 and v["conf"] > 0))
print("песни без вольт (только межкуплетные): %d"
      % sum(1 for v in per_song.values() if v["intra_only"] == 0 and v["mixed"] == 0 and v["conf"] > 0))

def kinds(cnt):
    s = r = 0
    for (a, b), n in cnt.items():
        if root(a) == root(b): r += n
        else: s += n
    return s, r

s, r = kinds(intra_pairs)
print("\nвольтовые пары: другая гармония %d, same-root %d" % (s, r))
s, r = kinds(inter_pairs)
print("межкуплетные пары: другая гармония %d, same-root %d" % (s, r))

print("\nГистограмма доли расхождения куплета с консенсусом (на разделяемых координатах):")
bins = [(0, 0), (0, .05), (.05, .1), (.1, .2), (.2, .3), (.3, .5), (.5, .7), (.7, .9), (.9, 1.01)]
labels = ["0", "0-5%", "5-10%", "10-20%", "20-30%", "30-50%", "50-70%", "70-90%", "90-100%"]
hist = collections.Counter()
for num, vi, sh, bad, share, run in verse_rows:
    if bad == 0:
        hist["0"] += 1
        continue
    for (lo, hi), l in zip(bins[1:], labels[1:]):
        if lo < share <= hi:
            hist[l] += 1
            break
for l in labels:
    n = hist.get(l, 0)
    print("  %-8s %5d %s" % (l, n, "#" * min(n, 80)))

print("\nдоля расхождения -> кучность (max_run):")
for (lo, hi), l in zip(bins[1:], labels[1:]):
    rows = [r for r in verse_rows if r[3] and lo < r[4] <= hi]
    if not rows:
        continue
    runs = [r[5] for r in rows]
    print("  %-8s n=%4d mean_run=%.1f run>=3: %d%%  mean_shared=%.0f"
          % (l, len(rows), sum(runs) / len(runs),
             100 * sum(1 for x in runs if x >= 3) // len(rows),
             sum(r[2] for r in rows) / len(rows)))

# кандидаты «съехал»: куплеты с share>=0.5 — глянуть примеры глазами
cand = [r for r in verse_rows if r[4] >= 0.5 and r[3] >= 3]
print("\nкуплеты с расхождением >=50%% и >=3 конфликтов: %d" % len(cand))
for r in sorted(cand, key=lambda x: -x[4])[:15]:
    print("  песня %s vi=%d shared=%d bad=%d share=%.2f run=%d" % r)
