# -*- coding: utf-8 -*-
"""ABC хоровой партитуры из распознанного PDF."""
import satb, meta, lyrics, slurs, volta, dynamics, chords, sys, os

ACC = {"#": "^", "b": "_", "n": "=", "x": "^^"}
NAMES = {"S": "Сопрано", "A": "Альт", "T": "Тенор", "B": "Бас"}
WRITABLE = (32, 24, 16, 12, 8, 6, 4, 3, 2, 1)  # что записывается одной нотой

def unit_of(sc):
    """Единица длины: наименьшая, при которой каждая длительность — целое число
    единиц. Шестнадцатые (и тем более тридцать вторые из 132) нужны не всем, а
    от единицы зависит читаемость записи."""
    durs = [e.get("straight", e["dur"]) for it in sc["systems"] for cell in it["cells"].values()
            for bar in cell for e in bar]
    for unit in (8, 16, 32):
        if all(abs(d * unit / 4 - round(d * unit / 4)) < 1e-6 for d in durs): return unit
    return 32

def abc_pitch(p):
    """C4 → 'C', C5 → 'c', C3 → 'C,', C6 → \"c'\"."""
    s = ACC.get(p["acc"], "")
    return s + (p["p"].lower() + "'" * (p["o"] - 5) if p["o"] >= 5 else p["p"] + "," * (4 - p["o"]))

def split_len(n):
    """Длина в единицах → куски, каждый записывается одним знаком."""
    out = []
    while n > 0:
        for w in WRITABLE:
            if w <= n: out.append(w); n -= w; break
        else: break
    return out

def token(e, unit):
    # триоль в ABC пишется печатными длительностями под знаком «(3» — сжатие
    # выполняет плеер, а в `dur` оно уже учтено для проверки сумм
    parts = split_len(round(e.get("straight", e["dur"]) * unit / 4))
    if e["rest"]:
        # молчание целого такта пишется невидимой паузой: видимый прямоугольник
        # рисуют только там, где он есть в PDF
        ch = "x" if e.get("silent") else "z"
        return " ".join("%s%d" % (ch, p) for p in parts)
    heads, seen = [], set()
    for p in e["pitches"]:
        k = (p["p"], p["o"], p["acc"])
        if k not in seen: seen.add(k); heads.append(p)
    body = abc_pitch(heads[0]) if len(heads) == 1 else "[" + "".join(abc_pitch(h) for h in heads) + "]"
    return "-".join(body + ("" if p == 1 else str(p)) for p in parts)

# станы хоровой партитуры: на каждом по два голоса
STAVES = (("S", "A"), ("T", "B"))

def merge_stave_rests(sc, voices):
    """Дубль паузы в стане гасится: нижнему голосу — невидимая.

    Когда обе партии стана молчат одновременно и одинаково долго, печатный
    сборник рисует **один** знак паузы посреди стана — так набран такт 24 в 1487.
    ABC же описывает голоса порознь, и две записанные паузы abcjs честно рисует
    друг над другом: верхнюю над станом, нижнюю под ним.

    Гасится нижняя, а не верхняя: слова печатаются под верхним голосом своего
    стана, и его события остаются теми, к которым привязан текст. Совпадение
    требуется точное — и момент, и длительность: паузы разной длины в оригинале
    выписаны обе, и объединять их значило бы потерять голос.
    """
    for up, dn in STAVES:
        if up not in voices or dn not in voices: continue
        for it in sc["systems"]:
            cells = it["cells"]
            for top, bot in zip(cells.get(up) or [], cells.get(dn) or []):
                low, t = {}, 0.0
                for e in bot:
                    if e["rest"] and not e.get("silent"):
                        low[(round(t, 6), round(e["dur"], 6))] = e
                    t += e["dur"]
                t = 0.0
                for e in top:
                    k = (round(t, 6), round(e["dur"], 6))
                    t += e["dur"]
                    # верхняя пауза уже невидима — гасить нижнюю нечем: знак
                    # исчез бы у обоих голосов, и такт остался бы пустым
                    if not e["rest"] or e.get("silent"): continue
                    pair = low.get(k)
                    if pair is not None: pair["silent"] = True

