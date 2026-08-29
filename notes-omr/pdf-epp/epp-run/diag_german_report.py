# -*- coding: utf-8 -*-
"""Сводка по diag-german-scan.jsonl -> diag-german.json (только диагностика)."""
import io, os, json, re
from collections import Counter

NOTES = "/Users/l.romanov/workspace/my/nuxt-songs-app/notes-omr"
REPO = os.path.dirname(NOTES)
SCRATCH = os.path.join(NOTES, "pdf-epp/epp-run")

recs = [json.loads(ln) for ln in open(os.path.join(SCRATCH, "diag-german-scan.jsonl"))]
CHORD = re.compile(r"\{([^}]*)\}")

def pure_b_tokens(num):
    """Обозначения с чистой ступенью B (не Bb) в выгруженном .txt: корень или бас."""
    path = os.path.join(REPO, "songs-data/songs/%04d.txt" % num)
    txt = io.open(path, encoding="utf-8").read()
    hits = []
    for tok in CHORD.findall(txt):
        t = tok.lstrip("_")
        parts = t.split("/")
        root_b = re.match(r"^B(?![b#])", parts[0])
        bass_b = len(parts) == 2 and re.match(r"^B(?![b#])$", parts[1])
        if root_b or bass_b:
            hits.append(t)
    return hits

err = [r for r in recs if "err" in r]
g_true = [r for r in recs if r.get("german") is True]
g_false = [r for r in recs if r.get("german") is False]

affected = []
total_b = 0
for r in sorted(g_false, key=lambda r: r["num"]):
    hits = pure_b_tokens(r["num"])
    if not hits: continue
    meta = {}
    mp = os.path.join(NOTES, "out-epp", "%04d.json" % r["num"])
    if os.path.exists(mp):
        m = json.load(open(mp))
        meta = {k: m[k] for k in ("key", "keyname") if k in m}
    total_b += len(hits)
    affected.append({
        "num": r["num"], "pdf": r["pdf"],
        "b_tokens_n": len(hits), "b_tokens": dict(Counter(hits)),
        "key": meta.get("key"), "keyname": meta.get("keyname"),
        "sheet_raw": r["raw"], "sheet_unglyphed": r["unglyphed"],
        "h_root_on_sheet": r["h_root"],
    })

out = {
    "_note": ("Диагностика ошибки is_german per-sheet: листы без слоговых ступеней "
              "считаются английскими, и B остаётся B вместо Bb. Извлечение текстов — "
              "тем же путём, что конвейер: glyphtext.patch + chords.merge(chords.spans)."),
    "songs_scanned": len(recs),
    "scan_errors": [{"num": r["num"], "err": r["err"]} for r in err],
    "german_true": len(g_true),
    "german_false": len(g_false),
    "german_false_with_pure_B_in_txt": len(affected),
    "pure_B_tokens_total": total_b,
    "h_root_on_any_affected_sheet": any(a["h_root_on_sheet"] for a in affected),
    "affected": affected,
}
json.dump(out, open(os.path.join(SCRATCH, "diag-german.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("scanned:", len(recs), "errors:", len(err))
print("german=True:", len(g_true), "german=False:", len(g_false))
print("false с чистым B в txt:", len(affected), "обозначений:", total_b)
print("H на этих листах:", any(a["h_root_on_sheet"] for a in affected))
for a in affected:
    print("%4d %-10s B×%-3d key=%s %s" % (a["num"], a["pdf"], a["b_tokens_n"],
          a.get("keyname"), json.dumps(a["sheet_unglyphed"], ensure_ascii=False)))
