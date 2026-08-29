// Аккорды: отрисовка надписей, метка «есть аккорды», подбор тональности,
// упрощение обращений.
//
// Всё это закрыто геттером `chordsVisible` (devMode + showChords), поэтому
// почти каждый тест начинается с `enableChords` — кроме тех, что как раз
// проверяют гейт.
//
// Аккорды приходят из фикстуры: в снимке 22 песни с разметкой, из них 19 —
// с обращениями (`G/B`). Инлайновых аккордов (`{_G}`) в сборнике нет вовсе,
// поэтому их отрисовку сторожат unit-тесты `lib/chordMarkup.test.js`.

import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import {
  SONGS,
  SONGS_WITH_CHORDS,
  SONGS_WITHOUT_CHORDS,
} from '../lib/songs'
import {
  enableChords,
  gotoSong,
  waitForHomeReady,
  waitForStoredTranspose,
} from '../lib/flows'

test.describe('Аккорды: отрисовка в тексте песни', () => {
  test('без включённых аккордов надписей нет, а разметка не протекает в текст', async ({ page }) => {
    await gotoSong(page, SONGS.CHORDS.n)

    await expect(page.locator(s.song.chordLabel)).toHaveCount(0)
    // Фигурная скобка на экране означала бы, что разметку показали как текст
    await expect(page.locator(s.song.content).first()).not.toContainText('{')
  })

  test('с включёнными аккордами надписи стоят над строками', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS.n)

    const labels = page.locator(s.song.chordLabel)
    await expect(labels.first()).toBeVisible()
    // Первый аккорд песни задаёт её тональность — с него и начинается текст
    await expect(labels.first()).toHaveText(SONGS.CHORDS.key)
  })

  test('надпись не попадает в выделение и скрыта от диктора', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS.n)

    const label = page.locator(s.song.chordLabel).first()
    await expect(label).toHaveAttribute('aria-hidden', 'true')
    await expect(label).toHaveCSS('user-select', 'none')
  })

  test('у песни без аккордов надписей нет даже при включённом показе', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.NO_CHORDS.n)

    await expect(page.locator(s.song.chordLabel)).toHaveCount(0)
  })
})

