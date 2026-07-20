import { AiAdoptionService } from '../../../../src/modules/workbench/extensions/application/ai-adoption.service';

describe('AiAdoptionService', () => {
  function completedRun(overrides: Record<string, unknown> = {}) {
    return {
      id: 'run-1', operation: 'AI_SUMMARIZE_DOCUMENT', status: 'SUCCEEDED',
      outputSha256: 'unused',
      metadata: { objectIds: ['doc-1'], citationIds: ['document:doc-1'] },
      profile: { kind: 'AI' },
      ...overrides,
    };
  }

  it('does not write when AI output or citations are invalid', async () => {
    const output = { answer: 'bad', citations: ['document:other'] };
    const ai = { validateOutput: jest.fn().mockImplementation(() => { throw new Error('invalid'); }) };
    const documents = { get: jest.fn(), update: jest.fn(), create: jest.fn() };
    const meetings = { update: jest.fn() };
    const outputHash = (await import('../../../../src/modules/workbench/extensions/domain/external-sync')).canonicalHash(output);
    const prisma = { extensionRun: { findUnique: jest.fn().mockResolvedValue(completedRun({ outputSha256: outputHash })) } };
    const service = new AiAdoptionService(ai as any, documents as any, meetings as any, prisma as any);
    await expect(service.adopt({
      runId: 'run-1', operation: 'AI_SUMMARIZE_DOCUMENT', objectId: 'doc-1', citationIds: ['document:doc-1'],
      output,
    })).rejects.toThrow('invalid');
    expect(documents.update).not.toHaveBeenCalled();
    expect(meetings.update).not.toHaveBeenCalled();
  });

  it('only appends a document summary after explicit adoption', async () => {
    const output = { answer: 'Summary', citations: ['document:doc-1'], summary: 'Accepted summary' };
    const ai = { validateOutput: jest.fn().mockReturnValue(output) };
    const documents = {
      get: jest.fn().mockResolvedValue({ id: 'doc-1', plainText: 'Original' }),
      update: jest.fn().mockResolvedValue({ id: 'doc-1', plainText: 'Original\n\nAI 摘要\nAccepted summary' }),
      create: jest.fn(),
    };
    const outputHash = (await import('../../../../src/modules/workbench/extensions/domain/external-sync')).canonicalHash(output);
    const prisma = { extensionRun: { findUnique: jest.fn().mockResolvedValue(completedRun({ outputSha256: outputHash })) } };
    const service = new AiAdoptionService(ai as any, documents as any, { update: jest.fn() } as any, prisma as any);
    await expect(service.adopt({
      runId: 'run-1', operation: 'AI_SUMMARIZE_DOCUMENT', objectId: 'doc-1', citationIds: ['document:doc-1'], output,
    })).resolves.toMatchObject({ id: 'doc-1' });
    expect(documents.update).toHaveBeenCalledWith('doc-1', { plainText: 'Original\n\nAI 摘要\nAccepted summary' });
  });

  it('rejects adoption when the result is not the exact completed run output for this object', async () => {
    const output = { answer: 'forged', citations: ['document:doc-1'] };
    const ai = { validateOutput: jest.fn().mockReturnValue(output) };
    const documents = { get: jest.fn(), update: jest.fn(), create: jest.fn() };
    const prisma = {
      extensionRun: { findUnique: jest.fn().mockResolvedValue(completedRun({ outputSha256: '0'.repeat(64) })) },
    };
    const service = new AiAdoptionService(ai as any, documents as any, { update: jest.fn() } as any, prisma as any);

    await expect(service.adopt({
      runId: 'run-1', operation: 'AI_SUMMARIZE_DOCUMENT', objectId: 'doc-1',
      citationIds: ['document:doc-1'], output,
    })).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
    expect(documents.update).not.toHaveBeenCalled();

    prisma.extensionRun.findUnique.mockResolvedValue(completedRun({
      operation: 'AI_SUMMARIZE_MEETING', outputSha256: '0'.repeat(64),
      metadata: { objectIds: ['meeting-other'], citationIds: ['meeting:meeting-other'] },
    }));
    await expect(service.adopt({
      runId: 'run-1', operation: 'AI_SUMMARIZE_DOCUMENT', objectId: 'doc-1',
      citationIds: ['document:doc-1'], output,
    })).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
  });
});
