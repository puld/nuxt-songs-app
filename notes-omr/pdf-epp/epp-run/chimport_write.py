# -*- coding: utf-8 -*-
import os, sys, glob
sys.path.insert(0, "pipeline")
import chordimport as ci

done, total = [], 0
for p in sorted(glob.glob("out/*.abc")):
    n = int(os.path.basename(p)[:-4])
    edits, why = ci.plan(n)
    if why: continue
    ci.write(n, ci.render(n, edits))
    done.append(n); total += len(edits)
print("записано песен: %d, аккордов: %d" % (len(done), total))
print(" ".join("%04d" % n for n in done))
