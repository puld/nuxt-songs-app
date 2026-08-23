/**
 * Группировка песен для страницы «Все песни».
 *
 * Все три режима возвращают одну структуру — массив групп
 * `{ key, title, songs }`, — поэтому страница рендерит их одинаково и не
 * разветвляется по режиму.
 *
 * Списком в 1565 элементов страница не рендерится целиком: группы
 * сворачиваемые, поэтому режим «по номеру» тоже разбит на группы (по сотням),
 * а не отдан плоским списком.
 */

/** Размер группы в режиме «по номеру». */
export const NUMBER_GROUP_SIZE = 100

/** Заголовок группы для названий, начинающихся не с буквы. */
export const OTHER_LETTER = '#'

/** Заголовок группы для песен, не попавших ни в один раздел. */
export const OTHER_SECTION_TITLE = 'Вне разделов'

/** Песни по возрастанию номера; исходный массив не меняется. */
const byNumberAsc = (songs) => [...songs].sort((a, b) => Number(a.number) - Number(b.number))

/**
 * Первая буква названия в верхнем регистре.
 * Не-буквы (цифры, кавычки) сводятся в группу `#`: сейчас таких названий нет,
 * но группа держится на будущее, чтобы песня не пропала из списка.
 */
export const firstLetterOf = (title) => {
    const first = String(title || '').trim().charAt(0)

    if (!first) return OTHER_LETTER

    const upper = first.toUpperCase()

    return /\p{L}/u.test(upper) ? upper : OTHER_LETTER
}

/**
 * Группы по сотням номеров: «1–100», «101–200», …
 * Границы считаются от реальных номеров, а не от 1: если сборник когда-то
 * начнётся не с первого номера, пустых групп в начале не появится.
 *
 * @param {Array<{number: number, title: string}>} songs
 * @returns {Array<{key: string, title: string, songs: Array}>}
 */
export const groupByNumber = (songs) => {
    const sorted = byNumberAsc(songs)
    const groups = new Map()

    sorted.forEach((song) => {
        const number = Number(song.number)
        const start = Math.floor((number - 1) / NUMBER_GROUP_SIZE) * NUMBER_GROUP_SIZE + 1
        const key = String(start)

        if (!groups.has(key)) {
            groups.set(key, {
                key,
                title: `${start}–${start + NUMBER_GROUP_SIZE - 1}`,
                songs: []
            })
        }

        groups.get(key).songs.push(song)
    })

    return [...groups.values()]
}

/**
 * Группы по первой букве названия, отсортированные по русскому алфавиту.
 * Внутри группы песни идут по алфавиту, а не по номеру: в алфавитном режиме
 * ищут глазами по названию.
 *
 * @param {Array<{number: number, title: string}>} songs
 * @returns {Array<{key: string, title: string, songs: Array}>}
 */
export const groupByAlphabet = (songs) => {
    const groups = new Map()

    songs.forEach((song) => {
        const letter = firstLetterOf(song.title)

        if (!groups.has(letter)) {
            groups.set(letter, { key: letter, title: letter, songs: [] })
        }

        groups.get(letter).songs.push(song)
    })

    const collator = new Intl.Collator('ru')

    return [...groups.values()]
        .sort((a, b) => {
            // «#» — в конец: это свалка для нетипичных названий
            if (a.key === OTHER_LETTER) return 1
            if (b.key === OTHER_LETTER) return -1
            return collator.compare(a.key, b.key)
        })
        .map((group) => ({
            ...group,
            songs: [...group.songs].sort((a, b) => collator.compare(a.title || '', b.title || ''))
        }))
}

/**
 * Группы по разделам сборника, в порядке разделов.
 *
 * Разделы задают собственный порядок песен (`songNumbers`), но песни берутся
 * из базы: номер без песни пропускаем, а песню, не попавшую ни в один раздел,
 * складываем в «Вне разделов». Сейчас разделы покрывают сборник целиком, но
 * молча терять песню из-за расхождения данных нельзя — её просто не найдут.
 *
 * @param {Array<{number: number, title: string}>} songs
 * @param {Array<{id: number, title: string, songNumbers: number[]}>} sections
 * @returns {Array<{key: string, title: string, songs: Array}>}
 */
export const groupBySections = (songs, sections) => {
    const byNumber = new Map(songs.map((song) => [Number(song.number), song]))
    const used = new Set()

    const groups = (sections || []).map((section) => {
        const items = []

        ;(section.songNumbers || []).forEach((number) => {
            const song = byNumber.get(Number(number))

            if (song && !used.has(Number(number))) {
                used.add(Number(number))
                items.push(song)
            }
        })

        return {
            key: `section-${section.id}`,
            title: String(section.title || ''),
            songs: items
        }
    }).filter((group) => group.songs.length > 0)

    const rest = byNumberAsc(songs.filter((song) => !used.has(Number(song.number))))

    if (rest.length > 0) {
        groups.push({ key: 'section-other', title: OTHER_SECTION_TITLE, songs: rest })
    }

    return groups
}

/**
 * Группы для выбранного режима.
 *
 * @param {'number'|'alphabet'|'sections'} mode
 * @param {Array} songs
 * @param {Array} sections
 * @returns {Array<{key: string, title: string, songs: Array}>}
 */
export const groupSongs = (mode, songs, sections) => {
    if (!songs || songs.length === 0) return []

    if (mode === 'alphabet') return groupByAlphabet(songs)
    if (mode === 'sections') return groupBySections(songs, sections)

    return groupByNumber(songs)
}
