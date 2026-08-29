# -*- coding: utf-8 -*-
"""Текст под нотами: слоги со всех листов, склеенные в сплошной поток букв.

Заголовок листа исчерпан (`headings.py`): по нему сопоставилось 1232 песни из
1565, а у 247 оставшихся похожего заголовка нет вовсе — издатель подписал лист
строкой, которой в нашем названии нет. Остаётся то, что напечатано под нотами.

Две особенности, из-за которых наивное чтение не работает:

* **Порядок чтения перемешан.** Слоги идут по голосам и куплетам, а не по
  строкам: «4. Ес / 1. Слу / 3. Ес / 2. Ес». Поэтому слова группируются по
  вертикали (`round(y0 / ROW)`) и внутри строки сортируются по x.
* **Слово разорвано на слоги** («К не зем ной стра не»). Сравнивать посложно
  ни по словам, ни по n-граммам: границы слогов у издателя свои. Поэтому весь
  текст листа склеивается в **сплошной поток букв без пробелов** — тогда наша
  строка ищется в нём обычным вхождением подстроки.

Кодировка та же ловушка, что в `headings.py`: слоги набраны шрифтом с
cp1251-раскладкой и приходят как latin-1, поэтому `fix()` — построчно.
"""
import io, os, re, sys, glob, json, pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
ROW = 6          # допуск по вертикали: строка слогов, а не отдельный слог


def fix(s):
    try:
        return s.encode("latin-1").decode("cp1251")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def stream(path):
    """Весь текст листа как сплошной поток строчных букв без пробелов."""
    doc = pymupdf.open(path)
    rows = {}
    try:
        for page in doc:
            for w in page.get_text("words"):
                txt = fix(w[4])
                if re.search(r"[А-Яа-яЁё]", txt):
                    rows.setdefault((page.number, round(w[1] / ROW)), []).append((w[0], txt))
    finally:
        doc.close()

    out = []
    for key in sorted(rows):
        out.append("".join(t for _x, t in sorted(rows[key])))
    text = " ".join(out).lower().replace("ё", "е")
    return re.sub(r"[^а-я]", "", text)


def main():
    out = {}
    files = sorted(glob.glob(os.path.join(HERE, "*.pdf")))
    for i, path in enumerate(files, 1):
        name = os.path.basename(path)
        try:
            out[name] = stream(path)
        except Exception as exc:
            out[name] = ""
            print("!! %s: %s" % (name, exc), file=sys.stderr)
        if i % 200 == 0:
            print("%d/%d" % (i, len(files)), file=sys.stderr)

    json.dump(out, io.open(os.path.join(HERE, "syllables.json"), "w", encoding="utf-8"),
              ensure_ascii=False, sort_keys=True)
    got = [v for v in out.values() if len(v) > 40]
    print("листов: %d, с текстом: %d" % (len(out), len(got)))


if __name__ == "__main__":
    main()
