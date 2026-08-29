# -*- coding: utf-8 -*-
import json, os, statistics
from collections import Counter
R = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr/out-epp"
pm = json.load(open(os.path.join(R, "parse-metrics.json")))
am = json.load(open(os.path.join(R, "align-metrics.json")))
ok = [r for r in pm.values() if "error" not in r]
print("== разбор ==")
print("файлов: %d, тактов: %d" % (len(ok), sum(r["bars"] for r in ok)))
badf = [r for r in ok if r["bad"] > 0]
print("bad==0: %d; файлов с расхождениями: %d, плохих голосо-тактов: %d (%s)" %
      (len(ok) - len(badf), len(badf), sum(r["bad"] for r in badf),
       sorted((r["bad"] for r in badf), reverse=True)))
print("перекрёсты: %d; unk: %s" % (sum(r["cross"] for r in ok),
      {k: v["unk"] for k, v in pm.items() if v.get("unk")}))
print("аккордов извлечено: %d (медиана %d)" % (sum(r["chords"] for r in ok),
      statistics.median(r["chords"] for r in ok)))
print()
print("== алигнер ==")
plain_ok = [k for k, r in am.items() if r.get("plain") == "ok"]
plain_clean = [k for k in plain_ok if am[k]["bang"] == 0 and am[k]["q_plain"] == 0]
print("структура без журнала: %d, из них чисто: %d" % (len(plain_ok), len(plain_clean)))
print("причины журнала:", Counter(am[k].get("why", "")[:40] for k in am if am[k].get("plain") == "journal"))
nohand = [k for k, r in am.items() if r.get("fit") != "ok"]
print("fit не собрался:", {k: am[k].get("why_fit") for k in nohand})
fit_res = [(k, am[k].get("q_fit", 0), am[k].get("bang_fit", 0)) for k in am if am[k].get("fit") == "ok"]
holes = sorted((q for _, q, _ in fit_res if q), reverse=True)
fit_clean = [k for k, q, b in fit_res if q == 0 and b == 0]
print("fit ok: %d, из них без дырок и !!: %d; дырки: сумма %d, медиана %s, топ: %s" %
      (len(fit_res), len(fit_clean), sum(holes), statistics.median(holes) if holes else 0, holes[:8]))
manual_free = set(plain_ok) | set(fit_clean)
print("без ручной работы (plain ok ИЛИ fit без дырок): %d/60 = %.0f%%" %
      (len(manual_free), 100 * len(manual_free) / 60))
# связь с разбором
dirty = {k for k, r in pm.items() if r.get("bad", 99) > 0}
mf_dirty = len(manual_free & dirty)
print("из %d файлов с грязным разбором без ручной: %d; из %d чистых: %d" %
      (len(dirty), mf_dirty, 60 - len(dirty), len(manual_free) - mf_dirty))
print()
print("== аккорды на эталон ==")
planted = [(k, am[k]["chords_planted"]) for k in am if am[k].get("chords_planted", 0) > 0]
print("сели: %d песен, %d обозначений" % (len(planted), sum(p for _, p in planted)))
print("отказы:", Counter(am[k].get("chords_why") for k in am if am[k].get("chords_why")))
