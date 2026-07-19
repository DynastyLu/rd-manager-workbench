import {
  FormulaParseError,
  parseFormula,
} from '../../../../../src/modules/workbench/base/domain/formula-parser';
import { FormulaField } from '../../../../../src/modules/workbench/base/domain/formula.types';

describe('parseFormula', () => {
  const fields: FormulaField[] = [
    { id: 'field-revenue', key: 'revenue', type: 'NUMBER' },
    { id: 'field-cost', key: 'cost', type: 'NUMBER' },
    { id: 'field-name', key: 'name', type: 'TEXT' },
  ];

  it('uses standard precedence and left associativity', () => {
    expect(parseFormula('1 + 2 * 3 - 4 / 2', fields).ast).toEqual({
      kind: 'binary',
      operator: '-',
      left: {
        kind: 'binary',
        operator: '+',
        left: { kind: 'literal', value: 1 },
        right: {
          kind: 'binary',
          operator: '*',
          left: { kind: 'literal', value: 2 },
          right: { kind: 'literal', value: 3 },
        },
      },
      right: {
        kind: 'binary',
        operator: '/',
        left: { kind: 'literal', value: 4 },
        right: { kind: 'literal', value: 2 },
      },
    });
  });

  it('supports parentheses and unary plus and minus', () => {
    expect(parseFormula('-(1 + +2)', fields).ast).toEqual({
      kind: 'unary',
      operator: '-',
      operand: {
        kind: 'binary',
        operator: '+',
        left: { kind: 'literal', value: 1 },
        right: {
          kind: 'unary',
          operator: '+',
          operand: { kind: 'literal', value: 2 },
        },
      },
    });
  });

  it('resolves fields to ids and deduplicates dependencies in first-seen order', () => {
    expect(parseFormula('{revenue} - {cost} + {revenue}', fields)).toMatchObject({
      astVersion: 1,
      dependencies: ['field-revenue', 'field-cost'],
      ast: {
        kind: 'binary',
        operator: '+',
        right: { kind: 'field', fieldId: 'field-revenue' },
      },
    });
  });

  it('parses literals, comparisons, and allowed function calls', () => {
    const result = parseFormula('IF({revenue} >= 10, CONCAT("ready", "!"), NULL)', fields);

    expect(result.ast).toMatchObject({
      kind: 'call',
      name: 'IF',
      args: [
        { kind: 'binary', operator: '>=' },
        { kind: 'call', name: 'CONCAT' },
        { kind: 'literal', value: null },
      ],
    });
  });

  it('parses booleans and JSON-style string escapes', () => {
    expect(parseFormula('CONCAT("a\\n\\\"b\\\\c", TRUE, FALSE)', fields).ast).toEqual({
      kind: 'call',
      name: 'CONCAT',
      args: [
        { kind: 'literal', value: 'a\n"b\\c' },
        { kind: 'literal', value: true },
        { kind: 'literal', value: false },
      ],
    });
  });

  it.each([
    ['{missing}', 'UNKNOWN_FIELD'],
    ['MYSTERY(1)', 'UNKNOWN_FUNCTION'],
    ['LOWER("A").length', 'INVALID_FORMULA'],
    ['[1]', 'INVALID_FORMULA'],
    ['value = 1', 'INVALID_FORMULA'],
    ['1 2', 'INVALID_FORMULA'],
  ])('rejects unsafe or invalid expression %s', (expression, code) => {
    expect(() => parseFormula(expression, fields)).toThrow(
      expect.objectContaining({ code, position: expect.any(Number) }),
    );
  });

  it('exposes a structured error with code, message, and position', () => {
    try {
      parseFormula('{missing}', fields);
      throw new Error('Expected parseFormula to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(FormulaParseError);
      expect(error).toMatchObject({
        code: 'UNKNOWN_FIELD',
        message: expect.stringContaining('missing'),
        position: 0,
      });
    }
  });

  it('accepts expressions up to 2000 characters and rejects longer input', () => {
    expect(parseFormula(`1${' '.repeat(1999)}`, fields).ast).toEqual({
      kind: 'literal',
      value: 1,
    });
    expect(() => parseFormula(`1${' '.repeat(2000)}`, fields)).toThrow(
      expect.objectContaining({ code: 'INVALID_FORMULA', position: 2000 }),
    );
  });

  it('accepts 256 AST nodes and rejects the 257th node', () => {
    const atLimit = `SUM(${Array.from({ length: 255 }, () => '1').join(',')})`;
    const overLimit = `SUM(${Array.from({ length: 256 }, () => '1').join(',')})`;

    expect(parseFormula(atLimit, fields).ast).toMatchObject({ kind: 'call', name: 'SUM' });
    expect(() => parseFormula(overLimit, fields)).toThrow(
      expect.objectContaining({ code: 'INVALID_FORMULA' }),
    );
  });

  it('accepts AST depth 32 and rejects depth 33', () => {
    expect(parseFormula(`${'-'.repeat(31)}1`, fields).ast).toMatchObject({
      kind: 'unary',
    });
    expect(() => parseFormula(`${'-'.repeat(32)}1`, fields)).toThrow(
      expect.objectContaining({ code: 'INVALID_FORMULA' }),
    );
  });

  it('stops parsing an adversarial unary chain at the depth limit', () => {
    expect(() => parseFormula(`${'-'.repeat(1999)}1`, fields)).toThrow(
      expect.objectContaining({ code: 'INVALID_FORMULA', position: 32 }),
    );
  });
});
