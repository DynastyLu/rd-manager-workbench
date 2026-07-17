import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';

describe('RequestContextService', () => {
  it('creates a local request context from a trace header only', async () => {
    const service = new RequestContextService();
    const context = service.createContext({
      traceId: 'trace-01',
      requestHeaders: {
        'x-client-version': 'test-client',
      },
    });

    await service.run(context, async () => {
      expect(service.getContext()).toMatchObject({
        traceId: 'trace-01',
        sourceIp: undefined,
        requestHeaders: {
          'x-client-version': 'test-client',
        },
      });
    });
  });
});
