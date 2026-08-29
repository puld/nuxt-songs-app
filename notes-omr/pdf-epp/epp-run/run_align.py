# -*- coding: utf-8 -*-
"""Алигнер на 60 песнях: теневой ROOT (эталоны без {…}, out → out-epp)."""
import io, os, re, sys, json, contextlib, signal
signal.alarm(560)
R = "/Users/l.romanov/workspace/my/nuxt-songs-app"
SH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shadow")
sys.path.insert(0, os.path.join(R, "notes-omr/pipeline"))
OUT = os.path.join(R, "notes-omr/out-epp")
sel = json.load(open(os.path.join(OUT, "sample60.json")))

# теневой ROOT
os.makedirs(os.path.join(SH, "songs-data/songs"), exist_ok=True)
os.makedirs(os.path.join(SH, "notes-omr/align"), exist_ok=True)
link = os.path.join(SH, "notes-omr/out")
if not os.path.islink(link): os.symlink(OUT, link)
CH = re.compile(r"\{[^}]*\}")
for num in sel:
    src = os.path.join(R, "songs-data/songs/%04d.txt" % int(num))
    txt = CH.sub("", io.open(src, encoding="utf-8").read())
    io.open(os.path.join(SH, "songs-data/songs/%04d.txt" % int(num)), "w", encoding="utf-8").write(txt)

import align, chordimport
align.ROOT = SH

res = {}
for num in sorted(sel, key=int):
    n = int(num)
    row = {}
    # без fit: выводится ли структура
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            built, bars = align.build(n)
        row["plain"] = "ok"
        row["bang"] = sum(1 for b in built if "!!" in b)
        row["q_plain"] = sum(b.split().count("?") for b in built)
    except align.NeedJournal as e:
        row["plain"] = "journal"; row["why"] = str(e)[:60]
    except Exception as e:
        row["plain"] = "error"; row["why"] = "%s: %s" % (type(e).__name__, str(e)[:60])
    # с fit
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            built, bars = align.build(n, fit=True)
        row["fit"] = "ok"
        row["q_fit"] = sum(b.split().count("?") for b in built)
        row["bang_fit"] = sum(1 for b in built if "!!" in b)
        row["verses"] = len(built)
    except align.NeedJournal as e:
        row["fit"] = "journal"; row["why_fit"] = str(e)[:60]
    except Exception as e:
        row["fit"] = "error"; row["why_fit"] = "%s: %s" % (type(e).__name__, str(e)[:60])
    # посадка аккордов на эталон
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            edits, why = chordimport.plan(n)
        row["chords_planted"] = len(edits) if edits else 0
        if why: row["chords_why"] = why
    except Exception as e:
        row["chords_planted"] = 0; row["chords_why"] = "ошибка %s" % type(e).__name__
    res[num] = row
    sys.stderr.write("%s %s/%s ch=%s\n" % (num, row.get("plain"), row.get("fit"), row.get("chords_planted")))

json.dump(res, open(os.path.join(OUT, "align-metrics.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
ok = [r for r in res.values() if r.get("plain") == "ok"]
clean = [r for r in ok if r["bang"] == 0 and r["q_plain"] == 0]
print("структура без журнала: %d/60, из них слоги сошлись чисто: %d" % (len(ok), len(clean)))
fit_ok = [r for r in res.values() if r.get("fit") == "ok"]
fit_clean = [r for r in fit_ok if r.get("q_fit", 99) == 0 and r.get("bang_fit", 99) == 0]
print("с fit=True собралось: %d/60, без единой дырки: %d, дырок всего: %d" %
      (len(fit_ok), len(fit_clean), sum(r.get("q_fit", 0) for r in fit_ok)))
pl = [r for r in res.values() if r.get("chords_planted", 0) > 0]
print("аккорды сели: %d песен, %d обозначений" % (len(pl), sum(r["chords_planted"] for r in pl)))
from collections import Counter
print("причины отказа посадки:", Counter(r.get("chords_why") for r in res.values() if r.get("chords_why")))
