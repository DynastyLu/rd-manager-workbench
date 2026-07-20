const json = jest.fn();
const urlencoded = jest.fn();

jest.mock('express', () => ({ json, urlencoded }));

import { LOCAL_API_BODY_LIMIT, configureBodyParser } from '../../../src/bootstrap/body-parser';

describe('configureBodyParser', () => {
  it('uses a bounded 2mb limit so verified 750 KiB WebDAV payloads fit after base64 encoding', () => {
    const app = { use: jest.fn() };

    configureBodyParser(app as never);

    expect(LOCAL_API_BODY_LIMIT).toBe('2mb');
    expect(json).toHaveBeenCalledWith({ limit: '2mb' });
    expect(urlencoded).toHaveBeenCalledWith({ extended: true, limit: '2mb' });
    expect(app.use).toHaveBeenCalledTimes(2);
  });
});
