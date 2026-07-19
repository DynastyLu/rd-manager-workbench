import {
  FormulaAst,
  FormulaBinaryOperator,
  FormulaField,
  FormulaFunctionName,
  FormulaParseErrorCode,
  FormulaUnaryOperator,
  ParsedFormula,
} from './formula.types';

const MAX_EXPRESSION_LENGTH = 2_000;
const MAX_AST_NODES = 256;
const MAX_DEPTH = 32;

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

const BINARY_PRECEDENCE: Readonly<Record<FormulaBinaryOperator, number>> = {
  '=': 1,
  '!=': 1,
  '>': 2,
  '>=': 2,
  '<': 2,
  '<=': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '%': 4,
};

type TokenKind =
  | 'number'
  | 'string'
  | 'boolean'
  | 'null'
  | 'field'
  | 'identifier'
  | 'operator'
  | 'leftParen'
  | 'rightParen'
  | 'comma'
  | 'eof';

interface Token {
  kind: TokenKind;
  value?: string | number | boolean | null;
  position: number;
}

export class FormulaParseError extends Error {
  readonly code: FormulaParseErrorCode;
  readonly position: number;

  constructor(code: FormulaParseErrorCode, message: string, position: number) {
    super(message);
    this.name = 'FormulaParseError';
    this.code = code;
    this.position = position;
  }
}

class FormulaTokenizer {
  private position = 0;

  constructor(private readonly expression: string) {}

  next(): Token {
    this.skipWhitespace();
    const position = this.position;

    if (position >= this.expression.length) {
      return { kind: 'eof', position };
    }

    const character = this.expression[position];
    if (this.isDigit(character) || (character === '.' && this.isDigit(this.peek(1)))) {
      return this.readNumber();
    }
    if (character === '"') {
      return this.readString();
    }
    if (character === '{') {
      return this.readField();
    }
    if (this.isIdentifierStart(character)) {
      return this.readIdentifier();
    }

    this.position += 1;
    if (character === '(') return { kind: 'leftParen', position };
    if (character === ')') return { kind: 'rightParen', position };
    if (character === ',') return { kind: 'comma', position };

    const pair = `${character}${this.peek()}`;
    if (pair === '!=' || pair === '>=' || pair === '<=') {
      this.position += 1;
      return { kind: 'operator', value: pair, position };
    }
    if ('+-*/%=><'.includes(character)) {
      return { kind: 'operator', value: character, position };
    }

    throw new FormulaParseError('INVALID_FORMULA', `Unexpected character "${character}"`, position);
  }

  private readNumber(): Token {
    const position = this.position;
    let hasDigits = false;

    while (this.isDigit(this.peek())) {
      hasDigits = true;
      this.position += 1;
    }
    if (this.peek() === '.') {
      this.position += 1;
      while (this.isDigit(this.peek())) {
        hasDigits = true;
        this.position += 1;
      }
    }
    if (!hasDigits) {
      throw new FormulaParseError('INVALID_FORMULA', 'Invalid number', position);
    }
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.position += 1;
      if (this.peek() === '+' || this.peek() === '-') this.position += 1;
      const exponentPosition = this.position;
      while (this.isDigit(this.peek())) this.position += 1;
      if (this.position === exponentPosition) {
        throw new FormulaParseError('INVALID_FORMULA', 'Invalid number exponent', position);
      }
    }

