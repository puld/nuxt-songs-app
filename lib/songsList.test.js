import { describe, it, expect } from 'vitest'
import {
    firstLetterOf,
    groupByNumber,
    groupByAlphabet,
    groupBySections,
    groupSongs,
    normalizeSongsListMode,
    DEFAULT_SONGS_LIST_MODE,
    SONGS_LIST_MODES,
    NUMBER_GROUP_SIZE,
    OTHER_LETTER,
    OTHER_SECTION_TITLE
} from './songsList'

const song = (number, title) => ({ number, title })

describe('firstLetterOf', () => {
    it('возвращает первую букву в верхнем регистре', () => {
        expect(firstLetterOf('слушайте повесть')).toBe('С')
    })

    it('пропускает ведущие пробелы', () => {
        expect(firstLetterOf('  Вот настал')).toBe('В')
    })

    it('название с цифры или знака попадает в группу «#»', () => {
        expect(firstLetterOf('1000 причин')).toBe(OTHER_LETTER)
        expect(firstLetterOf('«Аллилуйя»')).toBe(OTHER_LETTER)
    })

    it('пустое название попадает в группу «#», а не роняет группировку', () => {
        expect(firstLetterOf('')).toBe(OTHER_LETTER)
        expect(firstLetterOf(undefined)).toBe(OTHER_LETTER)
    })
})

describe('groupByNumber', () => {
    it('разбивает песни по сотням с человекочитаемым заголовком', () => {
        const groups = groupByNumber([song(1, 'А'), song(100, 'Б'), song(101, 'В'), song(250, 'Г')])

        expect(groups.map((g) => g.title)).toEqual(['1–100', '101–200', '201–300'])
        expect(groups[0].songs.map((s) => s.number)).toEqual([1, 100])
        expect(groups[2].songs.map((s) => s.number)).toEqual([250])
    })

    it('сортирует песни по номеру независимо от порядка на входе', () => {
        const groups = groupByNumber([song(42, 'Б'), song(7, 'А')])

        expect(groups[0].songs.map((s) => s.number)).toEqual([7, 42])
    })

    it('не создаёт пустых групп в начале, если сборник начинается не с первого номера', () => {
        const groups = groupByNumber([song(305, 'А')])

        expect(groups).toHaveLength(1)
        expect(groups[0].title).toBe('301–400')
    })

    it('не меняет исходный массив', () => {
        const songs = [song(2, 'Б'), song(1, 'А')]

        groupByNumber(songs)

        expect(songs.map((s) => s.number)).toEqual([2, 1])
    })

    it('размер группы соответствует объявленной константе', () => {
        const songs = Array.from({ length: NUMBER_GROUP_SIZE + 1 }, (_, i) => song(i + 1, 'Х'))

        const groups = groupByNumber(songs)

        expect(groups).toHaveLength(2)
        expect(groups[0].songs).toHaveLength(NUMBER_GROUP_SIZE)
    })
})

describe('groupByAlphabet', () => {
    it('группирует по первой букве и сортирует группы по русскому алфавиту', () => {
        const groups = groupByAlphabet([song(3, 'Слушайте'), song(1, 'Вот настал'), song(2, 'Боже')])

        expect(groups.map((g) => g.title)).toEqual(['Б', 'В', 'С'])
    })

    it('внутри группы песни идут по алфавиту, а не по номеру', () => {
        const groups = groupByAlphabet([song(10, 'Вот настал'), song(2, 'Великий Бог')])

        expect(groups[0].songs.map((s) => s.title)).toEqual(['Великий Бог', 'Вот настал'])
    })

    it('группа «#» уходит в конец', () => {
        const groups = groupByAlphabet([song(1, '1000 причин'), song(2, 'Аллилуйя')])

        expect(groups.map((g) => g.title)).toEqual(['А', OTHER_LETTER])
    })

    it('регистр первой буквы не создаёт двух групп', () => {
        const groups = groupByAlphabet([song(1, 'Вот'), song(2, 'вечер')])

        expect(groups).toHaveLength(1)
        expect(groups[0].songs).toHaveLength(2)
    })
})

