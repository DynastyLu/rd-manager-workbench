import { HairstyleTransformService } from '../../../../src/workers/ocr/services/hairstyle-transform.service';

describe('HairstyleTransformService', () => {
  it('returns a demo SVG data URL for a supported style', async () => {
    const service = new HairstyleTransformService();

    const result = await service.transform({
      imageBuffer: Buffer.from('fake-image'),
      mimeType: 'image/png',
      style: 'short-bob',
    });

    expect(result.mode).toBe('demo');
    expect(result.data.style).toBe('short-bob');
    expect(result.data.imageUrl).toContain('data:image/svg+xml;base64,');
  });
});
