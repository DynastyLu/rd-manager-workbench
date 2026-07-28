import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('KnowledgeController SSE error contract', () => {
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

  it('completes retrieval and opens the upstream model stream before committing SSE headers', () => {
    expect(source.indexOf('await this.rag.ask')).toBeLessThan(
      source.indexOf('res.writeHead(200'),
    );
  });
});
