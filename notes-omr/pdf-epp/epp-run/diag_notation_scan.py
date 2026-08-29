# -*- coding: utf-8 -*-
"""Каким набором — немецким или английским — размечена гармония каталога.

Замер исторический: он и показал, что рамка «набор один на весь каталог» неверна —
набор смешивается **внутри** листа, и `chords.is_german` из-за этого снят (теперь
про голое «B» отвечает `chords.b_is_flat`). Признаки здесь снимаются копией
прежнего правила (`is_german_legacy` ниже), чтобы отчёт остался воспроизводимым:

* немецкий — слоговая ступень («Es», «Fis») или «H»;
* английский — бемоль **глифом** сразу после B, E или A. В немецком наборе это
  слоги («B», «Es», «As»), и «B♭» там означало бы дважды пониженное си.

Диез в признаки не годится ни одной из сторон: «H7/D♯» набирают глифом и в
немецком наборе.
"""
import io, os, re, sys, json, glob

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..", "..", "pipeline")))
import pymupdf, glyphtext, chords

ENGLISH = re.compile(r"[BEA]¨")     # B♭, E♭, A♭ — бемоль глифом
# копия прежнего признака: в `chords` его больше нет (см. `diag_german_scan`)
HINT_LEGACY = re.compile(r"^(?:[A-H](?:is|es)|[AE]s(?!us)|H)")

def is_german_legacy(texts):
    return any(HINT_LEGACY.match(p) for t in texts for p in re.split(r"[/I]", t))

def scan(path):
    doc = pymupdf.open(path)
    try:
        raw = [t for _, _, _, t in chords.merge(chords.spans(doc))]
    finally:
        doc.close()
    if not raw: return None
    return {"n": len(raw),
            "german": is_german_legacy(raw),
            "english": any(ENGLISH.search(t) for t in raw)}

def main():
    glyphtext.patch()
    files = sorted(glob.glob(os.path.join(HERE, "..", "*.pdf")))
    if len(sys.argv) > 1: files = files[:int(sys.argv[1])]
    out, tally = {}, {"нет аккордов": 0, "немецкий": 0, "английский": 0,
                      "оба признака": 0, "без признаков": 0}
    for i, f in enumerate(files, 1):
        if i % 200 == 0:
            print("  %d/%d" % (i, len(files)), flush=True)
        name = os.path.basename(f)
        try: r = scan(f)
        except Exception as e:
            out[name] = {"error": str(e)[:80]}; continue
        if r is None:
            tally["нет аккордов"] += 1; continue
        out[name] = r
        if r["german"] and r["english"]: tally["оба признака"] += 1
        elif r["german"]: tally["немецкий"] += 1
        elif r["english"]: tally["английский"] += 1
        else: tally["без признаков"] += 1
    json.dump({"tally": tally, "sheets": out},
              io.open(os.path.join(HERE, "diag-notation.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, sort_keys=True)
    print(json.dumps(tally, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