def bar_text(cell, unit):
    """Такт: ноты под общей вязкой пишутся слитно — иначе abcjs рисует флажки."""
    s, prev = "", False
    for e in cell:
        t = token(e, unit)
        # знак триоли стоит вплотную перед первой нотой группы: «(3:2:n» —
        # три доли на месте двух, n нот в группе (бывает и две: четверть с
        # восьмой)
        if e.get("tuplet"): t = "(3:2:%d" % e["tuplet"] + t
        # лига распева — скобки вокруг группы, продление ноты — дефис после неё
        if e.get("slurend"): t += ")"
        if e.get("slur"): t = "(" + t
        # оттенок стоит перед нотой и до открывающей скобки лиги: внутри неё
        # abcjs относит декорацию к самой лиге, а не к ноте
        if e.get("dyn"): t = "!%s!" % e["dyn"] + t
        # аккорд — самое левое: он относится к доле, а не к ноте, и abcjs
        # печатает его над станом независимо от лиг и оттенков
        if e.get("chord"): t = '"%s"' % e["chord"] + t
        # ремарка над своей нотой: «Припев» начинается с затакта чаще, чем с
        # первой доли такта, и привязка к такту сдвигала бы её влево
        if e.get("text"): t = '"^%s"' % e["text"] + t
        if e.get("tie"): t += "-"
        beam = e.get("beamed") and not e["rest"]
        if s and not (beam and prev): s += " "
        s += t
        prev = beam
    return s or "x%d" % (4 * unit // 4)

def sep_for(prev_end, next_start):
    """Черта между тактами с учётом знаков повтора."""
    if prev_end and next_start: return ":|:"
    if prev_end: return ":|"
    return "|:" if next_start else "|"

def line_of(it, v, unit, final):
    """Такты голоса одной строкой: репризы и вольты приписываются к чертам.

    Номер вольты в ABC — часть тактовой черты (`|1`, `:|2`), а не отдельный знак,
    поэтому он дописывается к уже поставленному разделителю.
    """
    cells = it["cells"][v]
    marks = it.get("marks") or [{} for _ in cells]
    parts = []
    for bi, c in enumerate(cells):
        if bi == 0:
            if marks[0].get("rep_start"): parts.append("|:")
        else:
            parts.append(sep_for(marks[bi - 1].get("rep_end"), marks[bi].get("rep_start")))
        # смена ключа стоит перед тактом и у каждого голоса своя: в ABC
        # «[K:]» — внутристрочное поле, действующее до конца своего голоса
        kc = (it.get("keych") or {}).get(bi)
        if kc: parts.append("[K:%s]" % kc)
        # смена размера — так же: печатный сборник объявляет её цифрами на
        # стане, в ABC это внутристрочное «[M:]» перед первым тактом нового
        mc = (it.get("meterch") or {}).get(bi)
        if mc: parts.append("[M:%d/%d]" % tuple(mc))
        vo = marks[bi].get("volta")
        if vo and (bi == 0 or marks[bi - 1].get("volta") != vo):
            if parts: parts[-1] += str(vo)
            else: parts.append("|" + str(vo))
        # ремарка относится к такту, а не к ноте: ставим её перед его первой нотой
        if v == "S" and marks[bi].get("text"):
            parts.append('"^%s"' % marks[bi]["text"])
        parts.append(bar_text(c, unit))
    parts.append(":|" if marks[-1].get("rep_end") else ("|]" if final else "|"))
    return " ".join(parts)

def last_bass(sc, lo, hi, drop_last=False):
    """Последняя нота баса на участке тактов [lo, hi): по ней виден лад.

    Участок, а не вся песня: после модуляции песня заканчивается в новой
    тональности, и лад начальной по её последней ноте уже не определить.

    Перед модуляцией последний такт участка отбрасывается: это переходный такт,
    он и уводит из старой тональности — в 1473 бас там доходит до cis, и лад
    начального участка читался мажорным вместо фа минора.
    """
    bars = {}
    for si, it in enumerate(sc["systems"]):
        for bi, bar in enumerate(it["cells"]["B"]):
            if not (lo <= (si, bi) < hi): continue
            ns = [e["pitches"][0]["p"] for e in bar if not e["rest"]]
            if ns: bars[(si, bi)] = ns
    if not bars: return None
    keys = sorted(bars)
    if drop_last and len(keys) > 1: keys.pop()
    return bars[keys[-1]][-1]


def key_events(syss, sc):
    """Смены ключа по тактам: {(si, bi): nsig}, без начальной тональности.

    Смотрятся оба места сразу: набор знаков в начале каждой строки (модуляция
    могла случиться ровно на переносе) и наборы посреди строки. Второе без
    первого пропустило бы модуляцию с новой строки, первое без второго —
    модуляцию, начатую в середине системы, как в 1473.
    """
    cur, out = sc["nsig"], {}
    for si, (sy, it) in enumerate(zip(syss, sc["systems"])):
        bars = it["bars"]
        if si and it["nbars"]:
            n = meta.key_signature(sy)
            if n != cur: out[(si, 0)] = n; cur = n
        for x, n in meta.key_changes(sy, bars[1] if len(bars) > 1 else None):
            if n == cur: continue
            # знаки печатают вплотную к тактовой черте — с той или с другой её
            # стороны; принадлежат они в обоих случаях такту справа от черты
            bi = min(range(len(bars)), key=lambda i: abs(bars[i] - x))
            out[(si, min(bi, it["nbars"] - 1))] = n
            cur = n
    return out


def apply_keys(syss, sc):
    """Расставляет `keych` по системам и возвращает тонику начального участка."""
    ev = key_events(syss, sc)
    end = (len(sc["systems"]), 0)
    pts = sorted(ev)
    bounds = pts + [end]
    for i, (k, nxt) in enumerate(zip(pts, bounds[1:])):
        si, bi = k
        tn = last_bass(sc, k, nxt, drop_last=nxt != end)
        sc["systems"][si].setdefault("keych", {})[bi] = meta.key_name(ev[k], tn)
    return last_bass(sc, (0, 0), pts[0] if pts else end, drop_last=bool(pts))

def score_of(voices):
    """Разметка станов по фактическому составу голосов.

    Скобки в `%%score` объединяют голоса на одном стане: женские и мужские
    печатаются по паре. Когда пары нет, скобка вокруг единственного голоса
    станет лишней парой линий у ключа, а стан «Тенор» без тенора — пустой
    нотной бумагой во всю страницу.
    """
    top = [v for v in "SA" if v in voices]
    bot = [v for v in "TB" if v in voices]
    part = lambda g: "(%s)" % " ".join(g) if len(g) > 1 else g[0]
    return "{%s}" % " | ".join(part(g) for g in (top, bot) if g)

def notes_of(it, v):
    """Ноты голоса в системе по порядку: слог принадлежит ноте, паузу ABC пропускает."""
    return [e for bar in it["cells"][v] for e in bar if not e["rest"]]

def syls_for(verses, n, suffix=""):
    """Слоги куплета n в системе: своя строка и общая строка припева вместе.

    В одной системе бывают обе сразу: слева хвост куплета («ды.»), правее —
    общий припев. Пока бралась одна — своя, если нашлась, — припев из такой
    системы пропадал целиком: в 752 так терялось восемнадцать слогов, а под
    нотами оставались звёздочки. Складывать строки безопасно: слог привязан к
    ноте по своей координате, а не по месту в строке.
    """
    key = str(n) + suffix
    own = verses.get(key, [])
    shared = []
    for k, v in verses.items():
        # пустой суффикс сопрано иначе совпадает и с «@T»: строка мужских голосов
        # печаталась бы вторым разом ещё и под верхним станом
        if k != key and ("@" in k) != (suffix == "") and k.endswith(suffix) \
           and "-" in k.split("@")[0] and n in lyrics.expand(k):
            shared += v
    if own and shared:
        # у последнего куплета бывает своя концовка припева: обе строки стоят над
        # одними нотами, и сложение давало «не не у- у- гас.». Своя строка тогда
        # замещает общую — но только там, где они правда пересекаются: слева от
        # припева обычно стоит хвост куплета, и его терять нельзя
        lo, hi = min(s[0] for s in own), max(s[0] for s in own)
        shared = [s for s in shared if not lo - 1 <= s[0] <= hi + 1]
    return sorted(own + shared, key=lambda s: s[0]) or None

def lyric_lines(verses, it, v, nums, suffix=""):
    """Строки `w:` голоса: по строке на куплет, одинаковые схлопнуты в одну.

    Схлопывание — про припев: он один на все куплеты, и три одинаковые строки
    под нотами читались бы как три разных текста.
    """
    evs = notes_of(it, v)
    if not evs or not verses: return []
    out = []
    for n in nums:
        s = syls_for(verses, n, suffix)
        out.append(lyrics.line_for(s, evs) if s else None)
    if all(x is None for x in out): return []
    if len(set(out)) == 1: out = out[:1]
    # куплет без своей строки пропускать нельзя: строки w: нумеруются по порядку,
    # и следующий куплет встал бы на его место
    return [x if x is not None else " ".join("*" for _ in evs) for x in out]

def build(path, title=None, tempo=None):
    doc, syss, sc = satb.build(path)
    satb.content(sc)
    slurs.apply(doc, syss, sc)
    volta.apply(doc, syss, sc)
    dynamics.apply(doc, syss, sc)
    chords.apply(doc, syss, sc)
    ly = lyrics.collect(doc, syss)
    nums = lyrics.numbers(ly) or [1]
    unit = unit_of(sc)
    key = meta.key_name(sc["nsig"], apply_keys(syss, sc))
    # характер исполнения печатают словом над первой системой; в ABC он живёт
    # в поле темпа — отдельного поля для него нет
    ch = meta.character(doc, syss[0], sc["title"])
    char = ' "%s"' % ch if ch else ""
    # авторы, эпиграф и состав хора в ABC деть некуда: полей под них нет, а
    # чужие («N:», «C:») abcjs либо прячет, либо печатает не на своём месте
    sc["credits"] = meta.credits(doc, syss[0], sc["title"], ch)
    mt = meta.tempo(doc, syss[0]) or (1, 4, tempo or 84)
    head = ["X:1", "T:" + (title or sc["title"] or os.path.basename(path)),
            "M:%d/%d" % sc["ts"], "L:1/%d" % unit,
            # где метронома нет, темп подставлен: плееру нужна скорость, а на
            # записи нот это поле не сказывается
            "Q:%d/%d=%d%s" % (mt + (char,)), "K:" + key,
            # номер такта в начале нотной строки, как в печатном сборнике. Шаг
            # значения не имеет: при включённом `wrap` abcjs подписывает каждый
            # такт, а лишние подписи снимает сама страница по отрисованному SVG
            "%%barnumbers 1"]
    # голос, у которого во всей песне нет ни одной ноты, не выводится вовсе.
    # Так набран 974 — «мелодия с аккомпанементом», где хоровых партий нет: три
    # стана из четырёх шли сплошной невидимой паузой и занимали половину высоты
    # страницы пустой нотной бумагой. Состав считается по факту, а не по числу
    # станов: пустой стан в PDF означает партию, которую издатель не выписал, а
    # в ABC — партию, которой нет
    voices = [v for v in satb.VOICES
              if any(notes_of(it, v) for it in sc["systems"] if it["nbars"])]
    if not voices: voices = list(satb.VOICES)
    merge_stave_rests(sc, voices)
    head.append("%%score " + score_of(voices))
    for v in voices:
        # подписи станов в этих сборниках не печатают вовсе — их добавляем мы,
        # чтобы различать четыре партии. Единственному голосу различать нечего,
        # а «Сопрано» у мелодии с аккомпанементом ещё и неправда
        name = ' name="%s"' % NAMES[v] if len(voices) > 1 else ""
        head.append("V:%s clef=%s%s stem=%s"
                    % (v, "treble" if v in "SA" else "bass", name,
                       "up" if v in "ST" else "down"))
    # система без единого такта строки не даёт: заключительная черта достаётся
    # последней непустой. Пустой такая система бывает у глифовых партитур, где
    # тактовых черт может не найтись вовсе, и `line_of` на ней падал
    filled = [si for si, it in enumerate(sc["systems"]) if it["nbars"]]
    bars = {v: [] for v in voices}
    words = {v: [[] for _ in nums] for v in ("S", "T")}
    for si, it in enumerate(sc["systems"]):
        if not it["nbars"]: continue
        final = si == filled[-1]
        for v in voices:
            bars[v].append(line_of(it, v, unit, final))
            # слова печатаются под верхним голосом своего стана: у мужских голосов
            # в припеве бывает свой текст, и метка «@T» относится к нижнему стану
            if v not in ("S", "T"): continue
            got = lyric_lines(ly[si], it, v, nums, "" if v == "S" else "@T")
            # система без слов пропуска не даёт: строка куплета сплошная, и дырка
            # в ней сдвинула бы все последующие слоги на чужие ноты
            blank = " ".join("*" for _ in notes_of(it, v))
            for k in range(len(nums)):
                words[v][k].append(blank if not got else
                                   got[0] if len(got) == 1 else got[k])
    # Голос выводится одной строкой, а не блоком на систему. Разбиение по
    # системам PDF при `wrap` всё равно не соблюдается — abcjs раскладывает
    # такты по ширине сам, — зато стык двух строк ABC внутри одной отрисованной
    # строки он отмечает ключевыми знаками: в 1473 после модуляции диезы
    # печатались посреди системы по разу на стык (а до правки `keySignature` в
    # abcjs — красной надписью поверх нот)
    body = []
    for v in voices:
        body.append("V:" + v)
        body.append(" ".join(bars[v]))
        if v not in ("S", "T"): continue
        lines = [" ".join(w) for w in words[v]]
        # припев мужских голосов один на все куплеты: в 658 он давал пять
        # одинаковых строк, а abcjs прочитал бы их как пять разных текстов и
        # напечатал пятью строками под станом. Схлопывание по системе уже есть,
        # но строки собираются из кусков, и совпадают они только целиком
        if len(set(lines)) == 1: lines = lines[:1]
        # голос без слов вовсе (обычно тенор) строк не получает: пустые «*» под
        # нотами abcjs всё равно рисует местом под текст
        if all(set(l.split()) <= {"*"} for l in lines): continue
        for line in lines: body.append("w: " + line)
    return "\n".join(head + body) + "\n", sc, nums

KEYNAME = {"C": "до мажор", "G": "соль мажор", "D": "ре мажор", "A": "ля мажор",
           "E": "ми мажор", "B": "си мажор", "F": "фа мажор", "Bb": "си-бемоль мажор",
           "Eb": "ми-бемоль мажор", "Ab": "ля-бемоль мажор", "Db": "ре-бемоль мажор",
           "Am": "ля минор", "Em": "ми минор", "Bm": "си минор", "Dm": "ре минор",
           "Gm": "соль минор", "Cm": "до минор", "F#m": "фа-диез минор", "C#m": "до-диез минор",
           # минор бемольных тональностей: без них подпись показывала код («Fm»)
           "Fm": "фа минор", "Bbm": "си-бемоль минор", "Ebm": "ми-бемоль минор",
           "Abm": "ля-бемоль минор", "G#m": "соль-диез минор", "D#m": "ре-диез минор",
           "A#m": "ля-диез минор"}
SEMI = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7,
        "Ab": 8, "A": 9, "Bb": 10, "B": 11}

