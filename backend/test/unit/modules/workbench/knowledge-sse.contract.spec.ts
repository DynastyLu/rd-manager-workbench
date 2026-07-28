import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('KnowledgeController SSE lifecycle contract', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'src/modules/workbench/knowledge/interface/http/knowledge.controller.ts',
    ),
    'utf8',
  );

  it('does not attempt to write response headers twice after streaming has started', () => {
    expect(source).toContain('res.headersSent');
    expect(source).toContain('res.writableEnded');
  });

  it('emits stable retrieval, answer, citation, completion and failure events', () => {
    for (const event of [
      'retrieval_started',
      'retrieval_completed',
      'answer_delta',
      'citation',
      'completed',
      'failed',
    ]) {
      expect(source).toContain(`writeEvent('${event}'`);
    }
  });

  it('persists the assistant answer before notifying the client that it completed', () => {
    expect(source.indexOf("role: 'ASSISTANT'")).toBeLessThan(
      source.indexOf("writeEvent('completed'"),
    );
  });
});
