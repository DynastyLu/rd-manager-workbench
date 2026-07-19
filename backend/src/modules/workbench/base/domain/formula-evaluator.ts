import {
  FormulaAst,
  FormulaBinaryOperator,
  FormulaEvaluationErrorCode,
  FormulaEvaluationResult,
  FormulaFunctionName,
} from './formula.types';

const MAX_AST_NODES = 256;
const MAX_DEPTH = 32;
const MAX_ROUND_DIGITS = 15;

const FUNCTION_NAMES = new Set<FormulaFunctionName>([
  'IF',
  'COALESCE',
  'ROUND',
  'ABS',
  'SUM',
  'COUNT',
  'CONCAT',
  'LOWER',
  'UPPER',
  'LEN',
  'DATE_ADD',
  'DATE_DIFF',
]);

const BINARY_OPERATORS = new Set<FormulaBinaryOperator>([
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
]);

const DATE_UNIT_MILLISECONDS = {
  day: 86_400_000,
  hour: 3_600_000,
  minute: 60_000,
} as const;

const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

type DateUnit = keyof typeof DATE_UNIT_MILLISECONDS;

class FormulaEvaluationFailure extends Error {
  constructor(
    readonly code: FormulaEvaluationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FormulaEvaluationFailure';
  }
}

export function evaluateFormula(
  ast: FormulaAst,
  values: Readonly<Record<string, unknown>>,
): FormulaEvaluationResult {
  try {
    validateAst(ast);
    return { value: evaluateNode(ast, values) };
  } catch (error) {
    if (error instanceof FormulaEvaluationFailure) {
      return { value: null, error: { code: error.code, message: error.message } };
    }
    return {
      value: null,
      error: { code: 'INVALID_FORMULA', message: 'Formula evaluation failed' },
    };
  }
}

function validateAst(ast: FormulaAst): void {
  const stack: Array<{ node: unknown; depth: number }> = [{ node: ast, depth: 1 }];
  let nodeCount = 0;

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    nodeCount += 1;
    if (nodeCount > MAX_AST_NODES) invalid(`Formula exceeds ${MAX_AST_NODES} AST nodes`);
    if (entry.depth > MAX_DEPTH) invalid(`Formula depth exceeds ${MAX_DEPTH}`);
    if (!isRecord(entry.node) || typeof entry.node.kind !== 'string') invalid('Malformed AST node');

    const node = entry.node;
    switch (node.kind) {
      case 'literal':
        if (!isLiteral(node.value)) invalid('Invalid literal value');
        break;
      case 'field':
        if (typeof node.fieldId !== 'string' || node.fieldId.length === 0) {
          invalid('Invalid field node');
        }
        break;
      case 'unary':
        if (node.operator !== '+' && node.operator !== '-') invalid('Invalid unary operator');
        stack.push({ node: node.operand, depth: entry.depth + 1 });
        break;
      case 'binary':
        if (!BINARY_OPERATORS.has(node.operator as FormulaBinaryOperator)) {
          invalid('Invalid binary operator');
        }
        stack.push(
          { node: node.right, depth: entry.depth + 1 },
          { node: node.left, depth: entry.depth + 1 },
        );
        break;
      case 'call':
        if (!FUNCTION_NAMES.has(node.name as FormulaFunctionName) || !Array.isArray(node.args)) {
          invalid('Invalid function call');
        }
        for (let index = node.args.length - 1; index >= 0; index -= 1) {
          stack.push({ node: node.args[index], depth: entry.depth + 1 });
        }
        break;
      default:
        invalid('Unknown AST node');
    }
  }
}

function evaluateNode(ast: FormulaAst, values: Readonly<Record<string, unknown>>): unknown {
  switch (ast.kind) {
    case 'literal':
      return ast.value;
    case 'field':
      return Object.prototype.hasOwnProperty.call(values, ast.fieldId) ? values[ast.fieldId] : null;
    case 'unary': {
      const value = requireNumber(evaluateNode(ast.operand, values), 'Unary operand');
      return ast.operator === '+' ? value : -value;
    }
    case 'binary':
      return evaluateBinary(
        ast.operator,
        evaluateNode(ast.left, values),
        evaluateNode(ast.right, values),
      );
    case 'call':
      return evaluateCall(ast.name, ast.args, values);
  }
}

