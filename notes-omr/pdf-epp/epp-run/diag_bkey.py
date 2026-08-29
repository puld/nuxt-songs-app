# -*- coding: utf-8 -*-
"""Ключевые знаки листов, где голое «B» не с чем сверить.

333 листа не дают текстовой подсказки: ни «B♭» знаком, ни «H», ни слоговых
ступеней. Ответ про голое «B» там даёт сам ключ: бемольный — си-бемоль,
диезный — си. Замер считает, сколько листов каких.
"""
import sys, os, io, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import glyphtext, glyphstaff, staff974, chords, meta, omr, satb
from collections import Counter

def main():
    d = json.load(io.open(os.path.join(HERE, "diag-bnote2.json"), encoding="utf-8"))
    todo = [k for k, v in d.items()
            if v["bare_b"] and not v["bflat"] and not v["syl"] and not v["h"]]
    print("листов на разбор:", len(todo), flush=True)
    out, cnt = {}, Counter()
    for i, rel in enumerate(sorted(todo), 1):
        if i % 50 == 0: print("  %d/%d" % (i, len(todo)), flush=True)
        try:
            doc, syss = omr.analyse(os.path.join(ROOT, rel))
            nsig = meta.key_signature(syss[0]) if syss else None
        except Exception as e:
            nsig = "ошибка: " + type(e).__name__
        out[rel] = nsig
        cnt[nsig] += 1
    json.dump(out, io.open(os.path.join(HERE, "diag-bkey.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("ключи:", cnt.most_common())
    print("диезные/без знаков:", sorted(k for k, v in out.items()
                                        if isinstance(v, int) and v >= 0)[:40])

if __name__ == "__main__":
    main()
