import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('reads a plain table', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips the UTF-8 BOM Excel writes', () => {
    expect(parseCsv('﻿name,price\nCup,10')).toEqual([
      ['name', 'price'],
      ['Cup', '10'],
    ])
  })

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('a,b\n"one, two",3')).toEqual([
      ['a', 'b'],
      ['one, two', '3'],
    ])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']])
  })

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"line1\nline2",3')).toEqual([
      ['a', 'b'],
      ['line1\nline2', '3'],
    ])
  })

  it('preserves empty cells', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
  })

  it('drops blank lines rather than emitting empty rows', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads Thai text unchanged', () => {
    expect(parseCsv('name\nแก้วพลาสติกใส')).toEqual([['name'], ['แก้วพลาสติกใส']])
  })

  it('returns an empty table for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})
