# -*- coding: utf-8 -*-
"""Обзор распознанного: out/index.html со ссылками на страницы песен.

    python mkindex.py

Файлы страниц весят по 5–6 МБ (в каждой вшиты семплы), поэтому открывать их
подряд, чтобы вспомнить, что уже разобрано, — плохая идея. Индекс собирается из
`out/*.json`: там уже лежат заголовок, размер, тональность и число куплетов.
"""
import io, os, json, glob

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out")

CSS = """
:root { --bg:#fff; --fg:#111; --muted:#666; --line:#e3e3e3; --accent:#1a56db; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#151515; --fg:#eee; --muted:#999; --line:#333; --accent:#7aa2f7; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg);
       font:16px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif; }
header { padding:18px 16px 12px; border-bottom:1px solid var(--line); }
h1 { margin:0; font-size:1.2rem; }
.sub { color:var(--muted); font-size:.85rem; margin-top:3px; }
ul { list-style:none; margin:0; padding:8px 0; }
li { border-bottom:1px solid var(--line); }
a { display:flex; gap:12px; align-items:baseline; padding:11px 16px;
    color:inherit; text-decoration:none; }
a:hover { background:color-mix(in srgb, var(--accent) 8%, transparent); }
.num { color:var(--muted); font-variant-numeric:tabular-nums; min-width:3.2em; }
.name { font-weight:600; }
.meta { color:var(--muted); font-size:.82rem; margin-left:auto; text-align:right; }
@media (max-width:560px) { .meta { display:none; } }
"""

def rows():
    """Песни в порядке номера; страница без HTML в список не попадает."""
    for p in sorted(glob.glob(os.path.join(OUT, "*.json")), key=lambda f: os.path.basename(f)):
        m = json.load(io.open(p, encoding="utf-8"))
        name = os.path.splitext(os.path.basename(p))[0]
        if not os.path.exists(os.path.join(OUT, name + ".html")): continue
        yield name, m

def build():
    esc = lambda t: str(t).replace("&", "&amp;").replace("<", "&lt;")
    items = []
    for name, m in rows():
        items.append('<li><a href="%s.html"><span class="num">%s</span>'
                     '<span class="name">%s</span>'
                     '<span class="meta">%s</span></a></li>'
                     % (name, esc(m["num"]), esc(m["title"]), esc(m["sub"])))
    html = ('<!doctype html><meta charset="utf-8"><title>Ноты, распознанные из PDF</title>'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<style>%s</style><header><h1>Ноты, распознанные из PDF</h1>'
            '<div class="sub">%d %s · координаты глифов → ABC → страница со звуком</div>'
            '</header><ul>%s</ul>'
            % (CSS, len(items), "песня" if len(items) == 1 else "песен", "".join(items)))
    out = os.path.join(OUT, "index.html")
    io.open(out, "w", encoding="utf-8").write(html)
    print("%s — %d песен" % (out, len(items)))

if __name__ == "__main__":
    build()
