# Полный скан каталога: у каких листов ноты лежат глифами в текстовом слое.
# Результат — notes-omr/pdf-epp/sheets-kind.json: имя файла → {opus, kind}.
# kind: "text" (ноты глифами Opus) | "vector" (нарисованы кривыми) | "error".
import glob, json, io, os
import pymupdf

BASE = os.path.dirname(os.path.abspath(__file__)) + "/../"
files = sorted(glob.glob(BASE + "*.pdf"))
out = {}
for i, path in enumerate(files, 1):
    if i % 500 == 0:
        print("  %d/%d" % (i, len(files)), flush=True)
    name = path.rsplit("/", 1)[-1]
    try:
        doc = pymupdf.open(path)
        opus = 0
        for page in doc:
            for block in page.get_text("dict")["blocks"]:
                if block["type"] != 0:
                    continue
                for line in block["lines"]:
                    for span in line["spans"]:
                        f = span["font"]
                        # Ноты — шрифты Opus/OpusStd; Chords, Text и Special это не ноты
                        if f.startswith("Opus") and not any(
                            k in f for k in ("Chords", "Text", "Special")
                        ):
                            opus += len(span["text"])
        doc.close()
        out[name] = {"opus": opus, "kind": "text" if opus >= 30 else "vector"}
    except Exception as e:
        out[name] = {"opus": 0, "kind": "error", "err": str(e)[:80]}

json.dump(out, io.open(BASE + "sheets-kind.json", "w", encoding="utf-8"),
          ensure_ascii=False, sort_keys=True)
kinds = {}
for v in out.values():
    kinds[v["kind"]] = kinds.get(v["kind"], 0) + 1
print("итого:", kinds)