describe('groupBySections', () => {
    const sections = [
        { id: 0, title: 'Перед началом собрания', songNumbers: [2, 1] },
        { id: 1, title: 'Хвала', songNumbers: [10] }
    ]

    it('сохраняет порядок разделов и порядок песен внутри раздела', () => {
        const groups = groupBySections([song(1, 'А'), song(2, 'Б'), song(10, 'В')], sections)

        expect(groups.map((g) => g.title)).toEqual(['Перед началом собрания', 'Хвала'])
        expect(groups[0].songs.map((s) => s.number)).toEqual([2, 1])
    })

    it('номер без песни в базе пропускается', () => {
        const groups = groupBySections([song(1, 'А')], [{ id: 0, title: 'Раздел', songNumbers: [1, 999] }])

        expect(groups[0].songs.map((s) => s.number)).toEqual([1])
    })

    it('песня вне разделов попадает в группу «Вне разделов» в конце', () => {
        const groups = groupBySections([song(1, 'А'), song(77, 'Потеряшка')], [
            { id: 0, title: 'Раздел', songNumbers: [1] }
        ])

        expect(groups).toHaveLength(2)
        expect(groups[1].title).toBe(OTHER_SECTION_TITLE)
        expect(groups[1].songs.map((s) => s.number)).toEqual([77])
    })

    it('песня, указанная в двух разделах, показывается один раз — в первом', () => {
        const groups = groupBySections([song(1, 'А')], [
            { id: 0, title: 'Первый', songNumbers: [1] },
            { id: 1, title: 'Второй', songNumbers: [1] }
        ])

        expect(groups).toHaveLength(1)
        expect(groups[0].title).toBe('Первый')
    })

    it('пустые разделы не показываются', () => {
        const groups = groupBySections([song(1, 'А')], [
            { id: 0, title: 'Пустой', songNumbers: [] },
            { id: 1, title: 'С песней', songNumbers: [1] }
        ])

        expect(groups.map((g) => g.title)).toEqual(['С песней'])
    })

    it('без разделов все песни уходят в «Вне разделов»', () => {
        const groups = groupBySections([song(2, 'Б'), song(1, 'А')], [])

        expect(groups).toHaveLength(1)
        expect(groups[0].songs.map((s) => s.number)).toEqual([1, 2])
    })

    it('раздел без songNumbers не роняет группировку', () => {
        expect(() => groupBySections([song(1, 'А')], [{ id: 0, title: 'Битый' }])).not.toThrow()
    })
})

describe('groupSongs', () => {
    const songs = [song(1, 'Вот'), song(2, 'Аллилуйя')]
    const sections = [{ id: 0, title: 'Раздел', songNumbers: [1, 2] }]

    it('режим «по номеру» — по умолчанию и для неизвестного значения', () => {
        expect(groupSongs('number', songs, sections)[0].title).toBe('1–100')
        expect(groupSongs('что-то новое', songs, sections)[0].title).toBe('1–100')
    })

    it('режим «по алфавиту» отдаёт буквенные группы', () => {
        expect(groupSongs('alphabet', songs, sections).map((g) => g.title)).toEqual(['А', 'В'])
    })

    it('режим «по разделам» отдаёт разделы', () => {
        expect(groupSongs('sections', songs, sections).map((g) => g.title)).toEqual(['Раздел'])
    })

    it('пустой список песен даёт пустой результат в любом режиме', () => {
        expect(groupSongs('sections', [], sections)).toEqual([])
        expect(groupSongs('alphabet', null, sections)).toEqual([])
    })
})

describe('normalizeSongsListMode', () => {
    it('допустимые режимы возвращаются как есть', () => {
        SONGS_LIST_MODES.forEach((mode) => {
            expect(normalizeSongsListMode(mode)).toBe(mode)
        })
    })

    it('мусор из localStorage сводится к режиму по умолчанию', () => {
        // Без этого страница сгруппировала бы песни по номеру,
        // но ни одна кнопка режима не подсветилась бы.
        expect(normalizeSongsListMode('по разделам')).toBe(DEFAULT_SONGS_LIST_MODE)
        expect(normalizeSongsListMode('')).toBe(DEFAULT_SONGS_LIST_MODE)
        expect(normalizeSongsListMode(undefined)).toBe(DEFAULT_SONGS_LIST_MODE)
        expect(normalizeSongsListMode(null)).toBe(DEFAULT_SONGS_LIST_MODE)
        expect(normalizeSongsListMode(0)).toBe(DEFAULT_SONGS_LIST_MODE)
    })

    it('режим по умолчанию — «по номеру»', () => {
        expect(DEFAULT_SONGS_LIST_MODE).toBe('number')
    })
})
