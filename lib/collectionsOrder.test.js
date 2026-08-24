import { describe, it, expect } from 'vitest'
import {
    AUTO_SCROLL_EDGE,
    AUTO_SCROLL_SPEED,
    autoScrollStep,
    clampOffset,
    dropIndex,
    initialOrderPlan,
    moveItem,
    previewShift,
    nextOrder,
    orderPlan,
    sortCollections
} from './collectionsOrder.js'

const c = (id, extra = {}) => ({ id, name: `c${id}`, createdAt: `2026-08-0${id}T00:00:00.000Z`, ...extra })

describe('sortCollections', () => {
    it('«Избранное» первым независимо от order', () => {
        const list = [c(1, { order: 5 }), c(2, { isFavorite: 1, order: 9 })]

        expect(sortCollections(list).map((item) => item.id)).toEqual([2, 1])
    })

    it('пользовательские идут по order, а не по дате создания', () => {
        const list = [c(1, { order: 2 }), c(2, { order: 0 }), c(3, { order: 1 })]

        expect(sortCollections(list).map((item) => item.id)).toEqual([2, 3, 1])
    })

    it('без order сортирует по дате создания', () => {
        // Так выглядит база, до которой ещё не дошла миграция.
        const list = [c(3), c(1), c(2)]

        expect(sortCollections(list).map((item) => item.id)).toEqual([1, 2, 3])
    })

    it('записи без order уходят после тех, у кого он есть', () => {
        // Только что созданная подборка попадает в конец списка, а не в начало.
        const list = [c(1), c(2, { order: 7 })]

        expect(sortCollections(list).map((item) => item.id)).toEqual([2, 1])
    })

    it('одинаковый order разводится по дате, затем по id', () => {
        const same = '2026-08-01T00:00:00.000Z'
        const list = [
            { id: 3, order: 1, createdAt: same },
            { id: 2, order: 1, createdAt: same },
            { id: 1, order: 1, createdAt: '2026-07-01T00:00:00.000Z' }
        ]

        expect(sortCollections(list).map((item) => item.id)).toEqual([1, 2, 3])
    })

    it('битая дата не роняет сортировку', () => {
        const list = [c(1, { createdAt: 'что угодно' }), c(2)]

        expect(sortCollections(list).map((item) => item.id)).toEqual([2, 1])
    })

    it('исходный массив не мутируется', () => {
        const list = [c(2, { order: 1 }), c(1, { order: 0 })]
        sortCollections(list)

        expect(list.map((item) => item.id)).toEqual([2, 1])
    })

    it('пустое и некорректное значение — пустой список', () => {
        expect(sortCollections([])).toEqual([])
        expect(sortCollections(undefined)).toEqual([])
        expect(sortCollections(null)).toEqual([])
    })
})

describe('nextOrder', () => {
    it('следом за последним существующим', () => {
        expect(nextOrder([c(1, { order: 0 }), c(2, { order: 3 })])).toBe(4)
    })

    it('на пустой базе — ноль', () => {
        expect(nextOrder([])).toBe(0)
        expect(nextOrder(undefined)).toBe(0)
    })

    it('записи без order не мешают', () => {
        expect(nextOrder([c(1), c(2, { order: 2 })])).toBe(3)
        expect(nextOrder([c(1), c(2)])).toBe(0)
    })
})

describe('orderPlan', () => {
    it('план — только для записей, где order не совпал с позицией', () => {
        const list = [c(1, { order: 0 }), c(2, { order: 5 }), c(3, { order: 2 })]

        expect(orderPlan(list)).toEqual([{ id: 2, order: 1 }])
    })

    it('верный порядок даёт пустой план', () => {
        const list = [c(1, { order: 0 }), c(2, { order: 1 })]

        expect(orderPlan(list)).toEqual([])
    })

    it('записи без order попадают в план', () => {
        expect(orderPlan([c(1), c(2)])).toEqual([{ id: 1, order: 0 }, { id: 2, order: 1 }])
    })
})

describe('initialOrderPlan', () => {
    it('нумерует по текущему порядку: «Избранное» первым, остальные по дате', () => {
        const list = [c(2), c(3), c(1, { isFavorite: 1 })]

        expect(initialOrderPlan(list)).toEqual([
            { id: 1, order: 0 },
            { id: 2, order: 1 },
            { id: 3, order: 2 }
        ])
    })

    it('идемпотентен: второй прогон ничего не меняет', () => {
        // На этом держится безопасность шага миграции при повторном апгрейде.
        const list = [c(1, { isFavorite: 1 }), c(2), c(3)]
        const applied = list.map((item) => {
            const entry = initialOrderPlan(list).find((row) => row.id === item.id)

            return entry ? { ...item, order: entry.order } : item
        })

        expect(initialOrderPlan(applied)).toEqual([])
    })

    it('база из одной пустой подборки «Избранное» — план на нулевой order', () => {
        expect(initialOrderPlan([c(1, { isFavorite: 1 })])).toEqual([{ id: 1, order: 0 }])
    })

    it('пустая база — пустой план', () => {
        expect(initialOrderPlan([])).toEqual([])
    })
})

