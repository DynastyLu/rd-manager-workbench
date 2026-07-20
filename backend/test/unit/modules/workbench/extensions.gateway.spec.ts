import {
  EXTENSIONS_SOCKET_OPTIONS,
  allowLocalExtensionOrigin,
} from '../../../../src/modules/workbench/extensions/extensions.gateway';

describe('ExtensionsGateway transport boundary', () => {
  it('does not expose completion tokens and private payloads to arbitrary browser origins', () => {
    expect(EXTENSIONS_SOCKET_OPTIONS).toMatchObject({
      namespace: '/extensions',
      cors: { origin: allowLocalExtensionOrigin },
      maxHttpBufferSize: 2 * 1024 * 1024,
    });
  });

  it.each([undefined, 'http://127.0.0.1:4312', 'http://localhost:4312'])(
    'allows the Electron no-origin handshake and exact local development origins: %s',
    (origin) => {
      const callback = jest.fn();
      allowLocalExtensionOrigin(origin, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    },
  );

  it('rejects remote browser origins', () => {
    const callback = jest.fn();
    allowLocalExtensionOrigin('https://evil.example', callback);
    expect(callback).toHaveBeenCalledWith(expect.any(Error), false);
  });
});
