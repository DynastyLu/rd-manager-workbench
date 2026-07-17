export type OcrProviderErrorCode =
  | 'OCR_CONFIG_MISSING'
  | 'OCR_UNSUPPORTED_FILE'
  | 'OCR_FILE_TOO_LARGE'
  | 'OCR_PROVIDER_AUTH_FAILED'
  | 'OCR_PROVIDER_REJECTED'
  | 'OCR_TABLE_NOT_FOUND';

export class OcrProviderError extends Error {
  constructor(
    public readonly code: OcrProviderErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'OcrProviderError';
  }
}
