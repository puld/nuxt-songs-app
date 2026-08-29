# -*- coding: utf-8 -*-
"""Разбор 60 листов Эппа по карте recognize-plan: ABC в out-epp под НАШИМ номером."""
import io, os, sys, json, contextlib, traceback, signal
signal.alarm(560)
R = "/Users/l.romanov/workspace/my/nuxt-songs-app"
sys.path.insert(0, os.path.join(R, "notes-omr/pipeline"))
import checkall, abcout
OUT = os.path.join(R, "notes-omr/out-epp")
sel = json.load(open(os.path.join(OUT, "sample60.json")))
res = {}
for num in sorted(sel, key=int):
    pdf = os.path.join(R, "notes-omr/pdf-epp", sel[num]["pdf"])
    row = {"pdf": sel[num]["pdf"], "sheet": sel[num]["sheet"]}
    try:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            r = checkall.one(pdf)
            abc, sc, nums = abcout.build(pdf)
        io.open(os.path.join(OUT, "%04d.abc" % int(num)), "w", encoding="utf-8").write(abc)
        m = abcout.meta_json(abc, sc, num, len(nums))
        json.dump(m, open(os.path.join(OUT, "%04d.json" % int(num)), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        row.update(bars=r["bars"], bad=r["bad"], cross=r["cross"], unk=r["unk"],
                   chords=r["chords"], verses=r["verses"], title=r["title"])
    except Exception as e:
        row["error"] = "%s: %s" % (type(e).__name__, str(e)[:80])
    res[num] = row
    sys.stderr.write("%s %s\n" % (num, "OK" if "error" not in row else row["error"]))
json.dump(res, open(os.path.join(OUT, "parse-metrics.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
ok = [r for r in res.values() if "error" not in r]
print("разобрано без падения: %d/60" % len(ok))
print("bad==0:", sum(1 for r in ok if r["bad"] == 0),
      " cross==0:", sum(1 for r in ok if r["cross"] == 0),
      " unk==0:", sum(1 for r in ok if r["unk"] == 0))
print("аккордов всего:", sum(r["chords"] for r in ok))
