/**
 * Раскладка надписей аккордов над строкой: столкнувшиеся обозначения центрируются
 * над группой своих слогов.
 *
 * Надпись выведена из потока и ширины не занимает — текст песни выглядит ровно так же,
 * как без аккордов. Плата за это — наложение: там, где гармония меняется на каждом слоге,
 * «Dm» и «Am/E» слипаются в одно слово. Поэтому надписи, которым не хватило места,
 * раздвигаются, и вопрос лишь в том, куда.
 *
 * Сдвигать только вправо (как делают песенники с моноширинным блоком аккордов) — значит
 * копить сдвиг по цепочке: последняя надпись группы уезжает от своего слога дальше всех.
 * Здесь цепочка столкнувшихся надписей укладывается плотно и ставится так, чтобы её
 * середина совпала с серединой желаемых позиций: часть надписей уходит влево, часть
 * вправо, и наибольшая ошибка привязки делится между ними. На сборнике это дало вдвое
 * меньшее среднее отклонение при той же читаемости.
 *
 * Ширину надписи знает только браузер, поэтому раскладка считается по измерениям. Здесь —
 * чистая арифметика; измерения и запись стилей — в `SongDisplay`.
 */

/** Зазор между соседними надписями, px: без него «Dm» и «Am/E» читаются слитно. */
export const CHORD_GAP = 6

/** Строки различаются по вертикали; расхождение в пределах пикселя — та же строка. */
const ROW_TOLERANCE = 1

/**
 * Кластеры внутри строки — списки индексов. Надпись, налезающая на предыдущую (с учётом
 * зазора), попадает в тот же кластер: развести их порознь всё равно не выйдет, а сдвигать
 * их нужно согласованно.
 */
function clusterRow(labels, from, to, gap) {
  const clusters = []
  let current = null
  let reach = -Infinity

  for (let i = from; i < to; i += 1) {
    const label = labels[i]

    if (current && label.left < reach) {
      current.push(i)
    } else {
      current = [i]
      clusters.push(current)
    }

    reach = Math.max(reach, label.left + label.width + gap)
  }

  return clusters
}

/**
 * Считает горизонтальные сдвиги надписей.
 *
 * @param {Array<{top: number, left: number, width: number}>} labels — измерения надписей
 *   в порядке чтения; координаты в одной системе отсчёта
 * @param {{gap?: number, maxRight?: number, minLeft?: number}} [options] — зазор и границы
 *   строки, за которые надпись выходить не должна
 * @returns {number[]} сдвиг для каждой надписи, px (отрицательный — влево)
 */
export function planChordShifts(labels, options = {}) {
  const gap = options.gap ?? CHORD_GAP
  const maxRight = options.maxRight ?? Infinity
  const minLeft = options.minLeft ?? -Infinity

  const shifts = new Array(labels.length).fill(0)

  let from = 0
  while (from < labels.length) {
    let to = from + 1
    while (to < labels.length && Math.abs(labels[to].top - labels[from].top) <= ROW_TOLERANCE) {
      to += 1
    }

    let prevEnd = -Infinity
    const placed = []

    for (const cluster of clusterRow(labels, from, to, gap)) {
      const width = cluster.reduce((sum, i) => sum + labels[i].width, 0)
      const total = width + gap * (cluster.length - 1)

      // Середина желаемых позиций: куда группа встала бы, если бы места хватало
      const wanted =
        cluster.reduce((sum, i) => sum + labels[i].left + labels[i].width / 2, 0) / cluster.length
      let start = wanted - total / 2

      // Края строки и уже размещённый сосед важнее центровки: за краем надпись обрезает
      // или растягивает блок в скролл, а наложение возвращает ровно ту проблему, ради
      // которой всё и считается
      if (start + total > maxRight) start = maxRight - total
      if (start < minLeft) start = minLeft
      if (start < prevEnd + gap) start = prevEnd + gap

      placed.push({ cluster, start, total })
      prevEnd = start + total
    }

    // Проход справа налево: упор в соседа выше по строке сдвигает группу вправо и способен
    // вытолкнуть её за правый край — а обрезанная надпись растягивает страницу в
    // горизонтальный скролл, то есть ломает не только себя. Поэтому крайняя группа
    // прижимается к краю, а те, что левее, расступаются перед ней. Дальше левого края
    // отступать некуда: там строка просто уже суммы надписей, и наложение неизбежно.
    let limit = maxRight
    for (let k = placed.length - 1; k >= 0; k -= 1) {
      const item = placed[k]
      if (item.start + item.total > limit) item.start = Math.max(minLeft, limit - item.total)
      limit = item.start - gap
    }

    for (const { cluster, start, total } of placed) {
      // Группа шире всей строки (девять обозначений над строкой в 315px требуют 410) —
      // уложить её с зазором нечем. Тогда зазоры ужимаются пропорционально, чтобы
      // последняя надпись закончилась ровно на краю: тесно стоящие надписи читаются,
      // а уехавшая за край обрезается и вдобавок растягивает страницу в скролл.
      const last = labels[cluster[cluster.length - 1]].width
      const room = maxRight - start
      const scale = total > room && total > last ? (room - last) / (total - last) : 1

      let offset = 0
      for (const i of cluster) {
        shifts[i] = start + offset * scale - labels[i].left
        offset += labels[i].width + gap
      }
    }

    from = to
  }

  return shifts
}
