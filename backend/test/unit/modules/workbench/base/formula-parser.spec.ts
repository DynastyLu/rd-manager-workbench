import {
  FormulaParseError,
  parseFormula,
} from '../../../../../src/modules/workbench/base/domain/formula-parser';
import {
  FormulaAst,
  FormulaEvaluationError,
  FormulaEvaluationResult,
  FormulaField,
  ParsedFormula,
} from '../../../../../src/modules/workbench/base/domain/formula.types';

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

  it('publishes immutable formula contracts', () => {
    const literal: FormulaAst = { kind: 'literal', value: 1 };
    const field: FormulaAst = { kind: 'field', fieldId: 'field-revenue' };
    const unary: FormulaAst = { kind: 'unary', operator: '-', operand: literal };
    const binary: FormulaAst = {
      kind: 'binary',
      operator: '+',
      left: literal,
      right: field,
    };
    const call: FormulaAst = { kind: 'call', name: 'SUM', args: [literal] };
    const parsed: ParsedFormula = {
      astVersion: 1,
      ast: call,
      dependencies: ['field-revenue'],
    };
    const evaluationError: FormulaEvaluationError = {
      code: 'TYPE_ERROR',
      message: 'Invalid value',
    };
    const result: FormulaEvaluationResult = { value: null, error: evaluationError };
    const formulaField: FormulaField = { id: 'id', key: 'key', type: 'NUMBER' };

    if (false) {
      // @ts-expect-error Formula AST discriminants are immutable.
      literal.kind = 'literal';
      // @ts-expect-error Literal values are immutable.
      literal.value = 2;
      // @ts-expect-error Field ids are immutable.
      field.fieldId = 'other';
      // @ts-expect-error Unary operators are immutable.
      unary.operator = '+';
      // @ts-expect-error Unary operands are immutable.
      unary.operand = field;
      // @ts-expect-error Binary operators are immutable.
      binary.operator = '-';
      // @ts-expect-error Binary operands are immutable.
      binary.left = field;
      // @ts-expect-error Function names are immutable.
      call.name = 'COUNT';
      // @ts-expect-error Function argument arrays are immutable.
      call.args.push(field);
      // @ts-expect-error Parsed AST versions are immutable.
      parsed.astVersion = 1;
      // @ts-expect-error Parsed ASTs are immutable.
      parsed.ast = literal;
      // @ts-expect-error Dependency arrays are immutable.
      parsed.dependencies.push('other');
      // @ts-expect-error Evaluation error codes are immutable.
      evaluationError.code = 'DIV_ZERO';
      // @ts-expect-error Evaluation error messages are immutable.
      evaluationError.message = 'Other';
      // @ts-expect-error Evaluation values are immutable.
      result.value = 1;
      // @ts-expect-error Evaluation errors are immutable.
      result.error = undefined;
      // @ts-expect-error Formula field metadata is immutable.
      formulaField.id = 'other';
    }

    expect(parsed.dependencies).toEqual(['field-revenue']);
    expect(result.error).toBe(evaluationError);
  });
});
