export type FormulaLiteralValue = string | number | boolean | null;

export type FormulaFunctionName =
  | 'IF'
  | 'COALESCE'
  | 'ROUND'
  | 'ABS'
  | 'SUM'
  | 'COUNT'
  | 'CONCAT'
  | 'LOWER'
  | 'UPPER'
  | 'LEN'
  | 'DATE_ADD'
  | 'DATE_DIFF';

export type FormulaUnaryOperator = '+' | '-';

export type FormulaBinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<=';

export type FormulaAst =
  | { readonly kind: 'literal'; readonly value: FormulaLiteralValue }
  | { readonly kind: 'field'; readonly fieldId: string }
  | {
      readonly kind: 'unary';
      readonly operator: FormulaUnaryOperator;
      readonly operand: FormulaAst;
    }
  | {
      readonly kind: 'binary';
      readonly operator: FormulaBinaryOperator;
      readonly left: FormulaAst;
      readonly right: FormulaAst;
    }
  | {
      readonly kind: 'call';
      readonly name: FormulaFunctionName;
      readonly args: ReadonlyArray<FormulaAst>;
    };

export interface FormulaField {
  readonly id: string;
  readonly key: string;
  readonly type: string;
}

export interface ParsedFormula {
  readonly astVersion: 1;
  readonly ast: FormulaAst;
  readonly dependencies: ReadonlyArray<string>;
}

export type FormulaParseErrorCode = 'INVALID_FORMULA' | 'UNKNOWN_FIELD' | 'UNKNOWN_FUNCTION';

export type FormulaEvaluationErrorCode = 'DIV_ZERO' | 'TYPE_ERROR' | 'INVALID_FORMULA';

export interface FormulaEvaluationError {
  readonly code: FormulaEvaluationErrorCode;
  readonly message: string;
}

export interface FormulaEvaluationResult {
  readonly value: unknown;
  readonly error?: FormulaEvaluationError;
}
