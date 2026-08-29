# -*- coding: utf-8 -*-
"""Чем расходятся песни из `recheck-abc.json["diff"]`.

Сверка отвечает «да/нет», а нужен характер: хвост ручной правки в ABC, новый
дефект разбора или просто другой файл аранжировки. Для каждой песни берётся
файл с наибольшим совпадением, различие печатается мультимножествами.

Файл листа берётся из `queues.json` (поля "pdf" и "alt") — именно его выбрал
прогон; `numbers-final.json` тут не годится, её первый файл сплошь и рядом
другая аранжировка, и различие показывало бы чужой лист.
"""
import sys, os, re, io, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import abcout
from collections import Counter

CH = re.compile(r'"([^"]+)"')

def main():
    d = json.load(io.open(os.path.join(HERE, "recheck-abc.json"), encoding="utf-8"))
    q = json.load(io.open(os.path.join(HERE, "..", "queues.json"), encoding="utf-8"))
    out = {}
    for i, n in enumerate(d["diff"], 1):
        if i % 20 == 0: print("  %d/%d" % (i, len(d["diff"])), flush=True)
        want = CH.findall(io.open(os.path.join(ROOT, "out-epp", "%04d.abc" % n),
                                  encoding="utf-8").read())
        best = None
        rec = q.get(str(n))
        if rec is None: out[n] = {"error": "no queue entry"}; continue
        for f in [rec["pdf"]] + list(rec.get("alt") or []):
            try: abc, _, _ = abcout.build(os.path.join(HERE, "..", f))
            except Exception as e: continue
            got = CH.findall(abc)
            score = sum((Counter(want) & Counter(got)).values())
            if best is None or score > best[0]: best = (score, f, got)
        if best is None: out[n] = {"error": "no build"}; continue
        _, f, got = best
        a, p = Counter(want), Counter(got)
        out[n] = {"file": f, "n_abc": len(want), "n_pipe": len(got),
                  "only_abc": sorted((a - p).elements()),
                  "only_pipe": sorted((p - a).elements())}
    json.dump(out, io.open(os.path.join(HERE, "recheck-diff.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    pairs = Counter()
    for n, r in out.items():
        pairs[(tuple(r.get("only_abc", [])[:8]), tuple(r.get("only_pipe", [])[:8]))] += 1
    for k, v in pairs.most_common(25):
        print(v, "ABC:", list(k[0]), "-> PIPE:", list(k[1]))

if __name__ == "__main__":
    main()
