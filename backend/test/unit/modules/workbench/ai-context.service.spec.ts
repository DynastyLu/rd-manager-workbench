import { AiContextService } from '../../../../src/modules/workbench/extensions/application/ai-context.service';

describe('AiContextService', () => {
  it('limits meeting/document summary source text to 40,000 characters without attachment bytes', async () => {
    const prisma = {
      contentDocument: { findFirst: jest.fn().mockResolvedValue({
        id: 'doc-1', title: 'Architecture', plainText: 'x'.repeat(45_000), fileAssets: [{ id: 'file-1' }],
      }) },
    } as any;
    const extensions = { prepareRun: jest.fn().mockResolvedValue({ confirmationHash: 'a'.repeat(64) }) };
    const service = new AiContextService(prisma, extensions as any);
    const result = await service.prepare('profile-1', {
      operation: 'AI_SUMMARIZE_DOCUMENT', objectId: 'doc-1',
    });
    const payload = result.payload as { context: string };
    expect(payload.context).toHaveLength(40_000);
    expect(JSON.stringify(result.payload)).not.toContain('file-1');
    expect(result.disclosure).toMatchObject({ characterCount: 40_000, objectIds: ['doc-1'] });
  });

  it('selects at most eight knowledge snippets and 50,000 total characters with stable citations', async () => {
    const prisma = {
      contentDocument: { findMany: jest.fn().mockResolvedValue(
        Array.from({ length: 12 }, (_, index) => ({
          id: `doc-${index}`, title: `Document ${index}`, plainText: String(index).repeat(8_000),
        })),
      ) },
    } as any;
    const extensions = { prepareRun: jest.fn().mockResolvedValue({ confirmationHash: 'b'.repeat(64) }) };
    const service = new AiContextService(prisma, extensions as any);
    const result = await service.prepare('profile-1', {
      operation: 'AI_KNOWLEDGE_QA', question: 'What changed?',
    });
    const payload = result.payload as { snippets: Array<{ citationId: string }> };
    expect(payload.snippets.length).toBeGreaterThan(0);
    expect(payload.snippets.length).toBeLessThanOrEqual(8);
    expect(result.disclosure.characterCount).toBeLessThanOrEqual(50_000);
    expect(payload.snippets[0]).toMatchObject({ citationId: 'document:doc-0' });
  });

  it('rejects model citations that were not in the prepared allowlist', () => {
    const service = new AiContextService({} as any, {} as any);
    expect(() => service.validateOutput(['document:doc-1'], {
      answer: 'Answer', citations: ['document:other'],
    })).toThrow('AI output contains an unknown citation');
    expect(service.validateOutput(['document:doc-1'], {
      answer: 'Answer', citations: ['document:doc-1'], summary: 'Summary', actionItems: [],
    })).toMatchObject({ answer: 'Answer', citations: ['document:doc-1'] });
  });
});
