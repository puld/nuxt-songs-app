# -*- coding: utf-8 -*-
"""Скачивание каталога нот Эппа: последовательно, с паузой, с докачкой."""
import io, os, sys, time, urllib.request, urllib.parse

BASE = "https://alexander-epp.de/Noti/"
HERE = os.path.dirname(os.path.abspath(__file__))
DELAY = 0.4          # пауза между запросами: чужой сайт, спешить некуда
TIMEOUT = 60

LIST = sys.argv[1] if len(sys.argv) > 1 else "needed.txt"
urls = [l.strip() for l in io.open(os.path.join(HERE, LIST), encoding="utf-8") if l.strip()]
log = io.open(os.path.join(HERE, "fetch.log"), "a", encoding="utf-8")
ok = skip = err = 0
for i, u in enumerate(urls, 1):
    dst = os.path.join(HERE, os.path.basename(u))
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        skip += 1; continue
    try:
        req = urllib.request.Request(BASE + urllib.parse.quote(u),
                                     headers={"User-Agent": "Mozilla/5.0 (personal archive)"})
        data = urllib.request.urlopen(req, timeout=TIMEOUT).read()
        if not data.startswith(b"%PDF"):
            raise ValueError("не PDF, %d байт" % len(data))
        with open(dst, "wb") as f: f.write(data)
        ok += 1
    except Exception as e:
        err += 1; log.write("ERR %s %s\n" % (u, e)); log.flush()
    if i % 50 == 0:
        log.write("... %d/%d ok=%d skip=%d err=%d\n" % (i, len(urls), ok, skip, err)); log.flush()
    time.sleep(DELAY)
log.write("DONE %d ok=%d skip=%d err=%d\n" % (len(urls), ok, skip, err)); log.flush()
print("DONE ok=%d skip=%d err=%d" % (ok, skip, err))