    const text = this.expression.slice(position, this.position);
    const value = Number(text);
    if (!Number.isFinite(value)) {
      throw new FormulaParseError('INVALID_FORMULA', 'Number must be finite', position);
    }
    return { kind: 'number', value, position };
  }

  private readString(): Token {
    const position = this.position;
    this.position += 1;
    let value = '';

    while (this.position < this.expression.length) {
      const character = this.peek();
      this.position += 1;
      if (character === '"') {
        return { kind: 'string', value, position };
      }
      if (character !== '\\') {
        value += character;
        continue;
      }

      const escapePosition = this.position - 1;
      const escaped = this.peek();
      this.position += 1;
      const escapeMap: Readonly<Record<string, string>> = {
        '"': '"',
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
      };
      if (escaped in escapeMap) {
        value += escapeMap[escaped];
        continue;
      }
      if (escaped === 'u') {
        const hex = this.expression.slice(this.position, this.position + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new FormulaParseError('INVALID_FORMULA', 'Invalid Unicode escape', escapePosition);
        }
        value += String.fromCharCode(Number.parseInt(hex, 16));
        this.position += 4;
        continue;
      }
      throw new FormulaParseError('INVALID_FORMULA', 'Invalid string escape', escapePosition);
    }

    throw new FormulaParseError('INVALID_FORMULA', 'Unterminated string', position);
  }

  private readField(): Token {
    const position = this.position;
    const closingPosition = this.expression.indexOf('}', position + 1);
    if (closingPosition === -1) {
      throw new FormulaParseError('INVALID_FORMULA', 'Unterminated field reference', position);
    }
    const key = this.expression.slice(position + 1, closingPosition);
    if (key.length === 0 || key.includes('{')) {
      throw new FormulaParseError('INVALID_FORMULA', 'Invalid field reference', position);
    }
    this.position = closingPosition + 1;
    return { kind: 'field', value: key, position };
  }

  private readIdentifier(): Token {
    const position = this.position;
    this.position += 1;
    while (this.isIdentifierPart(this.peek())) this.position += 1;
    const value = this.expression.slice(position, this.position);

    if (value === 'TRUE') return { kind: 'boolean', value: true, position };
    if (value === 'FALSE') return { kind: 'boolean', value: false, position };
    if (value === 'NULL') return { kind: 'null', value: null, position };
    return { kind: 'identifier', value, position };
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek())) this.position += 1;
  }

  private peek(offset = 0): string {
    return this.expression[this.position + offset] ?? '';
  }

  private isDigit(character: string): boolean {
    return character >= '0' && character <= '9';
  }

  private isIdentifierStart(character: string): boolean {
    return /[A-Za-z_]/.test(character);
  }

  private isIdentifierPart(character: string): boolean {
    return /[A-Za-z0-9_]/.test(character);
  }
}

class FormulaParser {
  private readonly tokenizer: FormulaTokenizer;
  private readonly fieldsByKey: ReadonlyMap<string, FormulaField>;
  private readonly dependencies: string[] = [];
  private readonly dependencySet = new Set<string>();
  private readonly nodeDepth = new WeakMap<object, number>();
  private current: Token;
  private nodeCount = 0;

  constructor(expression: string, fields: readonly FormulaField[]) {
    this.tokenizer = new FormulaTokenizer(expression);
    this.fieldsByKey = new Map(fields.map((field) => [field.key, field]));
    this.current = this.tokenizer.next();
  }

  parse(): ParsedFormula {
    const ast = this.parseExpression();
    if (this.current.kind !== 'eof') {
      throw new FormulaParseError(
        'INVALID_FORMULA',
        'Unexpected trailing token',
        this.current.position,
      );
    }
    return { astVersion: 1, ast, dependencies: [...this.dependencies] };
  }

  private parseExpression(minimumPrecedence = 0, groupingDepth = 0): FormulaAst {
    if (groupingDepth > MAX_DEPTH) {
      throw new FormulaParseError(
        'INVALID_FORMULA',
        `Formula depth exceeds ${MAX_DEPTH}`,
        this.current.position,
      );
    }
    let left = this.parseUnary(groupingDepth);

    while (this.current.kind === 'operator') {
      const operator = this.current.value as string;
      if (!(operator in BINARY_PRECEDENCE)) break;
      const binaryOperator = operator as FormulaBinaryOperator;
      const precedence = BINARY_PRECEDENCE[binaryOperator];
      if (precedence < minimumPrecedence) break;
      const position = this.current.position;
      this.advance();
      const right = this.parseExpression(precedence + 1, groupingDepth);
      left = this.createNode(
        { kind: 'binary', operator: binaryOperator, left, right },
        position,
        Math.max(this.depthOf(left), this.depthOf(right)) + 1,
      );
    }
    return left;
  }

  private parseUnary(groupingDepth: number, unaryDepth = 0): FormulaAst {
    if (unaryDepth >= MAX_DEPTH) {
      throw new FormulaParseError(
        'INVALID_FORMULA',
        `Formula depth exceeds ${MAX_DEPTH}`,
        this.current.position,
      );
    }
    if (
      this.current.kind === 'operator' &&
      (this.current.value === '+' || this.current.value === '-')
    ) {
      const position = this.current.position;
      const operator = this.current.value as FormulaUnaryOperator;
      this.advance();
      const operand = this.parseUnary(groupingDepth, unaryDepth + 1);
      return this.createNode(
        { kind: 'unary', operator, operand },
        position,
        this.depthOf(operand) + 1,
      );
    }
    return this.parsePrimary(groupingDepth);
  }

