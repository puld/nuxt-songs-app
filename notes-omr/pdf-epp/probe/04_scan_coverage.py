# Пробник 4: доля файлов, где ноты НЕ в текстовом слое (мало глифов Opus, много кривых).
# Запуск: .venv/bin/python probe/04_scan_coverage.py [N]
import glob, random, sys
import pymupdf

BASE = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr/pdf-epp/"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 400
files = sorted(glob.glob(BASE + "*.pdf"))
random.seed(42)
sample = random.sample(files, min(N, len(files)))

vector_like = []
errors = []
for path in sample:
    try:
        doc = pymupdf.open(path)
        opus = 0
        for page in doc:
            d = page.get_text("rawdict")
            for block in d["blocks"]:
                if block["type"] != 0:
                    continue
                for line in block["lines"]:
                    for span in line["spans"]:
                        f = span["font"]
                        if f.startswith("Opus") and "Chords" not in f and "Text" not in f:
                            opus += len(span["chars"])
        if opus < 30:  # нот на листе всегда десятки; меньше 30 глифов = ноты не текстом
            curves = sum(
                1 for p in doc for dr in p.get_drawings() for it in dr["items"] if it[0] == "c"
            )
            vector_like.append((path.rsplit("/", 1)[-1], opus, curves))
        doc.close()
    except Exception as e:
        errors.append((path.rsplit("/", 1)[-1], str(e)[:60]))

print(f"scanned {len(sample)} files")
print(f"vector-like (opus glyphs < 30): {len(vector_like)}")
for name, opus, curves in vector_like:
    print(f"  {name}: opus_glyphs={opus} curves={curves}")
if errors:
    print("errors:", errors)
