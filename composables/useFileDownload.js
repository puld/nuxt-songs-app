/**
 * Отдача текста файлом.
 *
 * В установленном PWA это единственный способ «сохранить наружу»: диалога
 * сохранения у страницы нет, а ссылка с `download` его вызывает.
 *
 * Живёт в composable, а не в `lib/`, потому что трогает DOM: `lib/` — чистые
 * функции. Зовут её из двух мест (настройки и страница подборки), поэтому и
 * вынесена — копия быстро разъехалась бы по типу файла и очистке URL.
 */
export const useFileDownload = () => {
    const downloadText = (text, fileName, type = 'application/json') => {
        const url = URL.createObjectURL(new Blob([text], { type }))
        const link = document.createElement('a')

        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        link.remove()
        // Без отзыва Blob остаётся в памяти вкладки до её закрытия.
        URL.revokeObjectURL(url)
    }

    return { downloadText }
}
