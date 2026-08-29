# -*- coding: utf-8 -*-
"""Заголовки нотных листов Эппа: номер и полное название прямо с листа.

Зачем, если есть `catalog.tsv`: подпись в каталоге обрезана до двух-трёх слов
(«93].Великий Бог»), и по ней сверка вынуждена угадывать. На самом листе
напечатан полный заголовок («500  У источника спасенья»), а вместе с ним —
номер, который можно сверить с именем файла.

Две ловушки, обе стоили времени:

1. **Кодировка.** Слоги под нотами набраны шрифтом с cp1251-раскладкой, и PDF
   отдаёт их как latin-1: «Ñëóøàéòå» вместо «Слушайте». Часть листов при этом
   набрана нормальным юникодом, поэтому перекодировка пробуется и молча
   пропускается, если не подходит (кириллица в latin-1 не кодируется вовсе).
2. **Заголовок не обязан быть первой строкой блока.** У 500.pdf он лежит
   внутри блока с нотными глифами, поэтому проверяются все строки страницы, а
   не первая строка блока.
3. **Перекодировать надо построчно.** На одном листе кодировки смешаны:
   заголовок и слоги — cp1251-как-latin-1, а «Музыка:» и «Перев.» — нормальный
   юникод. Перекодировка страницы целиком падала на юникодной строке и молча
   отдавала весь лист искажённым — 001.pdf при этом «терял» заголовок.
4. **Номер куплета выглядит как номер листа.** Строки «3. Слышал я» ловятся тем
   же шаблоном, поэтому из кандидатов выбирается тот, чей номер совпал с именем
   файла; остальные листы уходят в `mismatch` — там имя файла и лист расходятся,
   и опираться на файл нельзя.
"""
import io, os, re, glob, json, sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))

# Номер и название: «1  Слушайте повесть любви», «830  Мелькают часы...»
HEAD = re.compile(r"^(\d{1,4})\s*([a-zа-я]?)\s+([А-ЯЁа-яё][^\n]*)$")


def fix(s):
    """Возвращает текст в читаемом виде, если он пришёл cp1251-как-latin-1."""
    try:
        return s.encode("latin-1").decode("cp1251")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def headings(path):
    """Все кандидаты в заголовки листа: [(номер, вариант, название)]."""
    doc = pymupdf.open(path)
    found = []
    try:
        for page in doc:
            for raw in page.get_text().split("\n"):
                m = HEAD.match(fix(raw).strip())
                if m:
                    found.append((int(m.group(1)), m.group(2),
                                  re.sub(r"\s+", " ", m.group(3)).strip()))
    finally:
        doc.close()
    return found


def heading(path, file_num):
    """(номер, название) с листа. Предпочитается кандидат с номером файла."""
    found = headings(path)
    for num, _var, title in found:
        if num == file_num:
            return num, title
    if found:
        return found[0][0], found[0][2]
    return None, None


def main():
    out = {}
    files = sorted(glob.glob(os.path.join(HERE, "*.pdf")))
    for i, path in enumerate(files, 1):
        name = os.path.basename(path)
        file_num = int(re.match(r"(\d+)", name).group(1))
        try:
            num, title = heading(path, file_num)
        except Exception as exc:                      # битый PDF не должен рвать проход
            num, title = None, None
            print("!! %s: %s" % (name, exc), file=sys.stderr)
        out[name] = {"num": num, "title": title}
        if i % 200 == 0:
            print("%d/%d" % (i, len(files)), file=sys.stderr)

    json.dump(out, io.open(os.path.join(HERE, "headings.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, sort_keys=True)

    got = [v for v in out.values() if v["title"]]
    # Номер с листа против номера в имени файла: расхождение означает, что
    # файл назван не по своему листу, и на него нельзя опираться в сверке.
    bad = [n for n, v in out.items()
           if v["num"] is not None and v["num"] != int(re.match(r"(\d+)", n).group(1))]
    print("листов: %d, с заголовком: %d, без: %d" % (len(out), len(got), len(out) - len(got)))
    print("номер на листе не совпал с именем файла: %d" % len(bad))
    for n in bad[:20]:
        print("  %s → %s" % (n, out[n]["num"]))


if __name__ == "__main__":
    main()
