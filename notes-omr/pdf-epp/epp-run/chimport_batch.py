# -*- coding: utf-8 -*-
import io, os, re, sys, glob, collections
sys.path.insert(0, "pipeline")
import chordimport as ci

ok, why = {}, collections.Counter()
whopeer = collections.defaultdict(list)
for p in sorted(glob.glob("out/*.abc")):
    n = int(os.path.basename(p)[:-4])
    try:
        edits, reason = ci.plan(n)
    except Exception as e:
        reason, edits = "исключение " + type(e).__name__, None
    if reason:
        why[reason] += 1; whopeer[reason].append(n); continue
    try:
        ci.render(n, edits)
    except AssertionError:
        why["вставка меняет текст"] += 1; whopeer["вставка меняет текст"].append(n); continue
    ok[n] = len(edits)

print("готово песен: %d, аккордов: %d" % (len(ok), sum(ok.values())))
for r, c in why.most_common():
    print("  %-45s %3d  %s" % (r, c, " ".join("%04d" % x for x in whopeer[r][:14])))