describe('moveItem', () => {
    const list = ['a', 'b', 'c', 'd']

    it('переставляет вверх', () => {
        expect(moveItem(list, 2, 1)).toEqual(['a', 'c', 'b', 'd'])
    })

    it('переставляет вниз', () => {
        expect(moveItem(list, 1, 3)).toEqual(['a', 'c', 'd', 'b'])
    })

    it('в начало и в конец', () => {
        expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
        expect(moveItem(list, 0, 3)).toEqual(['b', 'c', 'd', 'a'])
    })

    it('та же позиция — список без изменений', () => {
        expect(moveItem(list, 1, 1)).toEqual(list)
    })

    it('выход за границы не бросает: кнопка «вверх» у первой ничего не делает', () => {
        expect(moveItem(list, 0, -1)).toEqual(list)
        expect(moveItem(list, 3, 4)).toEqual(list)
        expect(moveItem(list, 9, 0)).toEqual(list)
    })

    it('нецелые индексы игнорируются', () => {
        expect(moveItem(list, 1.5, 0)).toEqual(list)
        expect(moveItem(list, undefined, 0)).toEqual(list)
    })

    it('исходный массив не мутируется', () => {
        moveItem(list, 0, 3)

        expect(list).toEqual(['a', 'b', 'c', 'd'])
    })

    it('пустой и некорректный список', () => {
        expect(moveItem([], 0, 1)).toEqual([])
        expect(moveItem(undefined, 0, 1)).toEqual([])
    })
})

describe('dropIndex', () => {
    it('смещение меньше половины строки оставляет на месте', () => {
        expect(dropIndex(1, 20, 44, 5)).toBe(1)
        expect(dropIndex(1, -20, 44, 5)).toBe(1)
    })

    it('половина строки переносит на соседнюю позицию', () => {
        expect(dropIndex(1, 22, 44, 5)).toBe(2)
        expect(dropIndex(1, -22, 44, 5)).toBe(0)
    })

    it('несколько строк за раз', () => {
        expect(dropIndex(0, 44 * 3, 44, 5)).toBe(3)
        expect(dropIndex(4, -44 * 4, 44, 5)).toBe(0)
    })

    it('не выходит за границы списка', () => {
        // Палец легко уводят за пределы сайдбара — обрезаем, а не бросаем.
        expect(dropIndex(2, 44 * 99, 44, 5)).toBe(4)
        expect(dropIndex(2, -44 * 99, 44, 5)).toBe(0)
    })

    it('нулевая высота строки не даёт делить на ноль', () => {
        // Такое возможно, если строку измерили до отрисовки.
        expect(dropIndex(2, 100, 0, 5)).toBe(2)
        expect(dropIndex(9, 100, 0, 5)).toBe(4)
    })

    it('пустой список — нулевой индекс', () => {
        expect(dropIndex(0, 50, 44, 0)).toBe(0)
    })

    it('мусор на входе не роняет расчёт', () => {
        expect(dropIndex(undefined, 50, 44, 5)).toBe(0)
        expect(dropIndex(1, NaN, 44, 5)).toBe(1)
    })
})

describe('previewShift', () => {
    it('перетаскиваемая строка не сдвигается', () => {
        expect(previewShift(2, 2, 4)).toBe(0)
    })

    it('строка не сдвигается, если место не изменилось', () => {
        expect(previewShift(1, 2, 2)).toBe(0)
    })

    it('при движении вниз соседи между позициями поднимаются', () => {
        expect(previewShift(1, 0, 2)).toBe(-1)
        expect(previewShift(2, 0, 2)).toBe(-1)
        expect(previewShift(3, 0, 2)).toBe(0)
    })

    it('при движении вверх соседи между позициями опускаются', () => {
        expect(previewShift(1, 3, 1)).toBe(1)
        expect(previewShift(2, 3, 1)).toBe(1)
        expect(previewShift(0, 3, 1)).toBe(0)
    })

    it('мусор на входе — без сдвига', () => {
        expect(previewShift(undefined, 0, 2)).toBe(0)
        expect(previewShift(1, null, 2)).toBe(0)
    })
})

