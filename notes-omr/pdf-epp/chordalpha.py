# -*- coding: utf-8 -*-
"""Какие обозначения аккордов вообще встречаются в каталоге."""
import io, os, json, sys
from collections import Counter
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))


def chord_spans(page):
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if "OpusChords" in s["font"]:
                    t = s["text"].strip()
                    if t:
                        yield t


def main():
    files = sorted(f for f in os.listdir(HERE) if f.endswith(".pdf"))
    if len(sys.argv) > 1:
        files = files[:int(sys.argv[1])]
    seen, withch = Counter(), 0
    for i, f in enumerate(files, 1):
        if i % 200 == 0:
            print("  %d/%d" % (i, len(files)), flush=True)
        try:
            doc = pymupdf.open(os.path.join(HERE, f))
        except Exception:
            continue
        got = [t for page in doc for t in chord_spans(page)]
        doc.close()
        if got:
            withch += 1
            seen.update(got)
    print("листов с аккордами: %d из %d" % (withch, len(files)))
    print("разных обозначений: %d" % len(seen))
    json.dump(dict(seen), io.open(os.path.join(HERE, "chord-alphabet.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, sort_keys=True)
    for t, n in seen.most_common(60):
        print("  %-12s %d" % (t, n))


if __name__ == "__main__":
    main()