function evaluateBinary(operator: FormulaBinaryOperator, left: unknown, right: unknown): unknown {
  if (operator === '=' || operator === '!=') {
    requireComparablePair(left, right);
    return operator === '=' ? left === right : left !== right;
  }
  if (operator === '>' || operator === '>=' || operator === '<' || operator === '<=') {
    if (typeof left === 'number' && typeof right === 'number') {
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        fail('TYPE_ERROR', 'Ordered comparison numbers must be finite');
      }
      return compareOrdered(operator, left, right);
    }
    if (typeof left === 'string' && typeof right === 'string') {
      return compareOrdered(operator, left, right);
    }
    fail('TYPE_ERROR', 'Ordered comparison operands must both be numbers or both be text');
  }

  const leftNumber = requireNumber(left, `Left operand of ${operator}`);
  const rightNumber = requireNumber(right, `Right operand of ${operator}`);
  if ((operator === '/' || operator === '%') && rightNumber === 0) {
    fail('DIV_ZERO', 'Division by zero');
  }

  let result: number;
  if (operator === '+') result = leftNumber + rightNumber;
  else if (operator === '-') result = leftNumber - rightNumber;
  else if (operator === '*') result = leftNumber * rightNumber;
  else if (operator === '/') result = leftNumber / rightNumber;
  else result = leftNumber % rightNumber;
  return requireFiniteResult(result);
}

function evaluateCall(
  name: FormulaFunctionName,
  args: readonly FormulaAst[],
  values: Readonly<Record<string, unknown>>,
): unknown {
  if (name === 'IF') {
    requireArity(name, args, 3, 3);
    const condition = evaluateNode(args[0], values);
    if (typeof condition !== 'boolean') fail('TYPE_ERROR', 'IF condition must be boolean');
    return evaluateNode(condition ? args[1] : args[2], values);
  }
  if (name === 'COALESCE') {
    requireArity(name, args, 1);
    for (const arg of args) {
      const value = evaluateNode(arg, values);
      if (value !== null && value !== undefined) return value;
    }
    return null;
  }

  const evaluated = args.map((arg) => evaluateNode(arg, values));
  switch (name) {
    case 'ROUND': {
      requireArity(name, args, 1, 2);
      const value = requireNumber(evaluated[0], 'ROUND value');
      const digits = evaluated.length === 1 ? 0 : requireNumber(evaluated[1], 'ROUND digits');
      if (!Number.isInteger(digits) || Math.abs(digits) > MAX_ROUND_DIGITS) {
        fail(
          'TYPE_ERROR',
          `ROUND digits must be an integer from -${MAX_ROUND_DIGITS} to ${MAX_ROUND_DIGITS}`,
        );
      }
      const factor = 10 ** digits;
      return requireFiniteResult(Math.round(value * factor) / factor);
    }
    case 'ABS':
      requireArity(name, args, 1, 1);
      return Math.abs(requireNumber(evaluated[0], 'ABS value'));
    case 'SUM':
      return sumValues(evaluated);
    case 'COUNT':
      return flattenValues(evaluated).filter((value) => value !== null && value !== undefined)
        .length;
    case 'CONCAT':
      return flattenValues(evaluated).map(stringifyConcatValue).join('');
    case 'LOWER':
      requireArity(name, args, 1, 1);
      return requireString(evaluated[0], 'LOWER value').toLowerCase();
    case 'UPPER':
      requireArity(name, args, 1, 1);
      return requireString(evaluated[0], 'UPPER value').toUpperCase();
    case 'LEN': {
      requireArity(name, args, 1, 1);
      const value = evaluated[0];
      if (typeof value === 'string' || Array.isArray(value)) return value.length;
      fail('TYPE_ERROR', 'LEN value must be text or an array');
    }
    case 'DATE_ADD': {
      requireArity(name, args, 3, 3);
      const timestamp = requireDate(evaluated[0], 'DATE_ADD date');
      const amount = requireNumber(evaluated[1], 'DATE_ADD amount');
      const unit = requireDateUnit(evaluated[2]);
      return new Date(timestamp + amount * DATE_UNIT_MILLISECONDS[unit]).toISOString();
    }
    case 'DATE_DIFF': {
      requireArity(name, args, 3, 3);
      const later = requireDate(evaluated[0], 'DATE_DIFF later date');
      const earlier = requireDate(evaluated[1], 'DATE_DIFF earlier date');
      const unit = requireDateUnit(evaluated[2]);
      return (later - earlier) / DATE_UNIT_MILLISECONDS[unit];
    }
    default:
      invalid('Invalid lazy function dispatch');
  }
}

