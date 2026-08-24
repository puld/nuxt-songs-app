import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseVersion, readVersion, VERSION_FILE, DEFAULT_VERSION } from './version.js'

describe('parseVersion', () => {
    it('читает целое число', () => {
        expect(parseVersion('7')).toBe(7)
    })

    it('терпит пробелы и завершающий перевод строки', () => {
        // Файл правят руками, и `echo 3 > version.txt` оставляет \n.
        expect(parseVersion('  3\n')).toBe(3)
    })

    it('ноль — допустимое значение', () => {
        expect(parseVersion('0')).toBe(0)
    })

    it('пустой файл — не версия', () => {
        // Иначе пустой файл молча означал бы «версия 0», и опустошение файла
        // выглядело бы как откат базы к самой старой.
        expect(parseVersion('')).toBeNull()
        expect(parseVersion('   \n')).toBeNull()
    })

    it('дробное, отрицательное и шестнадцатеричное отвергаются', () => {
        // Number() принял бы все три и подставил не то число, что написал человек.
        expect(parseVersion('1.0')).toBeNull()
        expect(parseVersion('-2')).toBeNull()
        expect(parseVersion('0x2')).toBeNull()
    })

    it('мусор и несколько чисел отвергаются', () => {
        expect(parseVersion('v3')).toBeNull()
        expect(parseVersion('3 4')).toBeNull()
        expect(parseVersion('3\n4\n')).toBeNull()
    })

    it('не строка — не версия', () => {
        expect(parseVersion(undefined)).toBeNull()
        expect(parseVersion(5)).toBeNull()
    })

    it('число за пределами точности отвергается', () => {
        expect(parseVersion('9'.repeat(20))).toBeNull()
    })
})

describe('readVersion', () => {
    let dir

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'songs-version-'))
    })

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('без файла — версия по умолчанию и без ошибки', () => {
        // До первого инкремента базе честно соответствует версия 0.
        expect(readVersion(dir)).toEqual({ version: DEFAULT_VERSION })
    })

    it('читает значение из файла', () => {
        fs.writeFileSync(path.join(dir, VERSION_FILE), '12\n')

        expect(readVersion(dir)).toEqual({ version: 12 })
    })

    it('испорченное значение возвращается с ошибкой', () => {
        // Молча подставленный ноль означал бы, что все разосланные ссылки
        // считают базу самой старой, и получатели видели бы ложное «обновите базу».
        fs.writeFileSync(path.join(dir, VERSION_FILE), 'три')

        const result = readVersion(dir)

        expect(result.version).toBe(DEFAULT_VERSION)
        expect(result.error).toContain(VERSION_FILE)
        expect(result.error).toContain('три')
    })
})
