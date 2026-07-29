import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import unzipper from 'unzipper';
import { EmployeeWorkbookService } from '../../../../src/modules/workbench/employees/application/employee-workbook.service';
import { preflightEmployeeWorkbookZip } from '../../../../src/modules/workbench/employees/application/employee-workbook-zip-preflight';

interface ZipEntryFixture {
  path: string;
  data: Buffer;
  declaredUncompressedSize?: number;
}

interface CentralRecordFixture {
  path: string;
  localIndex: number;
  compressedSize?: number;
  uncompressedSize?: number;
  method?: number;
}

function createZip(entries: ZipEntryFixture[], centralRecords?: CentralRecordFixture[]): Buffer {
  const localParts: Buffer[] = [];
  const locals: Array<{
    offset: number;
    compressedSize: number;
    uncompressedSize: number;
  }> = [];
  let localOffset = 0;

  for (const fixture of entries) {
    const name = Buffer.from(fixture.path, 'utf8');
    const compressed = deflateRawSync(fixture.data);
    const declaredSize = fixture.declaredUncompressedSize ?? fixture.data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(declaredSize, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, compressed);
    locals.push({
      offset: localOffset,
      compressedSize: compressed.length,
      uncompressedSize: declaredSize,
    });
    localOffset += localHeader.length + name.length + compressed.length;
  }

  const records: CentralRecordFixture[] =
    centralRecords ??
    entries.map((entry, localIndex) => ({
      path: entry.path,
      localIndex,
    }));
  const centralParts: Buffer[] = [];
  for (const record of records) {
    const local = locals[record.localIndex];
    const name = Buffer.from(record.path, 'utf8');
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(record.compressedSize ?? local.compressedSize, 20);
    centralHeader.writeUInt32LE(record.uncompressedSize ?? local.uncompressedSize, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(record.method ?? 8, 10);
    centralHeader.writeUInt32LE(local.offset, 42);
    centralParts.push(centralHeader, name);
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
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

  async function expectRejectedBeforeZipOpen(buffer: Buffer): Promise<void> {
    const openBuffer = jest.spyOn(unzipper.Open, 'buffer');
    try {
      await expectRejectedBeforeExcelLoad(buffer);
      expect(openBuffer).not.toHaveBeenCalled();
    } finally {
      openBuffer.mockRestore();
    }
  }

  it('allows the standard binary printer settings part produced by Excel', async () => {
    const buffer = createZip([
      { path: 'xl/workbook.xml', data: Buffer.from('<workbook/>') },
      {
        path: 'xl/printerSettings/printerSettings1.bin',
        data: Buffer.from([0x00, 0x01, 0x02, 0x03]),
      },
    ]);

    await expect(preflightEmployeeWorkbookZip(buffer)).resolves.toBeUndefined();
  });

  it('rejects a forged huge EOCD record count before opening the ZIP directory', async () => {
    const buffer = createZip([{ path: 'xl/workbook.xml', data: Buffer.from('<x/>') }]);
    const eocdOffset = buffer.length - 22;
    buffer.writeUInt16LE(60_000, eocdOffset + 8);
    buffer.writeUInt16LE(60_000, eocdOffset + 10);

    await expectRejectedBeforeZipOpen(buffer);
  });

  it('rejects an EOCD record count smaller than the actual central directory before ZIP open', async () => {
    const buffer = createZip([
      { path: 'xl/workbook.xml', data: Buffer.from('<x/>') },
      { path: 'xl/styles.xml', data: Buffer.from('<x/>') },
    ]);
    const eocdOffset = buffer.length - 22;
    buffer.writeUInt16LE(1, eocdOffset + 8);
    buffer.writeUInt16LE(1, eocdOffset + 10);

    await expectRejectedBeforeZipOpen(buffer);
  });

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

  it('rejects 257 central records pointing to one local entry before ExcelJS load', async () => {
    const records = Array.from({ length: 257 }, (_, index) => ({
      path: `xl/worksheets/central-${index}.xml`,
      localIndex: 0,
    }));
    await expectRejectedBeforeExcelLoad(
      createZip([{ path: 'xl/worksheets/local.xml', data: Buffer.from('<x/>') }], records),
    );
  });

  it.each([
    {
      label: 'central-only macro path',
      record: { path: 'xl/vbaProject.bin', localIndex: 0 },
    },
    {
      label: 'central/local name mismatch',
      record: { path: 'xl/worksheets/other.xml', localIndex: 0 },
    },
    {
      label: 'central/local compressed size mismatch',
      record: { path: 'xl/worksheets/local.xml', localIndex: 0, compressedSize: 1 },
    },
    {
      label: 'central/local uncompressed size mismatch',
      record: { path: 'xl/worksheets/local.xml', localIndex: 0, uncompressedSize: 1 },
    },
    {
      label: 'central/local method mismatch',
      record: { path: 'xl/worksheets/local.xml', localIndex: 0, method: 0 },
    },
  ])('rejects $label before ExcelJS load', async ({ record }) => {
    await expectRejectedBeforeExcelLoad(
      createZip([{ path: 'xl/worksheets/local.xml', data: Buffer.from('<payload/>') }], [record]),
    );
  });

  it('rejects multiple central records sharing one local offset before ExcelJS load', async () => {
    await expectRejectedBeforeExcelLoad(
      createZip(
        [{ path: 'xl/worksheets/local.xml', data: Buffer.from('<x/>') }],
        [
          { path: 'xl/worksheets/local.xml', localIndex: 0 },
          { path: 'xl/worksheets/second.xml', localIndex: 0 },
        ],
      ),
    );
  });
});
