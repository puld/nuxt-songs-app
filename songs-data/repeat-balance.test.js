import { describe, it, expect } from 'vitest'
import { checkRepeatBalance, checkStropheBalance, splitStrophes } from './repeat-balance.js'

// Проверка маркеров повтора в .txt песни. Функция принимает строки файла
// целиком (включая заголовок «#N Название») — так её и вызывает линтер.

/** Файл песни из строк тела. */
const song = (...bodyLines) => ['#1 Тест', '', ...bodyLines]

/** Только текст сообщений — номера строк проверяются там, где они важны. */
const messages = (lines) => checkRepeatBalance(lines).map((e) => e.message)

describe('checkRepeatBalance: корректная разметка', () => {
    it('простая реприза вокруг двух строк', () => {
        expect(checkRepeatBalance(song('1. /Славьте Христа,', 'Славьте любовь Христа! / 2р.'))).toEqual([])
    })

    it('счётчик без точки', () => {
        expect(checkRepeatBalance(song('1. /Первая,', 'вторая. /2р'))).toEqual([])
    })

    it('пробелы внутри счётчика', () => {
        expect(checkRepeatBalance(song('1. /Первая,', 'вторая. / 2 р .'))).toEqual([])
    })

    it('вложенные репризы с общим началом: // и два раздельных закрытия', () => {
        expect(checkRepeatBalance(song('Припев:', '//Аллилуйя! /6р. /2р.'))).toEqual([])
    })

    it('вложенное закрытие разнесено по строкам', () => {
        expect(checkRepeatBalance(song(
            'Припев:',
            '//«Вечная слава! /3р.',
            '/Слава Христу!» /2р.',
            '/2р.'
        ))).toEqual([])
    })

    it('реприза внутри строки', () => {
        expect(checkRepeatBalance(song('1. /Далеко /4р.', 'Там, за гранью небес голубых,'))).toEqual([])
    })

    it('несколько строф проверяются независимо', () => {
        expect(checkRepeatBalance(song(
            '1. /Первый куплет. /2р.',
            '',
            'Припев:',
            '/Припев. /3р.',
            '',
            '2. /Второй куплет. /2р.'
        ))).toEqual([])
    })

    it('строфа без маркеров', () => {
        expect(checkRepeatBalance(song('1. Обычный куплет,', 'без всяких повторов.'))).toEqual([])
    })

    it('пустой файл и отсутствующий аргумент', () => {
        expect(checkRepeatBalance([])).toEqual([])
        expect(checkRepeatBalance(undefined)).toEqual([])
    })
})

describe('checkRepeatBalance: ошибки разметки', () => {
    it('«//2р.» — у первого слеша нет счётчика', () => {
        // Главный дефект, который был в данных: выглядит как «закрыть два
        // повтора», а парсер читает `//` как два открывающих и отдаёт строфу
        // сырым текстом.
        const errors = checkRepeatBalance(song('1. /Ликуйте с хваленьем:', '/Христос воскрес! //2р.'))

        expect(errors).toHaveLength(1)
        expect(errors[0].line).toBe(4)
        expect(errors[0].message).toContain('//2р.')
        expect(errors[0].message).toContain('/3р. /2р.')
    })

    it('счётчик без «р»', () => {
        const errors = checkRepeatBalance(song('1. /Взалкавший правды:', 'трапеза мирна. /2'))

        expect(errors).toHaveLength(1)
        expect(errors[0].line).toBe(4)
        expect(errors[0].message).toContain('/2')
        expect(errors[0].message).toContain('/2р.')
    })

    it('закрывающая реприза без открывающей', () => {
        const errors = checkRepeatBalance(song('1. Просто строка. /2р.'))

        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('без открывающего')
    })

    it('один незакрытый открывающий', () => {
        const errors = checkRepeatBalance(song('1. /Строка без закрытия'))

        expect(errors).toHaveLength(1)
        expect(errors[0].line).toBe(3)
        expect(errors[0].message).toContain('Незакрытая реприза')
    })

    it('несколько незакрытых — с их количеством', () => {
        // «//» — два открывающих; закрытия нет ни одного.
        const errors = checkRepeatBalance(song('Припев:', '//«Баю, бай,', 'Спи, отдыхай.'))

        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('Незакрытые репризы: 2')
    })

    it('названная причина не дублируется сообщением о балансе', () => {
        // «//2р.» неизбежно даёт и дисбаланс: он следствие, и повторять его
        // значит удваивать вывод на каждой сломанной строфе.
        expect(messages(song('1. /Первая', '/Вторая //2р.'))).toHaveLength(1)
    })

    it('ошибка в одной строфе не скрывает ошибку в другой', () => {
        const errors = checkRepeatBalance(song(
            '1. /Первый куплет без закрытия',
            '',
            '2. Второй куплет. /2р.'
        ))

        expect(errors).toHaveLength(2)
        expect(errors[0].line).toBe(3)
        expect(errors[1].line).toBe(5)
    })
})

