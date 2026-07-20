import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { InferredImportType, ParsedSheet } from './import.types';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MAX_COLUMNS = 200;
const MAX_CELL_TEXT = 10_000;

@Injectable()
export class BaseFileParserService {
  async parse(
    content: Buffer,
    fileName: string,
    mimeType: string,
    selectedSheet?: string,
  ): Promise<ParsedSheet> {
    if (!content.length) throw new BadRequestException('Import file is empty');
    if (content.length > MAX_FILE_BYTES) throw new BadRequestException('Import file exceeds 20 MiB');
    const extension = fileName.toLocaleLowerCase().split('.').pop();
    if (extension === 'csv') return this.parseCsv(content, mimeType);
    if (extension === 'xlsx') return this.parseXlsx(content, mimeType, selectedSheet);
    throw new BadRequestException('Only CSV and XLSX files are supported');
  }

  private parseCsv(content: Buffer, mimeType: string): ParsedSheet {
    if (!['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'].includes(mimeType)) {
      throw new BadRequestException('CSV MIME type does not match the file extension');
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(content);
    } catch {
      throw new BadRequestException('CSV must use UTF-8 encoding');
    }
    const matrix = this.csvMatrix(text.replace(/^\uFEFF/, ''));
    return this.fromMatrix(['CSV'], 'CSV', matrix);
  }

  private async parseXlsx(
    content: Buffer,
    mimeType: string,
    selectedSheet?: string,
  ): Promise<ParsedSheet> {
    if (
      mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
      mimeType !== 'application/octet-stream'
    ) {
      throw new BadRequestException('XLSX MIME type does not match the file extension');
    }
    if (content[0] !== 0x50 || content[1] !== 0x4b) {
      throw new BadRequestException('XLSX signature is invalid');
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(content as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } catch {
      throw new BadRequestException('XLSX file cannot be parsed');
    }
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    if (!sheetNames.length) throw new BadRequestException('XLSX does not contain a worksheet');
    const selected = selectedSheet ?? sheetNames[0]!;
    const worksheet = workbook.getWorksheet(selected);
    if (!worksheet) throw new BadRequestException('Selected worksheet does not exist');
    const matrix: unknown[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values: unknown[] = [];
      for (let index = 1; index <= Math.max(row.cellCount, worksheet.columnCount); index += 1) {
        values.push(this.cellValue(row.getCell(index).value));
      }
      matrix.push(values);
    });
    return this.fromMatrix(sheetNames, selected, matrix);
  }

  private cellValue(value: ExcelJS.CellValue): unknown {
    if (value && typeof value === 'object' && 'formula' in value) {
      return value.result ?? null;
    }
    if (value && typeof value === 'object' && 'richText' in value) {
      return value.richText.map((entry) => entry.text).join('');
    }
    if (value && typeof value === 'object' && 'text' in value) return value.text;
    return value;
  }

  private fromMatrix(sheetNames: string[], selectedSheet: string, matrix: unknown[][]): ParsedSheet {
    if (!matrix.length) throw new BadRequestException('Worksheet is empty');
    const columns = matrix[0]!.map((value) => String(value ?? '').trim());
    if (columns.length > MAX_COLUMNS) throw new BadRequestException('Import exceeds 200 columns');
    if (columns.some((column) => !column)) throw new BadRequestException('Column header cannot be empty');
    if (new Set(columns).size !== columns.length) throw new BadRequestException('Column header is duplicate');
    const dataRows = matrix.slice(1).filter((row) => row.some((value) => value !== '' && value != null));
    if (dataRows.length > MAX_ROWS) throw new BadRequestException('Import exceeds 50,000 rows');
    const rows = dataRows.map((row, index) => {
      const values: Record<string, unknown> = {};
      columns.forEach((column, columnIndex) => {
        const value = row[columnIndex] ?? '';
        const rendered = value instanceof Date ? value : String(value ?? '');
        if (typeof rendered === 'string' && rendered.length > MAX_CELL_TEXT) {
          throw new BadRequestException(`Cell at row ${index + 2} exceeds 10,000 characters`);
        }
        values[column] = rendered;
      });
      return { rowNumber: index + 2, values };
    });
    const inferredTypes = Object.fromEntries(
      columns.map((column) => [column, this.infer(rows.map((row) => row.values[column]))]),
    );
    return { sheetNames, selectedSheet, columns, inferredTypes, rows };
  }

  private infer(values: unknown[]): InferredImportType {
    const present = values.filter((value) => value !== '' && value != null);
    if (present.length && present.every((value) => value instanceof Date)) return 'DATETIME';
    if (present.length && present.every((value) => /^[-+]?\d+(\.\d+)?$/.test(String(value)))) {
      return 'NUMBER';
    }
    if (
      present.length &&
      present.every((value) => /^(true|false|是|否|1|0)$/i.test(String(value).trim()))
    ) {
      return 'CHECKBOX';
    }
    return 'TEXT';
  }

  private csvMatrix(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]!;
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else if (character === '"') quoted = false;
        else value += character;
      } else if (character === '"' && value === '') quoted = true;
      else if (character === ',') {
        row.push(value);
        value = '';
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        row.push(value);
        if (row.some((cell) => cell !== '')) rows.push(row);
        row = [];
        value = '';
      } else value += character;
    }
    if (quoted) throw new BadRequestException('CSV contains an unterminated quoted field');
    row.push(value);
    if (row.some((cell) => cell !== '')) rows.push(row);
    return rows;
  }
}
