import { validateEnv } from '../../../src/infrastructure/config/env.schema';

describe('App config env validation', () => {
  it('accepts the approved NODE_ENV contract', () => {
    expect(
      validateEnv({
        NODE_ENV: 'dev',
        PORT: '3000',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app?schema=platform',
      }).NODE_ENV,
    ).toBe('dev');
  });

  it('allows missing database url in local mock-only mode', () => {
    const env = validateEnv({
      NODE_ENV: 'local',
      PORT: '3000',
    });

    expect(env.DATABASE_URL).toBeUndefined();
  });
});
