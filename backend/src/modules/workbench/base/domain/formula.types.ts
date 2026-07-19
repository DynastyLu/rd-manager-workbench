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
  | { kind: 'literal'; value: FormulaLiteralValue }
  | { kind: 'field'; fieldId: string }
  | { kind: 'unary'; operator: FormulaUnaryOperator; operand: FormulaAst }
  | {
      kind: 'binary';
      operator: FormulaBinaryOperator;
      left: FormulaAst;
      right: FormulaAst;
    }
  | { kind: 'call'; name: FormulaFunctionName; args: FormulaAst[] };

export interface FormulaField {
  id: string;
  key: string;
  type: string;
}

export interface ParsedFormula {
  astVersion: 1;
  ast: FormulaAst;
  dependencies: string[];
}

export type FormulaParseErrorCode = 'INVALID_FORMULA' | 'UNKNOWN_FIELD' | 'UNKNOWN_FUNCTION';

export type FormulaEvaluationErrorCode = 'DIV_ZERO' | 'TYPE_ERROR' | 'INVALID_FORMULA';

export interface FormulaEvaluationError {
  code: FormulaEvaluationErrorCode;
  message: string;
}

export interface FormulaEvaluationResult {
  value: unknown;
  error?: FormulaEvaluationError;
}
