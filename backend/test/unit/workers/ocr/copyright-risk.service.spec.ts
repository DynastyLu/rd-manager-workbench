import { CopyrightRiskService } from '../../../../src/workers/ocr/services/copyright-risk.service';
import { AppLoggerService } from '../../../../src/infrastructure/logger/app-logger.service';

describe('CopyrightRiskService', () => {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalCopyrightRiskProvider = process.env.COPYRIGHT_RISK_PROVIDER;
  const originalCopyrightAiBaseUrl = process.env.COPYRIGHT_AI_BASE_URL;
  const originalCopyrightAiApiKey = process.env.COPYRIGHT_AI_API_KEY;
  const originalCopyrightAiModel = process.env.COPYRIGHT_AI_MODEL;
  const originalCopyrightAiTimeoutMs = process.env.COPYRIGHT_AI_TIMEOUT_MS;
  const originalCopyrightAiMaxTokens = process.env.COPYRIGHT_AI_MAX_TOKENS;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.COPYRIGHT_RISK_PROVIDER;
    delete process.env.COPYRIGHT_AI_BASE_URL;
    delete process.env.COPYRIGHT_AI_API_KEY;
    delete process.env.COPYRIGHT_AI_MODEL;
    delete process.env.COPYRIGHT_AI_TIMEOUT_MS;
    delete process.env.COPYRIGHT_AI_MAX_TOKENS;
    global.fetch = originalFetch;
  });

  afterEach(() => {
    if (originalAnthropicKey) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalCopyrightRiskProvider) {
      process.env.COPYRIGHT_RISK_PROVIDER = originalCopyrightRiskProvider;
    } else {
      delete process.env.COPYRIGHT_RISK_PROVIDER;
    }
    if (originalCopyrightAiBaseUrl) {
      process.env.COPYRIGHT_AI_BASE_URL = originalCopyrightAiBaseUrl;
    } else {
      delete process.env.COPYRIGHT_AI_BASE_URL;
    }
    if (originalCopyrightAiApiKey) {
      process.env.COPYRIGHT_AI_API_KEY = originalCopyrightAiApiKey;
    } else {
      delete process.env.COPYRIGHT_AI_API_KEY;
    }
    if (originalCopyrightAiModel) {
      process.env.COPYRIGHT_AI_MODEL = originalCopyrightAiModel;
    } else {
      delete process.env.COPYRIGHT_AI_MODEL;
    }
    if (originalCopyrightAiTimeoutMs) {
      process.env.COPYRIGHT_AI_TIMEOUT_MS = originalCopyrightAiTimeoutMs;
    } else {
      delete process.env.COPYRIGHT_AI_TIMEOUT_MS;
    }
    if (originalCopyrightAiMaxTokens) {
      process.env.COPYRIGHT_AI_MAX_TOKENS = originalCopyrightAiMaxTokens;
    } else {
      delete process.env.COPYRIGHT_AI_MAX_TOKENS;
    }
    global.fetch = originalFetch;
  });

  it('flags obvious brand and character assets with visible regions', async () => {
    const service = new CopyrightRiskService();

    const result = await service.analyze({
      imageBuffer: pngBuffer(900, 600),
      mimeType: 'image/png',
      originalName: 'nike-disney-cartoon-poster.png',
    });

    expect(result.mode).toBe('heuristic');
    expect(result.riskScore).toBeGreaterThanOrEqual(80);
    expect(['high', 'critical']).toContain(result.riskLevel);
    expect(result.image).toMatchObject({ width: 900, height: 600, mimeType: 'image/png' });
    expect(result.regions.length).toBeGreaterThanOrEqual(2);
    expect(result.regions.map((region) => region.riskType)).toEqual(
      expect.arrayContaining(['trademark', 'character']),
    );
    expect(result.disclaimer).toContain('不构成法律意见');
  });

  it('still returns a low-risk review area for generic images', async () => {
    const service = new CopyrightRiskService();

    const result = await service.analyze({
      imageBuffer: pngBuffer(640, 480),
      mimeType: 'image/png',
      originalName: 'product-photo.png',
    });

    expect(result.riskLevel).toBe('low');
    expect(result.riskScore).toBeLessThan(35);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]).toMatchObject({
      riskType: 'unclear-source',
      severity: 'low',
    });
  });

  it('uses local analysis by default even when an Anthropic key exists', async () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key-without-required-opt-in';
    const service = new CopyrightRiskService();

    const result = await service.analyze({
      imageBuffer: pngBuffer(640, 480),
      mimeType: 'image/png',
      originalName: 'product-photo.png',
    });

    expect(result.mode).toBe('heuristic');
    expect(result.riskLevel).toBe('low');
  });

  it('uses an Anthropic-compatible visual provider when explicitly configured', async () => {
    process.env.COPYRIGHT_RISK_PROVIDER = 'anthropic-compatible';
    process.env.COPYRIGHT_AI_BASE_URL = 'https://dashscope.aliyuncs.com/apps/anthropic';
    process.env.COPYRIGHT_AI_API_KEY = 'dashscope-key';
    process.env.COPYRIGHT_AI_MODEL = 'qwen3-vl-plus';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              riskScore: 88,
              riskLevel: 'high',
              summary: '整张图片包含疑似品牌 Logo 和公众人物肖像，需要复核授权。',
              imageDescription: '一张包含运动员、球衣和品牌标识的宣传图。',
              regions: [
                {
                  id: 'r1',
                  x: 12,
                  y: 18,
                  width: 20,
                  height: 12,
                  label: '疑似品牌 Logo',
                  riskType: 'trademark',
                  severity: 'high',
                  confidence: 0.91,
                  reason: '画面中出现疑似商业品牌标识。',
                  suggestion: '确认商标授权或移除该标识。',
                },
              ],
              recommendations: ['商用前请核验 Logo 和肖像授权。'],
            }),
          },
        ],
      }),
    } as Partial<Response> as Response);
    const service = new CopyrightRiskService();

    const result = await service.analyze({
      imageBuffer: pngBuffer(640, 480),
      mimeType: 'image/png',
      originalName: 'sports-campaign.png',
    });

    expect(result).toMatchObject({
      mode: 'ai',
      riskScore: 88,
      riskLevel: 'high',
      summary: '整张图片包含疑似品牌 Logo 和公众人物肖像，需要复核授权。',
      imageDescription: '一张包含运动员、球衣和品牌标识的宣传图。',
    });
    expect(result.regions[0]).toMatchObject({
      riskType: 'trademark',
      label: '疑似品牌 Logo',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/apps/anthropic/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-api-key': 'dashscope-key',
        }),
        body: expect.stringContaining('"max_tokens":6000'),
      }),
    );
  });

  it('logs the AI provider failure before falling back to local analysis', async () => {
    process.env.COPYRIGHT_RISK_PROVIDER = 'anthropic-compatible';
    process.env.COPYRIGHT_AI_BASE_URL = 'https://dashscope.aliyuncs.com/apps/anthropic';
    process.env.COPYRIGHT_AI_API_KEY = 'dashscope-key';
    process.env.COPYRIGHT_AI_MODEL = 'qwen3-vl-plus';
    const logger = {
      warn: jest.fn(),
    } as unknown as AppLoggerService;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"code":"InvalidParameter","message":"bad image"}',
    } as Partial<Response> as Response);
    const service = new CopyrightRiskService(logger);

    const result = await service.analyze({
      imageBuffer: pngBuffer(640, 480),
      mimeType: 'image/png',
      originalName: 'product-photo.png',
    });

    expect(result.mode).toBe('heuristic');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('copyright_ai_provider_failed'));
    expect(logger.warn).toHaveBeenCalledWith(expect.not.stringContaining('dashscope-key'));
  });

  it('rejects unsupported image formats', async () => {
    const service = new CopyrightRiskService();

    await expect(
      service.analyze({
        imageBuffer: Buffer.from('not-image'),
        mimeType: 'application/pdf',
        originalName: 'contract.pdf',
      }),
    ).rejects.toThrow('仅支持 JPG、PNG、WEBP 图片');
  });
});

function pngBuffer(width: number, height: number) {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}
