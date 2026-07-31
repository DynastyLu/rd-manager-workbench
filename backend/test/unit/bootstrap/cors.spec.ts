import { EXPOSED_RESPONSE_HEADERS, configureLocalCors } from '../../../src/bootstrap/cors';

describe('configureLocalCors', () => {
  it('exposes download and provenance headers so the cross-origin dev frontend can read them', () => {
    const app = { enableCors: jest.fn() };

    configureLocalCors(app as never, ['http://127.0.0.1:4312', 'http://localhost:4312']);

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://127.0.0.1:4312', 'http://localhost:4312'],
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      exposedHeaders: expect.arrayContaining(['Content-Disposition', 'X-Source-Batch-Ids']),
    });
    expect(EXPOSED_RESPONSE_HEADERS).toContain('Content-Disposition');
  });
});
