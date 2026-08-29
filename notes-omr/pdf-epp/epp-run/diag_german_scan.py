# -*- coding: utf-8 -*-
"""Замер: немецкий ли набор на листах выгруженных песен (диагностика, ничего не правит).

Извлечение повторяет конвейер: glyphtext.patch() -> pymupdf.open ->
chords.merge(chords.spans(doc)) -> chords.is_german(тексты) — тот же путь,
что в chords.apply (abcout.build -> satb.build открывает doc так же).
"""
import io, os, sys, json, re, signal
from collections import Counter

NOTES = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr"
PIPE = os.path.join(NOTES, "pipeline")
SCRATCH = os.path.join(NOTES, "pdf-epp/epp-run")
LOG = os.path.join(SCRATCH, "diag-german-scan.jsonl")
sys.path.insert(0, PIPE)

import pymupdf
import glyphtext
glyphtext.patch()
import chords

# Прежний признак «немецкий набор», снятый с `chords` до её починки: сама
# функция убрана — набор в каталоге смешивается внутри листа, и теперь разбор
# спрашивает у листа только про голое «B» (`chords.b_is_flat`). Здесь копия,
# чтобы отчёт остался воспроизводимым тем же правилом, каким был снят
HINT_LEGACY = re.compile(r"^(?:[A-H](?:is|es)|[AE]s(?!us)|H)")

def is_german_legacy(texts):
    return any(HINT_LEGACY.match(p) for t in texts for p in re.split(r"[/I]", t))


def main(start, count, timeout=180):
    q = json.load(open(os.path.join(NOTES, "pdf-epp/queues.json")))
    wl = json.load(open(os.path.join(SCRATCH, "write-list.json")))
    nums = sorted(int(n) for n in wl)[start:start + count]
    done = set()
    if os.path.exists(LOG):
        for ln in open(LOG):
            done.add(json.loads(ln)["num"])
    log = open(LOG, "a", encoding="utf-8")
    def on_alarm(sig, frame): raise TimeoutError("alarm")
    signal.signal(signal.SIGALRM, on_alarm)
    for num in nums:
        if num in done: continue
        rec = {"num": num}
        ent = q.get(str(num))
        if not ent:
            rec["err"] = "нет в queues.json"
            log.write(json.dumps(rec, ensure_ascii=False) + "\n"); log.flush(); continue
        rec["pdf"] = ent["pdf"]
        path = os.path.join(NOTES, "pdf-epp", ent["pdf"])
        signal.alarm(timeout)
        try:
            doc = pymupdf.open(path)
            items = chords.merge(chords.spans(doc))
            texts = [t for _, _, _, t in items]
            doc.close()
            rec["n_texts"] = len(texts)
            rec["german"] = is_german_legacy(texts)
            rec["raw"] = dict(Counter(texts))
            un = [chords.unglyph(t) for t in texts]
            rec["unglyphed"] = dict(Counter(un))
            rec["h_root"] = any(re.match(r"^H", p) for t in texts
                                for p in re.split(r"[/I]", t))
        except TimeoutError:
            rec["err"] = "timeout"
        except Exception as e:
            rec["err"] = "%s: %s" % (type(e).__name__, str(e)[:120])
        finally:
            signal.alarm(0)
        log.write(json.dumps(rec, ensure_ascii=False) + "\n"); log.flush()
    log.close()
    print("batch done: %d..%d" % (start, start + count))

if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]))
