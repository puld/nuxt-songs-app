# -*- coding: utf-8 -*-
"""Сверка конвейера с уже выгруженными ABC.

Проверяет, что после починки `chords`/`glyphtext` разбор сам даёт то, что в
`out-epp/*.abc` пришлось править руками (немецкое «B» и прилипшие к ступени
цифры). Файл листа берётся из `queues.json` — именно его выбрал прогон сверкой
подтекстовки. Карта `numbers-final.json` тут не годится: у песни несколько
аранжировок, и её первый файл сплошь и рядом другой лист (у 877 она указывает
1093, прогон взял 1170) — сверка с ним показывала бы расхождение на ровном месте.
"""
import sys, os, re, io, json, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import abcout

CH = re.compile(r'"([^"]+)"')

def main():
    q = json.load(io.open(os.path.join(HERE, "..", "queues.json"), encoding="utf-8"))
    nums = sorted((int(os.path.basename(p)[:-4])
                   for p in glob.glob(os.path.join(ROOT, "out-epp", "*.abc"))))
    if len(sys.argv) > 1: nums = nums[:int(sys.argv[1])]
    same, diff, skip, bad = [], [], [], []
    for i, n in enumerate(nums, 1):
        if i % 100 == 0: print("  %d/%d" % (i, len(nums)), flush=True)
        key = str(n)
        if key not in q: skip.append(n); continue
        want = CH.findall(io.open(os.path.join(ROOT, "out-epp", "%04d.abc" % n),
                                  encoding="utf-8").read())
        if not want: skip.append(n); continue
        hit = None
        rec = q[key]
        for f in [rec["pdf"]] + list(rec.get("alt") or []):
            try: abc, _, _ = abcout.build(os.path.join(HERE, "..", f))
            except Exception: continue
            if CH.findall(abc) == want: hit = f; break
        if hit: same.append(n)
        else: diff.append(n)
    json.dump({"same": same, "diff": diff, "skip": skip},
              io.open(os.path.join(HERE, "recheck-abc.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("совпало %d, разошлось %d, без ABC/карты %d" % (len(same), len(diff), len(skip)))
    print("разошлись:", diff[:40])

if __name__ == "__main__":
    main()
