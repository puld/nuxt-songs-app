# -*- coding: utf-8 -*-
import io, os, json, re
R = "/Users/l.romanov/workspace/my/nuxt-songs-app"
OUT = os.path.join(R, "notes-omr/out-epp")
pm = json.load(open(os.path.join(OUT, "parse-metrics.json")))
for num in ["848", "971", "1192", "1436", "1565"]:
    n = int(num)
    meta = json.load(open(os.path.join(OUT, "%04d.json" % n)))
    abc = io.open(os.path.join(OUT, "%04d.abc" % n), encoding="utf-8").read()
    w = next((l[2:].strip() for l in abc.splitlines() if l.startswith("w:")), "")
    ref = io.open(os.path.join(R, "songs-data/songs/%04d.txt" % n), encoding="utf-8").read()
    first = next(l.strip() for l in ref.splitlines() if l.strip() and not l.startswith("#"))
    ref_line1 = next((l.strip() for l in ref.splitlines() if re.match(r"\s*1\.", l)), "")
    print("наш %s (лист %s, %s)" % (num, pm[num]["sheet"], pm[num]["pdf"]))
    print("  заголовок листа: %s" % meta["title"])
    print("  наш заголовок:   %s" % first.lstrip("#0123456789 "))
    print("  w: %s" % re.sub(r"\{[^}]*\}", "", w)[:90])
    print("  1. %s" % re.sub(r"\{[^}]*\}", "", ref_line1)[:90])
    print()
