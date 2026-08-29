# -*- coding: utf-8 -*-
import io, os, re, sys, json, contextlib, signal
signal.alarm(300)
R = "/Users/l.romanov/workspace/my/nuxt-songs-app"
SH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shadow")
sys.path.insert(0, os.path.join(R, "notes-omr/pipeline"))
import checkall, abcout
OUT = os.path.join(R, "notes-omr/out-epp")
pdf = os.path.join(R, "notes-omr/pdf-epp/1239t.pdf")
with contextlib.redirect_stdout(io.StringIO()):
    r = checkall.one(pdf)
    abc, sc, nums = abcout.build(pdf)
io.open(os.path.join(OUT, "1306.abc"), "w", encoding="utf-8").write(abc)
json.dump(abcout.meta_json(abc, sc, "1306", len(nums)),
          open(os.path.join(OUT, "1306.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
pm = json.load(open(os.path.join(OUT, "parse-metrics.json")))
pm["1306"] = {"pdf": "1239t.pdf", "sheet": 1239, "bars": r["bars"], "bad": r["bad"],
              "cross": r["cross"], "unk": r["unk"], "chords": r["chords"],
              "verses": r["verses"], "title": r["title"]}
json.dump(pm, open(os.path.join(OUT, "parse-metrics.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("parse:", {k: pm["1306"][k] for k in ("bars", "bad", "cross", "unk", "chords")})

import align, chordimport
align.ROOT = SH
am = json.load(open(os.path.join(OUT, "align-metrics.json")))
row = {}
try:
    with contextlib.redirect_stdout(io.StringIO()):
        built, bars = align.build(1306)
    row["plain"] = "ok"; row["bang"] = sum(1 for b in built if "!!" in b)
    row["q_plain"] = sum(b.split().count("?") for b in built)
except align.NeedJournal as e:
    row["plain"] = "journal"; row["why"] = str(e)[:60]
try:
    with contextlib.redirect_stdout(io.StringIO()):
        built, bars = align.build(1306, fit=True)
    row["fit"] = "ok"; row["q_fit"] = sum(b.split().count("?") for b in built)
    row["bang_fit"] = sum(1 for b in built if "!!" in b); row["verses"] = len(built)
except align.NeedJournal as e:
    row["fit"] = "journal"; row["why_fit"] = str(e)[:60]
try:
    with contextlib.redirect_stdout(io.StringIO()):
        edits, why = chordimport.plan(1306)
    row["chords_planted"] = len(edits) if edits else 0
    if why: row["chords_why"] = why
except Exception as e:
    row["chords_planted"] = 0; row["chords_why"] = "ошибка %s" % type(e).__name__
am["1306"] = row
json.dump(am, open(os.path.join(OUT, "align-metrics.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("align:", row)
