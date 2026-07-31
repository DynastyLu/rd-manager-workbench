import { HttpStatus, Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCodes } from '../../../shared/errors/error-codes';

const MINIMUM_PASSWORD_LENGTH = 10;

@Injectable()
export class PasswordService {
  validate(value: string): void {
    if (
      value.length < MINIMUM_PASSWORD_LENGTH ||
      !/\p{L}/u.test(value) ||
      !/\d/.test(value)
    ) {
      throw new AppError({
        code: ErrorCodes.AUTH_PASSWORD_POLICY_VIOLATION,
        message: 'Password must be at least 10 characters and contain a letter and a digit',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
  }

  async hash(value: string): Promise<string> {
    this.validate(value);
    return hash(value, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(passwordHash: string, value: string): Promise<boolean> {
    return verify(passwordHash, value);
  }
}
