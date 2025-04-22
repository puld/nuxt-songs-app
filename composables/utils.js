export const useUtils = () => {

    const pluralize = (n, one, few, many) => {
        if (Number(n) === 0) return ""

        n = Math.abs(n) % 100
        const num = n % 10
        if (n > 10 && n < 20) return many
        if (num > 1 && num < 5) return few
        if (num === 1) return one
        return many
    }

    return { pluralize }
}