import { PasswordService } from '../../../../src/modules/iam/application/password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes and verifies a valid password without retaining plaintext', async () => {
    const password = 'Enterprise123';

    const passwordHash = await service.hash(password);

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).toContain('m=19456,t=2,p=1');
    expect(passwordHash).not.toContain(password);
    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'Enterprise124')).resolves.toBe(false);
  });

  it.each([
    ['short password', 'Short1'],
    ['password without a letter', '1234567890'],
    ['password without a digit', 'EnterpriseOnly'],
  ])('rejects a %s', async (_caseName, password) => {
    expect(() => service.validate(password)).toThrow(
      expect.objectContaining({ code: 'AUTH_PASSWORD_POLICY_VIOLATION' }),
    );
    await expect(service.hash(password)).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_POLICY_VIOLATION',
    });
  });

  it('accepts a password with at least ten characters, a letter and a digit', () => {
    expect(() => service.validate('abcdefghi1')).not.toThrow();
  });
});
