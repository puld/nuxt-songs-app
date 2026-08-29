# -*- coding: utf-8 -*-
"""Признаки листа вокруг голого «B»: чем отличается си от си-бемоля.

`b_is_flat` смотрел только на «B♭ глифом», и лист 1266 (английский, си минор с
`F♯`) читался как немецкий: `Bm` превращался в `Bbm`. Нужен замер: сколько
листов набраны знаками при диезной тональности.
"""
import sys, os, io, json, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import glyphtext, glyphstaff, staff974, chords, re
glyphtext.patch(); glyphstaff.patch(); staff974.patch()
import pymupdf

BARE_B = re.compile(r"B(?![¨©a-z])")
BFLAT  = re.compile(r"B¨")
FLAT   = re.compile(r"[A-H]¨")
SHARP  = re.compile(r"[A-H]©")
SYL    = re.compile(r"\b(?:[A-H](?:is|es)|[AE]s(?!us))")
H      = re.compile(r"\bH")

def main():
    files = sorted(glob.glob(os.path.join(ROOT, "pdf-epp", "*.pdf")) +
                   glob.glob(os.path.join(ROOT, "pdf", "*.pdf")))
    res = {}
    for i, f in enumerate(files, 1):
        if i % 400 == 0: print("  %d/%d" % (i, len(files)), flush=True)
        try:
            doc = pymupdf.open(f)
            texts = [t for _, _, _, t in chords.merge(chords.spans(doc))]
            doc.close()
        except Exception: continue
        if not texts: continue
        j = " ".join(texts)
        res[os.path.relpath(f, ROOT)] = {
            "bare_b": bool(BARE_B.search(j)), "bflat": bool(BFLAT.search(j)),
            "flat": bool(FLAT.search(j)), "sharp": bool(SHARP.search(j)),
            "syl": bool(SYL.search(j)), "h": bool(H.search(j)),
        }
    json.dump(res, io.open(os.path.join(HERE, "diag-bnote2.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    b = {k: v for k, v in res.items() if v["bare_b"]}
    print("листов с гармонией: %d, с голым B: %d" % (len(res), len(b)))
    cand = {k: v for k, v in b.items()
            if not v["bflat"] and not v["syl"] and not v["h"] and v["sharp"] and not v["flat"]}
    print("кандидаты «B = си» (диез глифом, ни бемоля, ни слогов, ни H): %d" % len(cand))
    print(sorted(cand)[:40])
    amb = {k: v for k, v in b.items()
           if not v["bflat"] and not v["syl"] and not v["h"] and not v["sharp"] and not v["flat"]}
    print("без единого признака: %d" % len(amb))

if __name__ == "__main__":
    main()
