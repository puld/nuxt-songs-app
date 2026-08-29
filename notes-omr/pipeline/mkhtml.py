# -*- coding: utf-8 -*-
"""Автономная HTML со звуком: шаблон + вшитые mp3-семплы + готовый .abc.

    python ../../pipeline/mkhtml.py 119.abc meta.json 119.html

Запускать из каталога песни: пути к семплам и шаблону берутся от расположения скрипта.
"""
import io, os, json, base64, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")

def soundfont():
    """Все тембры из assets/sf в base64: страница не должна ходить в сеть."""
    sf = {}
    root = os.path.join(ASSETS, "sf")
    for inst in sorted(os.listdir(root)):
        d = os.path.join(root, inst)
        if not os.path.isdir(d): continue
        sf[inst] = {os.path.splitext(f)[0]: base64.b64encode(open(os.path.join(d, f), "rb").read()).decode()
                    for f in sorted(os.listdir(d)) if f.endswith(".mp3")}
    return sf

def credits_html(lines):
    """Подписи шапки → сетка: строка PDF остаётся строкой и на экране."""
    if not lines: return ""
    esc = lambda t: t.replace("&", "&amp;").replace("<", "&lt;")
    out = []
    for ln in lines:
        for k, cls in (("left", "l"), ("center", "c"), ("right", "r")):
            if k in ln:
                # эпиграф отличается от подписи только местом на странице,
                # поэтому курсив достаётся середине — как в оригинале
                t = esc(ln[k])
                out.append('<div class="%s">%s</div>'
                           % (cls, "<i>%s</i>" % t if cls == "c" else t))
    return '<div class="credits">%s</div>' % "".join(out)

def build(abc_path, meta_path, out):
    abc = io.open(abc_path, encoding="utf-8").read()
    meta = json.load(io.open(meta_path, encoding="utf-8"))
    sf = soundfont()
    html = io.open(os.path.join(HERE, "page.tpl.html"), encoding="utf-8").read()
    html = html.replace("/*__SOUNDFONT__*/", "const SOUNDFONT = " + json.dumps(sf) + ";")
    # штатный CSS панели плеера: без него кнопки и прогресс наезжают друг на друга
    html = html.replace("/*__AUDIOCSS__*/", io.open(os.path.join(ASSETS, "abcjs-audio.css"), encoding="utf-8").read())
    html = html.replace("/*__ABCJS__*/", io.open(os.path.join(ASSETS, "abcjs-basic-min.js"), encoding="utf-8").read())
    html = html.replace("__CREDITS__", credits_html(meta.get("credits") or []))
    html = html.replace("__META__", json.dumps({"verses": meta["verses"], "key": meta["key"]}))
    html = html.replace("__ABC__", json.dumps(abc, ensure_ascii=False))
    for k in ("title", "num", "sub", "keyname"):
        html = html.replace("__%s__" % k.upper(), meta[k])
    io.open(out, "w", encoding="utf-8").write(html)
    print(f"{out} {len(html)/1048576:.2f} МБ; семплов {sum(len(m) for m in sf.values())} "
          f"в {len(sf)} тембрах; ABC {len(abc)} байт")

if __name__ == "__main__":
    a = sys.argv[1:]
    build(a[0], a[1], a[2] if len(a) > 2 else os.path.splitext(a[0])[0] + ".html")
