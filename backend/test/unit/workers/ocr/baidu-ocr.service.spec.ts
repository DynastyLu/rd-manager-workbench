import { BaiduOcrService } from '../../../../src/workers/ocr/services/baidu-ocr.service';
import { OcrProviderError } from '../../../../src/workers/ocr/services/ocr-provider.error';

describe('BaiduOcrService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('fails clearly when Baidu credentials are not configured', async () => {
    delete process.env.BAIDU_API_KEY;
    delete process.env.BAIDU_SECRET_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const service = new BaiduOcrService();

    await expect(service.recognizeTable(Buffer.from('fake'), 'image/png')).rejects.toMatchObject({
      code: 'OCR_CONFIG_MISSING',
    });
  });

  it('uses Claude OCR when Baidu credentials are missing but Anthropic is configured', async () => {
    delete process.env.BAIDU_API_KEY;
    delete process.env.BAIDU_SECRET_KEY;
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    global.fetch = jest.fn() as never;
    const service = new BaiduOcrService();
    const claudeSpy = jest
      .spyOn(
        service as unknown as {
          recognizeWithClaude: (imageBuffer: Buffer, mimeType: string) => Promise<unknown>;
        },
        'recognizeWithClaude',
      )
      .mockResolvedValue({
        rows: [
          ['姓名', '分数'],
          ['小明', '98'],
        ],
        cell_confidence: [
          [0.85, 0.85],
          [0.85, 0.85],
        ],
        merged_cells: [],
        confidence: 'medium',
      });

    const result = await service.recognizeTable(Buffer.from('fake'), 'image/png');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(claudeSpy).toHaveBeenCalledWith(Buffer.from('fake'), 'image/png');
    expect(result).toMatchObject({
      rows: [
        ['姓名', '分数'],
        ['小明', '98'],
      ],
      merged_cells: [],
      confidence: 'medium',
    });
  });

  it('maps Claude OCR availability failures to a stable provider error', async () => {
    delete process.env.BAIDU_API_KEY;
    delete process.env.BAIDU_SECRET_KEY;
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    const service = new BaiduOcrService();
    jest
      .spyOn(
        service as unknown as {
          recognizeWithClaude: (imageBuffer: Buffer, mimeType: string) => Promise<unknown>;
        },
        'recognizeWithClaude',
      )
      .mockRejectedValue(new Error('502 Bad Gateway'));

    await expect(service.recognizeTable(Buffer.from('fake'), 'image/png')).rejects.toMatchObject({
      code: 'OCR_PROVIDER_REJECTED',
      message: 'OCR 服务暂时不可用，请稍后重试',
    });
  });

  it('rejects unsupported mime types with a stable code', async () => {
    process.env.BAIDU_API_KEY = 'api-key';
    process.env.BAIDU_SECRET_KEY = 'secret-key';
    process.env.OCR_ALLOWED_MIME_TYPES = 'image/png,image/jpeg';

    const service = new BaiduOcrService();

    await expect(
      service.recognizeTable(Buffer.from('fake'), 'application/pdf'),
    ).rejects.toMatchObject({
      code: 'OCR_UNSUPPORTED_FILE',
    });
  });

  it('rejects oversized images with a stable code', async () => {
    process.env.BAIDU_API_KEY = 'api-key';
    process.env.BAIDU_SECRET_KEY = 'secret-key';
    process.env.OCR_MAX_IMAGE_BYTES = '2';

    const service = new BaiduOcrService();

    await expect(service.recognizeTable(Buffer.from('fake'), 'image/png')).rejects.toMatchObject({
      code: 'OCR_FILE_TOO_LARGE',
    });
  });

  it('maps Baidu token failures to provider auth errors', async () => {
    process.env.BAIDU_API_KEY = 'api-key';
    process.env.BAIDU_SECRET_KEY = 'secret-key';
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        error: 'invalid_client',
        error_description: 'bad credentials',
      }),
    }) as never;
    const service = new BaiduOcrService();

    await expect(service.recognizeTable(Buffer.from('fake'), 'image/png')).rejects.toBeInstanceOf(
      OcrProviderError,
    );
    await expect(service.recognizeTable(Buffer.from('fake'), 'image/png')).rejects.toMatchObject({
      code: 'OCR_PROVIDER_AUTH_FAILED',
    });
  });

  it('falls back to handwriting OCR when table OCR does not detect a table', async () => {
    process.env.BAIDU_API_KEY = 'api-key';
    process.env.BAIDU_SECRET_KEY = 'secret-key';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: 'token', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ table_num: 0, tables_result: [] }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          direction: 0,
          words_result: [
            { words: '姓名', location: { left: 10, top: 10, width: 20, height: 10 } },
            { words: '分数', location: { left: 100, top: 10, width: 20, height: 10 } },
            { words: '小明', location: { left: 10, top: 40, width: 20, height: 10 } },
            { words: '98', location: { left: 100, top: 40, width: 20, height: 10 } },
          ],
        }),
      }) as never;
    const service = new BaiduOcrService();

    const result = await service.recognizeTable(Buffer.from('fake'), 'image/png');

    expect(result).toMatchObject({
      rows: [
        ['姓名', '分数'],
        ['小明', '98'],
      ],
      merged_cells: [],
      confidence: 'medium',
    });
  });

  it('falls back to general OCR when handwriting OCR has no usable rows', async () => {
    process.env.BAIDU_API_KEY = 'api-key';
    process.env.BAIDU_SECRET_KEY = 'secret-key';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: 'token', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ table_num: 0, tables_result: [] }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ direction: 0, words_result: [] }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          direction: 0,
          words_result: [
            { words: '科目', location: { left: 10, top: 10, width: 20, height: 10 } },
            { words: '成绩', location: { left: 100, top: 10, width: 20, height: 10 } },
          ],
        }),
      }) as never;
    const service = new BaiduOcrService();

    const result = await service.recognizeTable(Buffer.from('fake'), 'image/png');

    expect(result).toMatchObject({
      rows: [['科目', '成绩']],
      merged_cells: [],
      confidence: 'medium',
    });
  });
});