test.describe('Аккорды: повтор с пометкой прохода разворачивается', () => {
  // Пометка `{2:Dm}` относится к ближайшему охватывающему повтору `/…/Nр.`:
  // такой повтор печатается столько раз, сколько его поют, и каждая копия
  // получает свои аккорды. Маркеры / и /Nр. у него не выводятся — иначе экран
  // обещал бы повторить то, что уже напечатано дважды.
  //
  // В фикстуре помечена первая строфа песни CHORD_PASSES, вторая осталась
  // обычным повтором — она же и сторожит, что развернулось не всё подряд.

  /** Текст фрагмента без надписей аккордов: они стоят внутри слов и рвут фразу. */
  const textWithoutChords = (locator) =>
    locator.evaluate((el) => {
      const clone = el.cloneNode(true)
      clone.querySelectorAll('.chord-label').forEach((label) => label.remove())
      return clone.textContent
    })

  const countOf = (haystack, needle) => haystack.split(needle).length - 1

  test('помеченная строфа печатается дважды и без маркеров повтора', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORD_PASSES.n)

    const part = page.locator(s.song.part).first()
    const repeat = part.locator(s.song.repeat)
    await expect(repeat).toHaveCount(1)

    const text = await textWithoutChords(repeat)
    expect(countOf(text, SONGS.CHORD_PASSES.line)).toBe(SONGS.CHORD_PASSES.passes)

    await expect(part.locator(s.song.repeatMarker)).toHaveCount(0)
  })

  test('аккорд прохода стоит только в своей копии, а непомеченный — в обеих', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORD_PASSES.n)

    const repeat = page.locator(s.song.part).first().locator(s.song.repeat)
    const label = (text) => repeat.locator(`${s.song.chordLabel}:text-is("${text}")`)

    await expect(label(SONGS.CHORD_PASSES.firstPassChord)).toHaveCount(1)
    await expect(label(SONGS.CHORD_PASSES.secondPassChord)).toHaveCount(1)
    await expect(label(SONGS.CHORD_PASSES.everyPassChord)).toHaveCount(SONGS.CHORD_PASSES.passes)
  })

  test('повтор без пометок по-прежнему показывает слеши и счётчик', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORD_PASSES.n)

    const markers = page.locator(s.song.part).nth(1).locator(s.song.repeatMarker)

    await expect(markers).toHaveCount(2)
    await expect(markers.first()).toHaveText('/')
    await expect(markers.last()).toHaveText(`/${SONGS.CHORD_PASSES.passes}р.`)
  })

  test('с выключенным тумблером номера проходов на экран не попадают', async ({ page }) => {
    // Разметка `{2:C#m}` уходит вместе с аккордом: «2:» на листе читалось бы
    // как часть текста песни
    await gotoSong(page, SONGS.CHORD_PASSES.n)

    const sheet = page.locator(s.song.contentWrapper)
    await expect(sheet).not.toContainText('2:')
    await expect(sheet).not.toContainText('1:')
    await expect(page.locator(s.song.chordLabel)).toHaveCount(0)
  })

  test('с выключенным тумблером повтор не разворачивается, а показывает слеши', async ({ page }) => {
    // Без аккордов копии неотличимы друг от друга: строфа выглядела бы просто
    // набранной дважды, да ещё и потеряла бы привычные слеши со счётчиком
    await gotoSong(page, SONGS.CHORD_PASSES.n)

    const part = page.locator(s.song.part).first()
    const text = await textWithoutChords(part.locator(s.song.repeat))
    expect(countOf(text, SONGS.CHORD_PASSES.line)).toBe(1)

    const markers = part.locator(s.song.repeatMarker)
    await expect(markers).toHaveCount(2)
    await expect(markers.first()).toHaveText('/')
    await expect(markers.last()).toHaveText(`/${SONGS.CHORD_PASSES.passes}р.`)
  })
})

test.describe('Аккорды: метка «есть аккорды» в списке песен', () => {
  // Экран «Все песни» сам за devMode, поэтому оба флага ставит enableChords
  test('метка стоит ровно у песен с аккордами', async ({ page }) => {
    await enableChords(page)
    await page.goto('/songs')
    await page.waitForSelector(s.songsList.songLink)

    // Первая группа — песни 1–100, то есть все песни фикстуры с аккордами
    const marked = await page.locator(`${s.songsList.songLink}:has(.chord-mark)`).evaluateAll(
      (links) => links.map((el) => Number(el.querySelector('.song-number').textContent))
    )
    const expected = SONGS_WITH_CHORDS.filter((n) => n <= 100)

    expect(marked).toEqual(expected)
  })

  test('у песни без аккордов метки нет', async ({ page }) => {
    await enableChords(page)
    await page.goto('/songs')
    await page.waitForSelector(s.songsList.songLink)

    const plain = SONGS_WITHOUT_CHORDS.find((n) => n <= 100)
    const row = page.locator(s.songsList.songLink, { has: page.locator(`.song-number:text-is("${plain}")`) })

    await expect(row.locator('.chord-mark')).toHaveCount(0)
  })

  test('с выключенным тумблером аккордов меток нет вовсе', async ({ page }) => {
    // devMode нужен ради самого экрана, но аккорды выключены — метка обещала бы
    // то, чего на странице песни не видно
    await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
    await page.goto('/songs')
    await page.waitForSelector(s.songsList.songLink)

    await expect(page.locator(s.songsList.chordMark)).toHaveCount(0)
  })
})

