import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { EmployeeWorkbookService } from '../../../../src/modules/workbench/employees/application/employee-workbook.service';

interface ZipEntryFixture {
  path: string;
  data: Buffer;
  declaredUncompressedSize?: number;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries: ZipEntryFixture[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const fixture of entries) {
    const name = Buffer.from(fixture.path, 'utf8');
    const compressed = deflateRawSync(fixture.data);
    const checksum = crc32(fixture.data);
    const declaredSize = fixture.declaredUncompressedSize ?? fixture.data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(declaredSize, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(declaredSize, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

describe('EmployeeWorkbookService ZIP preflight', () => {
  const service = new EmployeeWorkbookService();

  jest.setTimeout(60_000);

  async function expectRejectedBeforeExcelLoad(buffer: Buffer): Promise<void> {
    const xlsxGetter = jest.spyOn(ExcelJS.Workbook.prototype, 'xlsx', 'get');
    try {
      await expect(service.parse(buffer)).rejects.toMatchObject({
        code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
        statusCode: 422,
      });
      expect(xlsxGetter).not.toHaveBeenCalled();
    } finally {
      xlsxGetter.mockRestore();
    }
  }

  it('rejects a highly compressed 32 MiB XML payload before ExcelJS load', async () => {
    const payload = Buffer.alloc(32 * 1024 * 1024, 0x61);
    const buffer = createZip([{ path: 'xl/worksheets/payload.xml', data: payload }]);
    expect(buffer.length).toBeLessThan(64 * 1024);

    await expectRejectedBeforeExcelLoad(buffer);
  });

  it('counts actual inflated bytes instead of trusting a forged declared size', async () => {
    const payload = Buffer.alloc(49 * 1024 * 1024, 0x62);
    const buffer = createZip([
      {
        path: 'xl/worksheets/forged.xml',
        data: payload,
        declaredUncompressedSize: 1,
      },
    ]);

    await expectRejectedBeforeExcelLoad(buffer);
  });

  it('rejects more than 256 ZIP entries before ExcelJS load', async () => {
    const entries = Array.from({ length: 257 }, (_, index) => ({
      path: `xl/worksheets/entry-${index}.xml`,
      data: Buffer.from('<x/>'),
    }));

    await expectRejectedBeforeExcelLoad(createZip(entries));
  });

  it.each([
    ['zip-slip path', 'xl/../evil.xml'],
    ['absolute path', '/xl/workbook.xml'],
    ['backslash path', 'xl\\workbook.xml'],
    ['NUL path', 'xl/workbook.xml\u0000evil'],
    ['macro payload', 'xl/vbaProject.bin'],
    ['unrelated top-level payload', 'payload.txt'],
  ])('rejects a %s before ExcelJS load', async (_label, path) => {
    await expectRejectedBeforeExcelLoad(createZip([{ path, data: Buffer.from('payload') }]));
  });

  it('rejects duplicate package paths before ExcelJS load', async () => {
    await expectRejectedBeforeExcelLoad(
      createZip([
        { path: 'xl/workbook.xml', data: Buffer.from('<a/>') },
        { path: 'xl/workbook.xml', data: Buffer.from('<b/>') },
      ]),
    );
  });
});
