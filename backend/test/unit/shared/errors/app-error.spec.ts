import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../../../src/shared/errors/app-error';
import { ErrorCodes } from '../../../../src/shared/errors/error-codes';

describe('AppError', () => {
  it('retains error metadata', () => {
    const error = new AppError({
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Invalid payload',
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { field: 'email' },
    });

    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(error.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(error.details).toEqual({ field: 'email' });
    expect(error.toJSON()).toMatchObject({
      code: ErrorCodes.VALIDATION_ERROR,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  });
});