def plural(n, one, few, many):
    d, h = n % 10, n % 100
    w = one if d == 1 and h != 11 else few if 2 <= d <= 4 and not 12 <= h <= 14 else many
    return "%d %s" % (n, w)

def meta_json(abc, sc, num, verses=1):
    """Шапка страницы: то же, что генератор 119 писал руками."""
    key = abc.split("K:")[1].split("\n")[0].strip()
    bars = sum(it["nbars"] for it in sc["systems"])
    sub = "%s · %d/%d · %s" % (plural(bars, "такт", "такта", "тактов"),
                               sc["ts"][0], sc["ts"][1], KEYNAME.get(key, key))
    if verses > 1: sub += " · " + plural(verses, "куплет", "куплета", "куплетов")
    return {"title": sc["title"] or num, "num": num, "verses": verses,
            "key": SEMI.get(key.rstrip("m"), 0), "keyname": key, "sub": sub,
            "credits": sc.get("credits", [])}

if __name__ == "__main__":
    import json
    for p in sys.argv[1:]:
        abc, sc, nums = build(p)
        name = os.path.splitext(os.path.basename(p))[0]
        io_ = open("../out/%s.abc" % name, "w", encoding="utf-8"); io_.write(abc); io_.close()
        m = meta_json(abc, sc, name, len(nums))
        json.dump(m, open("../out/%s.json" % name, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("%s: %s — %s" % (name, m["title"], m["sub"]))
