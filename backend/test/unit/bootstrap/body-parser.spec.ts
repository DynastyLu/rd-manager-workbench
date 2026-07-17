const json = jest.fn();
const urlencoded = jest.fn();

jest.mock('express', () => ({ json, urlencoded }));

import { LOCAL_API_BODY_LIMIT, configureBodyParser } from '../../../src/bootstrap/body-parser';

describe('configureBodyParser', () => {
  it('uses a generic 1mb limit for local API JSON and form bodies', () => {
    const app = { use: jest.fn() };

    configureBodyParser(app as never);

    expect(LOCAL_API_BODY_LIMIT).toBe('1mb');
    expect(json).toHaveBeenCalledWith({ limit: '1mb' });
    expect(urlencoded).toHaveBeenCalledWith({ extended: true, limit: '1mb' });
    expect(app.use).toHaveBeenCalledTimes(2);
  });
});
