import { parseLosslessNumber } from './numberParsers.js'
import { revive } from './revive.js'
import { GenericObject, JavaScriptValue } from './types'
import type { NumberParser, Reviver } from './types'

/**
 * The LosslessJSON.parse() method parses a string as JSON, optionally transforming
 * the value produced by parsing.
 *
 * The parser is based on the parser of Tan Li Hou shared in
 * https://lihautan.com/json-parser-with-javascript/
 *
 * @param text
 * The string to parse as JSON. See the JSON object for a description of JSON syntax.
 *
 * @param [reviver]
 * If a function, prescribes how the value originally produced by parsing is
 * transformed, before being returned.
 *
 * @param [parseNumber=parseLosslessNumber]
 * Pass a custom number parser. Input is a string, and the output can be unknown
 * numeric value: number, bigint, LosslessNumber, or a custom BigNumber library.
 *
 * @returns Returns the Object corresponding to the given JSON text.
 *
 * @throws Throws a SyntaxError exception if the string to parse is not valid JSON.
 */
export function parse(
  text: string,
  reviver?: Reviver,
  parseNumber: NumberParser = parseLosslessNumber
): JavaScriptValue {
  let i = 0
  const value = parseValue()
  expectValue(value)
  expectEndOfInput()

  return reviver ? revive(value, reviver) : value

  function parseObject(): GenericObject<unknown> | undefined {
    if (text[i] === '{') {
      i++
      skipWhitespace()

      const object: GenericObject<unknown> = {}
      let initial = true
      while (i < text.length && text[i] !== '}') {
        if (!initial) {
          eatComma()
          skipWhitespace()
        } else {
          initial = false
        }

        const key = parseString()
        if (key === undefined) {
          throwObjectKeyExpected()
        }
        if (typeof object[key] !== 'undefined') {
          // Note that we could also test `if(key in object) {...}`
          // or `if (object[key] !== 'undefined') {...}`, but that is slower.
          throwDuplicateKey(key)
        }
        skipWhitespace()
        eatColon()
        object[key] = parseValue()
      }

      if (text[i] !== '}') {
        throwObjectKeyOrEndExpected()
      }
      i++

      return object
    }
  }

  function parseArray(): Array<unknown> | unknown {
    if (text[i] === '[') {
      i++
      skipWhitespace()

      const array = []
      let initial = true
      while (i < text.length && text[i] !== ']') {
        if (!initial) {
          eatComma()
        } else {
          initial = false
        }

        const value = parseValue()
        expectArrayItem(value)
        array.push(value)
      }

      if (text[i] !== ']') {
        throwArrayItemOrEndExpected()
      }
      i++

      return array
    }
  }

  function parseValue(): unknown {
    skipWhitespace()

    const value =
      parseString() ??
      parseNumeric() ??
      parseObject() ??
      parseArray() ??
      parseKeyword('true', true) ??
      parseKeyword('false', false) ??
      parseKeyword('null', null)

    skipWhitespace()

    return value
  }

  function parseKeyword(name: string, value: unknown): unknown | undefined {
    if (text.slice(i, i + name.length) === name) {
      i += name.length
      return value
    }
  }

  function skipWhitespace() {
    while (isWhitespace(text[i])) {
      i++
    }
  }

  function parseString() {
    if (text[i] === '"') {
      i++
      let result = ''
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') {
          const char = text[i + 1]
          const escapeChar = escapeCharacters[char]
          if (escapeChar !== undefined) {
            result += escapeChar
            i++
          } else if (char === 'u') {
            if (
              isHex(text[i + 2]) &&
              isHex(text[i + 3]) &&
              isHex(text[i + 4]) &&
              isHex(text[i + 5])
            ) {
              result += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16))
              i += 5
            } else {
              throwInvalidUnicodeCharacter(i)
            }
          } else {
            throwInvalidEscapeCharacter(i)
          }
        } else {
          result += text[i]
        }
        i++
      }
      expectEndOfString()
      i++
      return result
    }
  }

  function parseNumeric() {
    const start = i
    if (text[i] === '-') {
      i++
      expectDigit(start)
    }

    if (text[i] === '0') {
      i++
    } else if (isNonZeroDigit(text[i])) {
      i++
      while (isDigit(text[i])) {
        i++
      }
    }

    if (text[i] === '.') {
      i++
      expectDigit(start)
      while (isDigit(text[i])) {
        i++
      }
    }

    if (text[i] === 'e' || text[i] === 'E') {
      i++
      if (text[i] === '-' || text[i] === '+') {
        i++
      }
      expectDigit(start)
      while (isDigit(text[i])) {
        i++
      }
    }

    if (i > start) {
      return parseNumber(text.slice(start, i))
    }
  }

  function eatComma() {
    if (text[i] !== ',') {
      throw new SyntaxError(`Comma ',' expected after value ${gotAt()}`)
    }
    i++
  }

  function eatColon() {
    if (text[i] !== ':') {
      throw new SyntaxError(`Colon ':' expected after property name ${gotAt()}`)
    }
    i++
  }

  function expectValue(value: unknown) {
    if (value === undefined) {
      throw new SyntaxError(`JSON value expected ${gotAt()}`)
    }
  }

  function expectArrayItem(value: unknown) {
    if (value === undefined) {
      throw new SyntaxError(`Array item expected ${gotAt()}`)
    }
  }

  function expectEndOfInput() {
    if (i < text.length) {
      throw new SyntaxError(`Expected end of input ${gotAt()}`)
    }
  }

  function expectDigit(start: number) {
    if (!isDigit(text[i])) {
      const numSoFar = text.slice(start, i)
      throw new SyntaxError(`Invalid number '${numSoFar}', expecting a digit ${gotAt()}`)
    }
  }

  function expectEndOfString() {
    if (text[i] !== '"') {
      throw new SyntaxError(`End of string '"' expected ${gotAt()}`)
    }
  }

  function throwObjectKeyExpected() {
    throw new SyntaxError(`Quoted object key expected ${gotAt()}`)
  }

  function throwDuplicateKey(key: string) {
    throw new SyntaxError(`Duplicate key '${key}' encountered at position ${i - key.length - 1}`)
  }

  function throwObjectKeyOrEndExpected() {
    throw new SyntaxError(`Quoted object key or end of object '}' expected ${gotAt()}`)
  }

  function throwArrayItemOrEndExpected() {
    throw new SyntaxError(`Array item or end of array ']' expected ${gotAt()}`)
  }

  function throwInvalidEscapeCharacter(start: number) {
    const chars = text.slice(start, start + 2)
    throw new SyntaxError(`Invalid escape character '${chars}' ${pos()}`)
  }

  function throwInvalidUnicodeCharacter(start: number) {
    let end = start + 2
    while (/\w/.test(text[end])) {
      end++
    }
    const chars = text.slice(start, end)
    throw new SyntaxError(`Invalid unicode character '${chars}' ${pos()}`)
  }

  // zero based character position
  function pos(): string {
    return `at position ${i}`
  }

  function got(): string {
    return text[i] ? `but got '${text[i]}'` : 'but reached end of input'
  }

  function gotAt(): string {
    return got() + ' ' + pos()
  }
}

function isWhitespace(char: string): boolean {
  return whitespaceCharacters[char] === true
}

function isHex(char: string): boolean {
  return /^[0-9a-fA-F]/.test(char)
}

function isDigit(char: string): boolean {
  return /[0-9]/.test(char)
}

function isNonZeroDigit(char: string): boolean {
  return /[1-9]/.test(char)
}

// map with all escape characters
const escapeCharacters: GenericObject<string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t'
  // note that \u is handled separately in parseString()
}

// map with all whitespace characters
const whitespaceCharacters: GenericObject<boolean> = {
  ' ': true,
  '\n': true,
  '\t': true,
  '\r': true
}
