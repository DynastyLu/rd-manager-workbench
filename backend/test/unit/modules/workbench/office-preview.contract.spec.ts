import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('OfficePreviewService runtime discovery contract', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'src/modules/workbench/knowledge/application/office-preview.service.ts',
    ),
    'utf8',
  );

  it('supports configured, standard macOS, Homebrew, and bundled development runtimes', () => {
    expect(source).toContain('LIBREOFFICE_BIN');
    expect(source).toContain('/Applications/LibreOffice.app/Contents/MacOS/soffice');
    expect(source).toContain('/opt/homebrew/bin/soffice');
    expect(source).toContain('codex-primary-runtime');
  });

  it('uses an isolated LibreOffice profile and Chinese font aliases for legacy formats', () => {
    expect(source).toContain('FONTCONFIG_FILE');
    expect(source).toContain('UserInstallation');
    expect(source).toContain('等线');
    expect(source).toContain('宋体');
    expect(source).toContain('Hiragino Sans GB');
    expect(source).toContain('knowledge/previews/v2/');
  });
});
