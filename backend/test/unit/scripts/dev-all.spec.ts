import fs from 'node:fs';
import path from 'node:path';

describe('dev:all startup command', () => {
  const projectRoot = path.resolve(__dirname, '../../..');

  it('is exposed as a single package script', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(pkg.scripts['dev:all']).toBe('tsx scripts/dev-all.ts');
  });

  it('starts infrastructure before the API and worker processes', () => {
    const script = fs.readFileSync(path.join(projectRoot, 'scripts/dev-all.ts'), 'utf8');

    expect(script).toContain("runStep('docker', ['compose', 'up', '-d'");
    expect(script).toContain("runStep('pnpm', ['run', 'prisma:migrate:deploy']");
    expect(script).toContain("runStep('pnpm', ['run', 'build']");
    expect(script).toContain("spawnService('api', 'node', ['dist/src/main.js']");
    expect(script).toContain(
      "spawnService('ocr-worker', 'node', ['dist/src/workers/ocr-worker.main.js']",
    );
    expect(script).not.toContain("spawnService('api', 'pnpm'");
    expect(script).not.toContain("spawnService('ocr-worker', 'pnpm'");
  });
});