test.describe('Аккорды: метка в выдаче поиска', () => {
  test('метка стоит у найденной песни с аккордами и не стоит у остальных', async ({ page }) => {
    await enableChords(page)
    await waitForHomeReady(page)

    await page.fill(s.search.input, SONGS.CHORDS.title)
    await page.waitForSelector(s.search.resultItem)

    const withChords = page.locator(s.search.resultItem, {
      has: page.locator(`.song-number:text-is("${SONGS.CHORDS.n}")`),
    })
    await expect(withChords.locator('.chord-mark')).toHaveCount(1)

    // Остальные результаты того же запроса — без разметки, метки быть не должно
    const marks = await page.locator(s.search.resultChordMark).count()
    expect(marks).toBe(1)
  })

  test('с выключенным тумблером аккордов метки в выдаче нет', async ({ page }) => {
    await waitForHomeReady(page)

    await page.fill(s.search.input, SONGS.CHORDS.title)
    await page.waitForSelector(s.search.resultItem)

    await expect(page.locator(s.search.resultChordMark)).toHaveCount(0)
  })
})

test.describe('Аккорды: подбор тональности', () => {
  test('панели нет, пока аккорды выключены', async ({ page }) => {
    await gotoSong(page, SONGS.CHORDS.n)

    await expect(page.locator(s.song.chordBar)).toHaveCount(0)
  })

  test('панели нет у песни без размеченных аккордов', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.NO_CHORDS.n)

    await expect(page.locator(s.song.chordBar)).toHaveCount(0)
  })

  test('панель показывает исходную тональность песни', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS.n)

    await expect(page.locator(s.song.chordKeyName)).toHaveText(SONGS.CHORDS.key)
    // Сдвига нет — подпись пустая, а кнопка сброса держит место, но не видна
    await expect(page.locator(s.song.chordKeyShift)).toHaveText('')
    await expect(page.locator(s.song.chordReset)).toHaveCSS('visibility', 'hidden')
  })

  test('«+» поднимает тональность и сдвигает надписи аккордов', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS.n)

    const before = await page.locator(s.song.chordLabel).first().textContent()

    await page.click(s.song.chordUp)

    await expect(page.locator(s.song.chordKeyName)).toHaveText(SONGS.CHORDS.keyUp1)
    await expect(page.locator(s.song.chordKeyShift)).toHaveText('+1')
    await expect(page.locator(s.song.chordLabel).first()).toHaveText(SONGS.CHORDS.keyUp1)
    expect(before).toBe(SONGS.CHORDS.key)
  })

  test('два быстрых нажатия «+» дают два полутона, а не один', async ({ page }) => {
    // Сторож того, что шаг считает страница от актуального значения, а не блок
    // от своих props: props обновляются лишь к следующему рендеру, и раньше два
    // тапа подряд давали +1
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS.n)

    const up = page.locator(s.song.chordUp)
    await up.click()
    await up.click()

    await expect(page.locator(s.song.chordKeyShift)).toHaveText('+2')
  })

  test('сброс возвращает исходную тональность и прячется сам', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS.n)

    await page.click(s.song.chordUp)
    await expect(page.locator(s.song.chordReset)).toHaveCSS('visibility', 'visible')

    await page.click(s.song.chordReset)

    await expect(page.locator(s.song.chordKeyName)).toHaveText(SONGS.CHORDS.key)
    await expect(page.locator(s.song.chordKeyShift)).toHaveText('')
    await expect(page.locator(s.song.chordReset)).toHaveCSS('visibility', 'hidden')
  })

  test('подобранная тональность переживает уход со страницы', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS.n)

    await page.click(s.song.chordUp)
    await expect(page.locator(s.song.chordKeyShift)).toHaveText('+1')
    await waitForStoredTranspose(page, SONGS.CHORDS.n, 1)

    await gotoSong(page, SONGS.CHORDS_BASS.n)
    await gotoSong(page, SONGS.CHORDS.n)

    await expect(page.locator(s.song.chordKeyShift)).toHaveText('+1')
    await expect(page.locator(s.song.chordKeyName)).toHaveText(SONGS.CHORDS.keyUp1)
  })

  test('сдвиг у каждой песни свой', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS.n)
    await page.click(s.song.chordUp)

    await gotoSong(page, SONGS.CHORDS_BASS.n)

    await expect(page.locator(s.song.chordKeyShift)).toHaveText('')
  })
})