  private parsePrimary(groupingDepth: number): FormulaAst {
    const token = this.current;
    if (
      token.kind === 'number' ||
      token.kind === 'string' ||
      token.kind === 'boolean' ||
      token.kind === 'null'
    ) {
      this.advance();
      return this.createNode(
        { kind: 'literal', value: token.value as string | number | boolean | null },
        token.position,
        1,
      );
    }
    if (token.kind === 'field') return this.parseField(token);
    if (token.kind === 'identifier') return this.parseCall(token, groupingDepth);
    if (token.kind === 'leftParen') {
      this.advance();
      const expression = this.parseExpression(0, groupingDepth + 1);
      this.expect('rightParen', 'Expected closing parenthesis');
      return expression;
    }

    throw new FormulaParseError('INVALID_FORMULA', 'Expected an expression', token.position);
  }

  private parseField(token: Token): FormulaAst {
    this.advance();
    const key = token.value as string;
    const field = this.fieldsByKey.get(key);
    if (!field) {
      throw new FormulaParseError('UNKNOWN_FIELD', `Unknown field "${key}"`, token.position);
    }
    if (!this.dependencySet.has(field.id)) {
      this.dependencySet.add(field.id);
      this.dependencies.push(field.id);
    }
    return this.createNode({ kind: 'field', fieldId: field.id }, token.position, 1);
  }

  private parseCall(token: Token, groupingDepth: number): FormulaAst {
    const name = token.value as string;
    this.advance();
    if (this.current.kind !== 'leftParen') {
      throw new FormulaParseError(
        'INVALID_FORMULA',
        `Variables are not allowed: "${name}"`,
        token.position,
      );
    }
    if (!FUNCTION_NAMES.has(name as FormulaFunctionName)) {
      throw new FormulaParseError('UNKNOWN_FUNCTION', `Unknown function "${name}"`, token.position);
    }
    this.advance();
    const args: FormulaAst[] = [];
    if (!this.matches('rightParen')) {
      while (true) {
        args.push(this.parseExpression(0, groupingDepth + 1));
        if (!this.matches('comma')) break;
        this.advance();
      }
    }
    this.expect('rightParen', 'Expected closing parenthesis');
    const depth = args.length === 0 ? 1 : Math.max(...args.map((arg) => this.depthOf(arg))) + 1;
    return this.createNode(
      { kind: 'call', name: name as FormulaFunctionName, args },
      token.position,
      depth,
    );
  }

  private createNode<T extends FormulaAst>(node: T, position: number, depth: number): T {
    this.nodeCount += 1;
    if (this.nodeCount > MAX_AST_NODES) {
      throw new FormulaParseError(
        'INVALID_FORMULA',
        `Formula exceeds ${MAX_AST_NODES} AST nodes`,
        position,
      );
    }
    if (depth > MAX_DEPTH) {
      throw new FormulaParseError(
        'INVALID_FORMULA',
        `Formula depth exceeds ${MAX_DEPTH}`,
        position,
      );
    }
    this.nodeDepth.set(node, depth);
    return node;
  }

  private depthOf(node: FormulaAst): number {
    return this.nodeDepth.get(node) ?? 1;
  }

  private expect(kind: TokenKind, message: string): void {
    if (this.current.kind !== kind) {
      throw new FormulaParseError('INVALID_FORMULA', message, this.current.position);
    }
    this.advance();
  }

  private matches(kind: TokenKind): boolean {
    return this.current.kind === kind;
  }

  private advance(): void {
    this.current = this.tokenizer.next();
  }
}

export function parseFormula(expression: string, fields: readonly FormulaField[]): ParsedFormula {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new FormulaParseError(
      'INVALID_FORMULA',
      `Formula exceeds ${MAX_EXPRESSION_LENGTH} characters`,
      MAX_EXPRESSION_LENGTH,
    );
  }
  return new FormulaParser(expression, fields).parse();
}