function compareOrdered<T extends string | number>(
  operator: '>' | '>=' | '<' | '<=',
  left: T,
  right: T,
): boolean {
  if (operator === '>') return left > right;
  if (operator === '>=') return left >= right;
  if (operator === '<') return left < right;
  return left <= right;
}

function flattenValues(values: readonly unknown[]): unknown[] {
  const flattened: unknown[] = [];
  const pending = [...values].reverse();
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) pending.push(value[index]);
    } else {
      flattened.push(value);
    }
  }
  return flattened;
}

function sumValues(values: readonly unknown[]): number {
  let total = 0;
  for (const value of flattenValues(values)) {
    if (value === null || value === undefined) continue;
    total += requireNumber(value, 'SUM value');
    requireFiniteResult(total);
  }
  return total;
}

function stringifyConcatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  fail('TYPE_ERROR', 'CONCAT values must be text, numbers, booleans, or null');
}

function requireArity(
  name: FormulaFunctionName,
  args: readonly FormulaAst[],
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): void {
  if (args.length < minimum || args.length > maximum) {
    const expected = minimum === maximum ? `${minimum}` : `${minimum} to ${maximum}`;
    fail('TYPE_ERROR', `${name} expects ${expected} arguments`);
  }
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('TYPE_ERROR', `${label} must be a finite number`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') fail('TYPE_ERROR', `${label} must be text`);
  return value;
}

function requireDate(value: unknown, label: string): number {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (!Number.isFinite(timestamp)) fail('TYPE_ERROR', `${label} must be a valid date`);
    return timestamp;
  }
  if (typeof value !== 'string') fail('TYPE_ERROR', `${label} must be a date`);

  const match = ISO_DATE_TIME_PATTERN.exec(value);
  if (!match) {
    fail('TYPE_ERROR', `${label} must be an ISO-8601 date-time with a timezone`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);
  const daysInMonth = month === 2 && isLeapYear(year) ? 29 : (DAYS_PER_MONTH[month - 1] ?? 0);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    fail('TYPE_ERROR', `${label} must be a valid ISO-8601 date-time`);
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail('TYPE_ERROR', `${label} must be a valid date`);
  return timestamp;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function requireDateUnit(value: unknown): DateUnit {
  if (value !== 'day' && value !== 'hour' && value !== 'minute') {
    fail('TYPE_ERROR', 'Date unit must be day, hour, or minute');
  }
  return value;
}

function requireComparablePair(left: unknown, right: unknown): void {
  if (left === null || right === null) {
    if (left === null && right === null) return;
    fail('TYPE_ERROR', 'Comparison operands must have the same type');
  }
  if (
    typeof left !== typeof right ||
    !['string', 'number', 'boolean'].includes(typeof left) ||
    (typeof left === 'number' && (!Number.isFinite(left) || !Number.isFinite(right)))
  ) {
    fail('TYPE_ERROR', 'Comparison operands must have the same comparable type');
  }
}

function requireFiniteResult(value: number): number {
  if (!Number.isFinite(value)) fail('TYPE_ERROR', 'Numeric result must be finite');
  return value;
}

function isLiteral(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  return fail('INVALID_FORMULA', message);
}

function fail(code: FormulaEvaluationErrorCode, message: string): never {
  throw new FormulaEvaluationFailure(code, message);
}
