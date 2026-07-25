import {
  EXPOSED_RESPONSE_HEADERS,
  LOCAL_FRONTEND_ORIGIN,
  configureLocalCors,
} from '../../../src/bootstrap/cors';

describe('configureLocalCors', () => {
  it('exposes download and provenance headers so the cross-origin dev frontend can read them', () => {
    const app = { enableCors: jest.fn() };

    configureLocalCors(app as never);

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: LOCAL_FRONTEND_ORIGIN,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      exposedHeaders: expect.arrayContaining(['Content-Disposition', 'X-Source-Batch-Ids']),
    });
    expect(EXPOSED_RESPONSE_HEADERS).toContain('Content-Disposition');
  });
});
