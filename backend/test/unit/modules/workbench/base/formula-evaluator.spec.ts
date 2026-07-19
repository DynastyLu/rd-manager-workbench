import { evaluateFormula } from '../../../../../src/modules/workbench/base/domain/formula-evaluator';
import { parseFormula } from '../../../../../src/modules/workbench/base/domain/formula-parser';
import {
  FormulaAst,
  FormulaField,
} from '../../../../../src/modules/workbench/base/domain/formula.types';

describe('evaluateFormula', () => {
  const fields: FormulaField[] = [
    { id: 'revenue-id', key: 'revenue', type: 'NUMBER' },
    { id: 'lookup-id', key: 'lookup', type: 'LOOKUP' },
    { id: 'date-id', key: 'date', type: 'DATE' },
  ];

  const evaluate = (expression: string, values: Record<string, unknown> = {}) =>
    evaluateFormula(parseFormula(expression, fields).ast, values);

  it('evaluates arithmetic, remainder, unary operators, and parentheses', () => {
    expect(evaluate('-(2 + 3) * +4 % 7')).toEqual({ value: -6 });
  });

  it('evaluates field values and same-type comparisons', () => {
    expect(evaluate('{revenue} >= 10', { 'revenue-id': 12 })).toEqual({ value: true });
    expect(evaluate('"alpha" < "beta"')).toEqual({ value: true });
    expect(evaluate('TRUE != FALSE')).toEqual({ value: true });
    expect(evaluate('NULL = NULL')).toEqual({ value: true });
  });

  it('returns null when a referenced field has no supplied value', () => {
    expect(evaluate('{revenue}')).toEqual({ value: null });
  });

  it('evaluates IF and only evaluates its selected branch', () => {
    expect(evaluate('IF(TRUE, "selected", 1 / 0)')).toEqual({ value: 'selected' });
    expect(evaluate('IF(FALSE, 1 / 0, "fallback")')).toEqual({ value: 'fallback' });
  });

  it('evaluates COALESCE in order and stops after the first non-null value', () => {
    expect(evaluate('COALESCE(NULL, "ready", 1 / 0)')).toEqual({ value: 'ready' });
  });

  it.each([
    ['ROUND(12.345, 2)', 12.35],
    ['ABS(-4)', 4],
    ['SUM(1, 2, 3)', 6],
    ['COUNT(NULL, 1, "x")', 2],
    ['CONCAT("a", 2, TRUE, NULL)', 'a2true'],
    ['LOWER("AbC")', 'abc'],
    ['UPPER("AbC")', 'ABC'],
    ['LEN("你好a")', 3],
  ])('evaluates %s', (expression, expected) => {
    expect(evaluate(expression)).toEqual({ value: expected });
  });

  it('accepts ROUND digits at both supported boundaries', () => {
    expect(evaluate('ROUND(1, -15)')).toEqual({ value: 0 });
    expect(evaluate('ROUND(1, 15)')).toEqual({ value: 1 });
  });

  it('rejects ROUND digits outside both supported boundaries', () => {
    expect(evaluate('ROUND(1, -16)')).toEqual({
      value: null,
      error: { code: 'TYPE_ERROR', message: expect.any(String) },
    });
    expect(evaluate('ROUND(1, 16)')).toEqual({
      value: null,
      error: { code: 'TYPE_ERROR', message: expect.any(String) },
    });
  });

  it('expands arrays supplied by LOOKUP fields for SUM and COUNT', () => {
    expect(evaluate('SUM({lookup}, 4)', { 'lookup-id': [1, 2, 3] })).toEqual({ value: 10 });
    expect(evaluate('COUNT({lookup})', { 'lookup-id': [1, null, 'x', undefined] })).toEqual({
      value: 2,
    });
  });

  it('evaluates DATE_ADD with only supported units and returns ISO text', () => {
    expect(evaluate('DATE_ADD("2026-07-19T00:00:00.000Z", 2, "day")')).toEqual({
      value: '2026-07-21T00:00:00.000Z',
    });
    expect(evaluate('DATE_ADD("2026-07-19T00:00:00.000Z", 3, "hour")')).toEqual({
      value: '2026-07-19T03:00:00.000Z',
    });
    expect(evaluate('DATE_ADD("2026-07-19T00:00:00.000Z", 5, "minute")')).toEqual({
      value: '2026-07-19T00:05:00.000Z',
    });
    expect(evaluate('DATE_ADD("2026-07-19T08:00:00+08:00", 0, "day")')).toEqual({
      value: '2026-07-19T00:00:00.000Z',
    });
  });

  it('accepts a valid Date field value', () => {
    expect(
      evaluate('DATE_ADD({date}, 1, "day")', {
        'date-id': new Date('2026-07-19T00:00:00.000Z'),
      }),
    ).toEqual({ value: '2026-07-20T00:00:00.000Z' });
  });

  it.each([
    ['DATE_ADD("07/19/2026", 1, "day")'],
    ['DATE_ADD("2026-02-30T00:00:00.000Z", 1, "day")'],
    ['DATE_ADD("2026-07-19T00:00:00", 1, "day")'],
    ['DATE_ADD("2026-07-19T00:00:00+14:01", 1, "day")'],
  ])('rejects a non-strict ISO date in %s', (expression) => {
    expect(evaluate(expression)).toEqual({
      value: null,
      error: { code: 'TYPE_ERROR', message: expect.any(String) },
    });
  });

  it('rejects an invalid Date field value', () => {
    expect(evaluate('DATE_ADD({date}, 1, "day")', { 'date-id': new Date(Number.NaN) })).toEqual({
      value: null,
      error: { code: 'TYPE_ERROR', message: expect.any(String) },
    });
  });

  it('evaluates DATE_DIFF for day, hour, and minute units', () => {
    const later = '"2026-07-21T03:05:00.000Z"';
    const earlier = '"2026-07-19T00:00:00.000Z"';

    expect(evaluate(`DATE_DIFF(${later}, ${earlier}, "day")`)).toEqual({
      value: 2.1284722222222223,
    });
    expect(evaluate(`DATE_DIFF(${later}, ${earlier}, "hour")`)).toEqual({
      value: 51.083333333333336,
    });
    expect(evaluate(`DATE_DIFF(${later}, ${earlier}, "minute")`)).toEqual({ value: 3065 });
  });

  it('returns DIV_ZERO instead of throwing for division or remainder by zero', () => {
    expect(evaluate('1 / 0')).toEqual({
      value: null,
      error: { code: 'DIV_ZERO', message: expect.any(String) },
    });
    expect(evaluate('1 % 0')).toEqual({
      value: null,
      error: { code: 'DIV_ZERO', message: expect.any(String) },
    });
  });

  it.each([
    ['"1" + "2"'],
    ['1 = "1"'],
    ['TRUE > FALSE'],
    ['ROUND(1.2, 1.5)'],
    ['ROUND(1.2, 16)'],
    ['LOWER(1)'],
  ])('returns TYPE_ERROR for invalid operand types in %s', (expression) => {
    expect(evaluate(expression)).toEqual({
      value: null,
      error: { code: 'TYPE_ERROR', message: expect.any(String) },
    });
  });

  it.each([
    ['DATE_ADD("2026-07-19", 1, "week")'],
    ['DATE_DIFF("2026-07-20", "2026-07-19", "second")'],
  ])('rejects unsupported date units in %s', (expression) => {
    expect(evaluate(expression)).toEqual({
      value: null,
      error: { code: 'TYPE_ERROR', message: expect.any(String) },
    });
  });

  it('returns INVALID_FORMULA for an AST deeper than 32 nodes', () => {
    let ast: FormulaAst = { kind: 'literal', value: 1 };
    for (let index = 0; index < 32; index += 1) {
      ast = { kind: 'unary', operator: '-', operand: ast };
    }

    expect(evaluateFormula(ast, {})).toEqual({
      value: null,
      error: { code: 'INVALID_FORMULA', message: expect.any(String) },
    });
  });

  it('returns INVALID_FORMULA for an AST over 256 nodes', () => {
    const ast: FormulaAst = {
      kind: 'call',
      name: 'SUM',
      args: Array.from({ length: 256 }, () => ({
        kind: 'literal' as const,
        value: 1,
      })),
    };

    expect(evaluateFormula(ast, {})).toEqual({
      value: null,
      error: { code: 'INVALID_FORMULA', message: expect.any(String) },
    });
  });
});
