import { firstValueFrom, of } from 'rxjs';
import { AuditInterceptor } from '../../../../src/common/interceptors/audit.interceptor';

describe('AuditInterceptor', () => {
  function context(body: Record<string, unknown>) {
    const request = {
      method: 'PATCH',
      path: '/partners/partner-1',
      baseUrl: '/api',
      route: { path: '/partners/:id' },
      params: { id: 'partner-1' },
      body,
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
  }

  it('records only body field names and never body values', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const interceptor = new AuditInterceptor(
      { record } as never,
      { getContext: () => ({ traceId: 'trace-1' }) } as never,
    );
    await firstValueFrom(
      interceptor.intercept(
        context({ phone: '13800138000', documentBody: 'private text', token: 'secret' }),
        { handle: () => of({ id: 'partner-1' }) },
      ),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'SUCCEEDED',
        changedFields: ['phone', 'documentBody', 'token'],
      }),
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain('13800138000');
    expect(JSON.stringify(record.mock.calls)).not.toContain('private text');
    expect(JSON.stringify(record.mock.calls)).not.toContain('secret');
  });

  it('does not turn an already committed business success into a retryable failure when audit persistence fails', async () => {
    const insertFailure = new Error('immutable audit insert failed');
    const record = jest.fn().mockRejectedValueOnce(insertFailure);
    const interceptor = new AuditInterceptor(
      { record } as never,
      { getContext: () => undefined } as never,
    );
    await expect(
      firstValueFrom(
        interceptor.intercept(context({ title: 'changed' }), { handle: () => of({ ok: true }) }),
      ),
    ).resolves.toEqual({ ok: true });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCEEDED' }));
  });
});