describe('clampOffset', () => {
    // Список скроллируется, а строка едет на transform: уехав за край, она
    // просто обрезается контейнером, и тащат её вслепую.
    it('смещение внутри списка не трогает', () => {
        expect(clampOffset(2, 44, 44, 5)).toBe(44)
        expect(clampOffset(2, -30, 44, 5)).toBe(-30)
    })

    it('вниз дальше последнего слота строка не уезжает', () => {
        // Со второй позиции из пяти вниз есть ровно два слота.
        expect(clampOffset(2, 500, 44, 5)).toBe(88)
    })

    it('вверх дальше первого слота строка не уезжает', () => {
        expect(clampOffset(2, -500, 44, 5)).toBe(-88)
    })

    it('крайние строки за границы не выходят вовсе', () => {
        expect(clampOffset(0, -100, 44, 5)).toBe(0)
        expect(clampOffset(4, 100, 44, 5)).toBe(0)
    })

    it('ограничение согласовано с dropIndex', () => {
        // Обе функции должны упираться в один и тот же слот, иначе строка
        // встала бы не туда, куда доехала.
        const offset = clampOffset(1, 1000, 44, 4)

        expect(dropIndex(1, offset, 44, 4)).toBe(3)
    })

    it('без измеренной высоты строки смещение остаётся как есть', () => {
        // Ограничивать нечем — лучше показать движение, чем запереть строку.
        expect(clampOffset(2, 300, 0, 5)).toBe(300)
    })

    it('мусор на входе не даёт NaN в стиле', () => {
        expect(clampOffset(2, NaN, 44, 5)).toBe(0)
        expect(clampOffset(2, undefined, 44, 5)).toBe(0)
        expect(clampOffset(null, 50, 44, 5)).toBe(50)
        expect(clampOffset(2, 50, 44, 0)).toBe(50)
    })
})

describe('autoScrollStep', () => {
    // Список на весь экран: край сверху 100, снизу 500.
    const top = 100
    const bottom = 500
    const frame = 1000 / 60

    it('у верхнего края крутит вверх, у нижнего — вниз', () => {
        expect(autoScrollStep(top + 5, top, bottom, frame)).toBeLessThan(0)
        expect(autoScrollStep(bottom - 5, top, bottom, frame)).toBeGreaterThan(0)
    })

    it('в середине списка не крутит', () => {
        expect(autoScrollStep(300, top, bottom, frame)).toBe(0)
    })

    it('граница полосы края включает всю полосу и не больше', () => {
        expect(autoScrollStep(top + AUTO_SCROLL_EDGE - 1, top, bottom, frame)).toBeLessThan(0)
        expect(autoScrollStep(top + AUTO_SCROLL_EDGE, top, bottom, frame)).toBe(0)
        expect(autoScrollStep(bottom - AUTO_SCROLL_EDGE + 1, top, bottom, frame)).toBeGreaterThan(0)
        expect(autoScrollStep(bottom - AUTO_SCROLL_EDGE, top, bottom, frame)).toBe(0)
    })

    it('указатель за пределами списка считается краем', () => {
        // Палец ушёл выше или ниже списка — крутить надо тем же направлением.
        expect(autoScrollStep(top - 40, top, bottom, frame)).toBeLessThan(0)
        expect(autoScrollStep(bottom + 40, top, bottom, frame)).toBeGreaterThan(0)
    })

    it('шаг пропорционален длительности кадра', () => {
        // Ради этого скорость и задана в px/с: на 120 Гц кадр вдвое короче, и
        // шаг обязан быть вдвое меньше, иначе список едет вдвое быстрее.
        const at60 = autoScrollStep(bottom - 5, top, bottom, 1000 / 60)
        const at120 = autoScrollStep(bottom - 5, top, bottom, 1000 / 120)

        expect(at120).toBeCloseTo(at60 / 2, 5)
    })

    it('за секунду проходит заданную скорость', () => {
        // Секунда набирается кадрами: одним вызовом её не проверить — длинный
        // кадр намеренно урезается.
        const steps = 60
        const total = Array.from({ length: steps })
            .reduce((sum) => sum + autoScrollStep(bottom - 5, top, bottom, 1000 / steps), 0)

        expect(total).toBeCloseTo(AUTO_SCROLL_SPEED, 5)
    })

    it('длинный кадр не даёт прыжка', () => {
        // Вкладка была в фоне: умножать скорость на всю паузу нельзя.
        const long = autoScrollStep(bottom - 5, top, bottom, 5000)

        expect(long).toBeGreaterThan(0)
        expect(long).toBeLessThan(AUTO_SCROLL_SPEED / 10)
    })

    it('нулевой и отрицательный кадр не двигают список', () => {
        // Так выглядит первый кадр цикла, когда считать длительность не от чего.
        expect(autoScrollStep(bottom - 5, top, bottom, 0)).toBe(0)
        expect(autoScrollStep(bottom - 5, top, bottom, -16)).toBe(0)
    })

    it('полосу края и скорость можно задать явно', () => {
        expect(autoScrollStep(bottom - 50, top, bottom, frame, 80)).toBeGreaterThan(0)
        expect(autoScrollStep(bottom - 5, top, bottom, 1000, AUTO_SCROLL_EDGE, 100)).toBeCloseTo(5, 5)
    })

    it('мусор в аргументах не двигает список', () => {
        expect(autoScrollStep(undefined, top, bottom, frame)).toBe(0)
        expect(autoScrollStep(bottom - 5, NaN, bottom, frame)).toBe(0)
        expect(autoScrollStep(bottom - 5, top, undefined, frame)).toBe(0)
        expect(autoScrollStep(bottom - 5, top, bottom, frame, AUTO_SCROLL_EDGE, 0)).toBe(0)
    })
})