// Тумблеры «без басов» и «упростить сложные аккорды» слиты в один
// («Упростить для гитары», settings.simplifyChords) — обе оси одновременно:
// бас снимается тем же переключателем, что и sus4/dim/m7b5/+.
test.describe('Аккорды: тумблер «упростить для гитары»', () => {
  test('по умолчанию обращения и сложные обозначения показываются как есть', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS_BASS.n)

    const texts = await page.locator(s.song.chordLabel).allTextContents()

    expect(texts.some((t) => t.includes('/'))).toBe(true)
    for (const chord of SONGS.CHORDS_BASS.complexOriginal) {
      expect(texts).toContain(chord)
    }
  })

  // Четвёртый куплет SONGS.CHORDS_BASS — единственный с sus4/dim/m7b5/+
  test('с включённым тумблером бас пропадает, а сложные обозначения сворачиваются к простым', async ({ page }) => {
    await enableChords(page, { simplifyChords: true })
    await gotoSong(page, SONGS.CHORDS_BASS.n)

    const texts = await page.locator(s.song.chordLabel).allTextContents()

    expect(texts.length).toBeGreaterThan(0)
    expect(texts.some((t) => t.includes('/'))).toBe(false)
    for (const chord of SONGS.CHORDS_BASS.complexOriginal) {
      expect(texts).not.toContain(chord)
    }
    for (const chord of SONGS.CHORDS_BASS.complexSimplified) {
      expect(texts).toContain(chord)
    }
  })
})

test.describe('Аккорды: тумблер «диезы вместо бемолей»', () => {
  test('по умолчанию корень песни пишется бемолем', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS_FLAT.n)

    await expect(page.locator(s.song.chordLabel).first()).toHaveText(SONGS.CHORDS_FLAT.rootFlat)
  })

  test('с включённым тумблером — диезом, даже без сдвига тональности', async ({ page }) => {
    await enableChords(page, { forceSharp: true })
    await gotoSong(page, SONGS.CHORDS_FLAT.n)

    await expect(page.locator(s.song.chordLabel).first()).toHaveText(SONGS.CHORDS_FLAT.rootSharp)
  })
})

test.describe('Аккорды: тумблер «немецкая нотация»', () => {
  test('по умолчанию — английские буквы: си-бемоль Bb, си B', async ({ page }) => {
    await enableChords(page)
    await gotoSong(page, SONGS.CHORDS_FLAT.n)
    await expect(page.locator(s.song.chordLabel).first()).toHaveText(SONGS.CHORDS_FLAT.rootFlat)

    await gotoSong(page, SONGS.CHORDS_NATURAL_B.n)
    const texts = await page.locator(s.song.chordLabel).allTextContents()
    expect(texts).toContain(SONGS.CHORDS_NATURAL_B.chord)
  })

  test('с включённым тумблером си-бемоль — B, си — H', async ({ page }) => {
    await enableChords(page, { germanNotation: true })
    await gotoSong(page, SONGS.CHORDS_FLAT.n)
    await expect(page.locator(s.song.chordLabel).first()).toHaveText(SONGS.CHORDS_FLAT.rootGerman)

    await gotoSong(page, SONGS.CHORDS_NATURAL_B.n)
    const texts = await page.locator(s.song.chordLabel).allTextContents()
    expect(texts).toContain(SONGS.CHORDS_NATURAL_B.germanChord)
    expect(texts).not.toContain(SONGS.CHORDS_NATURAL_B.chord)
  })

  test('перебивает принудительные диезы на этой паре ступеней', async ({ page }) => {
    await enableChords(page, { forceSharp: true, germanNotation: true })
    await gotoSong(page, SONGS.CHORDS_FLAT.n)

    await expect(page.locator(s.song.chordLabel).first()).toHaveText(SONGS.CHORDS_FLAT.rootGerman)
  })

  test('панель тональности тоже показывает немецкую нотацию', async ({ page }) => {
    await enableChords(page, { germanNotation: true })
    await gotoSong(page, SONGS.CHORDS_FLAT.n)

    await expect(page.locator(s.song.chordKeyName)).toHaveText(SONGS.CHORDS_FLAT.rootGerman)
  })
})