describe('checkRepeatBalance: что не считается разметкой', () => {
    it('маркеры в мета-блоке — текст, а не разметка', () => {
        expect(checkRepeatBalance(song(
            '1. /Первая,', 'вторая. /2р.',
            '',
            '@meta',
            'rhyme: ABAB CC (4+2 строки с /…/2р.)',
            'note: // — два вложенных повтора',
            '@end'
        ))).toEqual([])
    })

    it('строки до первого куплета не проверяются', () => {
        // Метка варианта и прочая обвязка к строфе не относятся.
        expect(checkRepeatBalance(['#1 Тест', '', '(вариант для сестёр)', '1. Куплет.'])).toEqual([])
    })

    it('дата или дробь в тексте — это открывающий слеш, и он должен быть закрыт', () => {
        // Осознанное следствие синтаксиса: слеш в тексте песни зарезервирован
        // под репризу, поэтому «1/2» в строфе — ошибка, а не исключение.
        expect(messages(song('1. Строка с 1/2 такта.'))).toHaveLength(1)
    })
})

describe('splitStrophes', () => {
    it('строфа тянется до следующего заголовка, пустые строки её не рвут', () => {
        const strophes = splitStrophes(['#1 Тест', '', '1. Первая', '', 'Вторая', 'Припев:', 'Третья'])

        expect(strophes).toHaveLength(2)
        expect(strophes[0].map((l) => l.text)).toEqual(['1. Первая', 'Вторая'])
        expect(strophes[1].map((l) => l.text)).toEqual(['Припев:', 'Третья'])
    })

    it('нумерация строк — от единицы, как в файле', () => {
        const strophes = splitStrophes(['#1 Тест', '', '1. Куплет'])

        expect(strophes[0][0].line).toBe(3)
    })

    it('«Припев.» с точкой тоже начинает строфу', () => {
        expect(splitStrophes(['#1 Тест', '', '1. Куплет', 'Припев. Текст'])).toHaveLength(2)
    })

    it('мета-блок обрывает разбор', () => {
        const strophes = splitStrophes(['#1 Тест', '', '1. Куплет', '@meta', 'note: 1. не куплет', '@end'])

        expect(strophes).toHaveLength(1)
        expect(strophes[0].map((l) => l.text)).toEqual(['1. Куплет'])
    })
})

describe('аккорды', () => {
    it('слеш баса в аккорде не считается открывающей репризой', () => {
        expect(checkStropheBalance([{ text: '{C}Бо{G/B}же!', line: 1 }])).toEqual([])
    })

    it('несколько аккордов с басом ошибок не дают', () => {
        const errors = checkStropheBalance([{ text: '{G/B}Свет {A7/E}Твой {D/F#}сил', line: 1 }])

        expect(errors).toEqual([])
    })

    it('реприза вокруг аккордов с басом сходится', () => {
        expect(checkStropheBalance([{ text: '/{C}Хва{G/B}ла /2р.', line: 1 }])).toEqual([])
    })

    it('настоящая незакрытая реприза ловится и при аккордах', () => {
        const errors = checkStropheBalance([{ text: '/{C}Хва{G/B}ла', line: 1 }])

        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('Незакрытая реприза')
    })
})
