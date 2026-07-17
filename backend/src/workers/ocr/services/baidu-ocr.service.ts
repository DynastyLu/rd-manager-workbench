import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OcrProviderError } from './ocr-provider.error';

interface BaiduLocation {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BaiduWordResult {
  words: string;
  location?: BaiduLocation;
}

interface BaiduTableCell {
  row_start: number;
  row_end: number;
  col_start: number;
  col_end: number;
  words?: string;
}

interface BaiduTableResult {
  header?: BaiduTableCell[];
  body?: BaiduTableCell[];
}

interface BaiduTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface BaiduOcrResponse {
  error_code?: number;
  error_msg?: string;
  table_num?: number;
  tables_result?: BaiduTableResult[];
  words_result?: BaiduWordResult[];
  words_result_num?: number;
  direction?: number;
}

@Injectable()
export class BaiduOcrService {
  private tokenCache: string | null = null;
  private tokenExpiry = 0;

  async recognizeTable(imageBuffer: Buffer, mimeType: string) {
    this.validateInput(imageBuffer, mimeType);
    if (!this.hasBaiduCredentials()) {
      if (this.hasAnthropicCredentials()) {
        return this.recognizeWithClaudeProvider(imageBuffer, mimeType);
      }
      throw new OcrProviderError(
        'OCR_CONFIG_MISSING',
        '未配置 OCR 密钥，请在 .env 中填写 BAIDU_API_KEY 和 BAIDU_SECRET_KEY，或填写 ANTHROPIC_API_KEY',
      );
    }

    const base64 = await this.compressIfNeeded(imageBuffer);
    const token = await this.getAccessToken();

    const tableData = await this.callBaiduOcr(this.getTableEndpoint(), token, {
      image: base64,
    });
    if (tableData.error_code) {
      throw new OcrProviderError(
        'OCR_PROVIDER_REJECTED',
        `识别失败：${tableData.error_msg}（错误码 ${tableData.error_code}）`,
        tableData,
      );
    }
    if (tableData.tables_result && tableData.table_num && tableData.table_num > 0) {
      return this.parseTablesResult(tableData.tables_result);
    }

    const handwritingData = await this.callBaiduOcr(this.getHandwritingEndpoint(), token, {
      image: base64,
      detect_direction: 'true',
    });
    const handwritingRows = this.rowsFromWordResult(handwritingData, 0.8);
    if (handwritingRows) {
      return handwritingRows;
    }

    const detectedDirection = handwritingData.direction ?? 0;
    let rotatedBase64: string | null = null;
    if (detectedDirection !== 0 && process.platform === 'darwin') {
      rotatedBase64 = await this.rotateBuffer(imageBuffer, detectedDirection);
      if (rotatedBase64) {
        const retryTableData = await this.callBaiduOcr(this.getTableEndpoint(), token, {
          image: rotatedBase64,
        });
        if (
          !retryTableData.error_code &&
          retryTableData.tables_result &&
          retryTableData.table_num &&
          retryTableData.table_num > 0
        ) {
          return this.parseTablesResult(retryTableData.tables_result);
        }

        const retryHandwritingData = await this.callBaiduOcr(this.getHandwritingEndpoint(), token, {
          image: rotatedBase64,
          detect_direction: 'true',
        });
        const retryRows = this.rowsFromWordResult(retryHandwritingData, 0.8);
        if (retryRows) {
          return retryRows;
        }
      }
    }

    const generalData = await this.callBaiduOcr(this.getGeneralEndpoint(), token, {
      image: rotatedBase64 ?? base64,
      detect_direction: 'true',
    });
    const generalRows = this.rowsFromWordResult(
      {
        ...generalData,
        direction: rotatedBase64 ? 0 : (generalData.direction ?? detectedDirection),
      },
      0.85,
    );
    if (generalRows) {
      return generalRows;
    }

    if (this.hasAnthropicCredentials()) {
      try {
        return await this.recognizeWithClaudeProvider(imageBuffer, mimeType);
      } catch {
        // Keep the public error stable; detailed Anthropic failures are not useful to callers.
      }
    }

    throw new OcrProviderError(
      'OCR_TABLE_NOT_FOUND',
      '未检测到表格内容，请确认图片清晰且包含表格，或尝试旋转图片后重新上传',
    );
  }

  private validateInput(imageBuffer: Buffer, mimeType: string) {
    const allowedMimeTypes = this.getAllowedMimeTypes();
    if (!allowedMimeTypes.includes(mimeType)) {
      throw new OcrProviderError(
        'OCR_UNSUPPORTED_FILE',
        `不支持的文件类型：${mimeType}，请上传 ${allowedMimeTypes.join('、')}`,
      );
    }
    if (imageBuffer.length > this.getMaxImageBytes()) {
      throw new OcrProviderError(
        'OCR_FILE_TOO_LARGE',
        `图片过大，请上传不超过 ${this.getMaxImageBytes()} 字节的图片`,
      );
    }
  }

  private hasBaiduCredentials() {
    return Boolean(process.env.BAIDU_API_KEY?.trim() && process.env.BAIDU_SECRET_KEY?.trim());
  }

  private hasAnthropicCredentials() {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }

  private async recognizeWithClaudeProvider(imageBuffer: Buffer, mimeType: string) {
    try {
      return await this.recognizeWithClaude(imageBuffer, mimeType);
    } catch (error) {
      if (error instanceof OcrProviderError) {
        throw error;
      }
      throw new OcrProviderError(
        'OCR_PROVIDER_REJECTED',
        'OCR 服务暂时不可用，请稍后重试',
        {
          provider: 'anthropic',
          reason: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  private async getAccessToken() {
    if (this.tokenCache && Date.now() < this.tokenExpiry) {
      return this.tokenCache;
    }

    const response = await fetch(
      `${this.getTokenEndpoint()}?grant_type=client_credentials&client_id=${process.env.BAIDU_API_KEY}&client_secret=${process.env.BAIDU_SECRET_KEY}`,
    );
    const data = (await response.json()) as BaiduTokenResponse;
    if (data.error || !data.access_token) {
      throw new OcrProviderError(
        'OCR_PROVIDER_AUTH_FAILED',
        `获取百度 token 失败：${data.error_description || data.error || 'unknown'}`,
        data,
      );
    }

    this.tokenCache = data.access_token;
    this.tokenExpiry = Date.now() + ((data.expires_in || 0) - 60) * 1000;
    return this.tokenCache;
  }

  private async callBaiduOcr(endpoint: string, token: string, payload: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      params.append(key, value);
    }

    const response = await fetch(`${endpoint}?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    return (await response.json()) as BaiduOcrResponse;
  }

  private rowsFromWordResult(data: BaiduOcrResponse, confidenceValue: number) {
    if (data.error_code || !data.words_result?.length) {
      return null;
    }

    const rows = this.reconstructRowsFromLocations(data.words_result, data.direction ?? 0);
    if (!rows?.length) {
      return null;
    }

    return {
      rows,
      cell_confidence: rows.map((row) => row.map(() => confidenceValue)),
      merged_cells: [],
      confidence: 'medium',
    };
  }

  private async compressIfNeeded(buffer: Buffer) {
    const limit = 3 * 1024 * 1024;
    if (buffer.length <= limit || process.platform !== 'darwin') {
      return buffer.toString('base64');
    }

    const tmp = path.join(os.tmpdir(), `ocr_${Date.now()}.jpg`);
    try {
      fs.writeFileSync(tmp, buffer);
      execSync(`sips -Z 2500 "${tmp}" --out "${tmp}" 2>/dev/null`);
      return fs.readFileSync(tmp).toString('base64');
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  private async rotateBuffer(buffer: Buffer, direction: number) {
    const degMap: Record<number, number> = { 1: 90, 2: 180, 3: 270 };
    const deg = degMap[direction];
    if (!deg) {
      return null;
    }

    const tmp = path.join(os.tmpdir(), `ocr_rot_${Date.now()}.jpg`);
    try {
      fs.writeFileSync(tmp, buffer);
      execSync(`sips -r ${deg} "${tmp}" 2>/dev/null`);
      const rotated = fs.readFileSync(tmp);
      return this.compressIfNeeded(rotated);
    } catch {
      return null;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  private reconstructRowsFromLocations(wordResults: BaiduWordResult[], direction: number) {
    const words = wordResults.filter((word) => word.location);
    if (words.length === 0) {
      return null;
    }

    const rotated = direction === 3 || direction === 1;
    const rowKey = rotated ? 'left' : 'top';
    const colKey = rotated ? 'top' : 'left';
    const heightKey = rotated ? 'width' : 'height';
    const rowDesc = rotated && direction === 3;

    const medianHeight = [...words]
      .map((word) => word.location![heightKey])
      .sort((a, b) => a - b)[Math.floor(words.length / 2)];

    const sortedByRow = [...words].sort((a, b) => a.location![rowKey] - b.location![rowKey]);
    let tableStartPos = sortedByRow[0].location![rowKey];
    let tableEndPos =
      sortedByRow[sortedByRow.length - 1].location![rowKey] +
      sortedByRow[sortedByRow.length - 1].location![heightKey];

    for (let i = 0; i < Math.min(sortedByRow.length - 1, 10); i += 1) {
      const bottom = sortedByRow[i].location![rowKey] + sortedByRow[i].location![heightKey];
      const gap = sortedByRow[i + 1].location![rowKey] - bottom;
      if (gap > medianHeight * 3) {
        tableStartPos = sortedByRow[i + 1].location![rowKey];
        break;
      }
    }
    for (let i = sortedByRow.length - 1; i > Math.max(sortedByRow.length - 11, 0); i -= 1) {
      const bottom = sortedByRow[i - 1].location![rowKey] + sortedByRow[i - 1].location![heightKey];
      const gap = sortedByRow[i].location![rowKey] - bottom;
      if (gap > medianHeight * 3) {
        tableEndPos = sortedByRow[i - 1].location![rowKey] + sortedByRow[i - 1].location![heightKey];
        break;
      }
    }

    const tableWords = words.filter(
      (word) => word.location![rowKey] >= tableStartPos && word.location![rowKey] <= tableEndPos,
    );
    if (tableWords.length === 0) {
      return null;
    }

    const colValues = tableWords.map((word) => word.location![colKey]).sort((a, b) => a - b);
    const colRange = colValues[colValues.length - 1] - colValues[0] || 1;
    const leftBound = colValues[0] + colRange * 0.12;
    const anchors = tableWords.filter((word) => word.location![colKey] <= leftBound);
    const useWords = anchors.length >= 5 ? anchors : tableWords;

    const anchorPositions = useWords.map((word) => word.location![rowKey]).sort((a, b) => a - b);
    const rowCenters = [anchorPositions[0]];
    for (let i = 1; i < anchorPositions.length; i += 1) {
      if (anchorPositions[i] - rowCenters[rowCenters.length - 1] > medianHeight * 0.55) {
        rowCenters.push(anchorPositions[i]);
      }
    }
    if (rowCenters.length === 0) {
      return null;
    }

    const rowGroups = Array.from({ length: rowCenters.length }, () => [] as BaiduWordResult[]);
    for (const word of tableWords) {
      const pos = word.location![rowKey];
      let best = 0;
      let bestDist = Math.abs(pos - rowCenters[0]);
      for (let i = 1; i < rowCenters.length; i += 1) {
        const distance = Math.abs(pos - rowCenters[i]);
        if (distance < bestDist) {
          bestDist = distance;
          best = i;
        }
      }
      rowGroups[best].push(word);
    }

    const ordered = rowDesc ? [...rowGroups].reverse() : rowGroups;
    const sortedRows = ordered
      .filter((group) => group.length > 0)
      .map((group) => [...group].sort((a, b) => a.location![colKey] - b.location![colKey]));

    const rowResults = sortedRows.map((group) => {
      const positions = group.map((word) => word.location![colKey]);
      if (group.length < 3) {
        return { cells: group.map((word) => word.words), positions };
      }

      const gaps = group.slice(1).map((word, index) => word.location![colKey] - group[index].location![colKey]);
      const sortedGaps = [...gaps].sort((a, b) => a - b);
      const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
      const low = Math.floor(sortedGaps.length * 0.1);
      const high = Math.ceil(sortedGaps.length * 0.9);
      const trimmed = sortedGaps.slice(low, high);

      let threshold = medianGap * 0.5;
      if (trimmed.length >= 2) {
        let maxJump = 0;
        let splitAt = -1;
        for (let j = 0; j < trimmed.length - 1; j += 1) {
          const jump = trimmed[j + 1] - trimmed[j];
          if (jump > maxJump) {
            maxJump = jump;
            splitAt = j;
          }
        }
        if (splitAt >= 0 && maxJump > medianGap * 0.15) {
          threshold = (trimmed[splitAt] + trimmed[splitAt + 1]) / 2;
        }
      }
      threshold = Math.min(threshold, medianHeight * 2.5);

      const cells: string[] = [];
      const cellPositions: number[] = [];
      let i = 0;
      while (i < group.length) {
        let merged = group[i].words;
        cellPositions.push(group[i].location![colKey]);
        while (i < group.length - 1 && gaps[i] < threshold) {
          merged += group[i + 1].words;
          i += 1;
        }
        cells.push(merged);
        i += 1;
      }
      return { cells, positions: cellPositions };
    });

    this.normalizeWideRows(rowResults);
    return rowResults.map((row) => row.cells);
  }

  private normalizeWideRows(rowResults: Array<{ cells: string[]; positions: number[] }>) {
    const validCounts = rowResults
      .filter((row) => row.cells.length >= 5)
      .map((row) => row.cells.length)
      .sort((a, b) => a - b);
    if (validCounts.length < 3) {
      return;
    }

    const targetCols = validCounts[Math.floor(validCounts.length * 0.85)];
    for (let index = 0; index < rowResults.length; index += 1) {
      const row = rowResults[index];
      if (row.cells.length <= targetCols) {
        continue;
      }

      let reference: { cells: string[]; positions: number[] } | null = null;
      for (let distance = 1; distance <= 10; distance += 1) {
        for (const candidateIndex of [index + distance, index - distance]) {
          if (
            candidateIndex >= 0 &&
            candidateIndex < rowResults.length &&
            rowResults[candidateIndex].cells.length === targetCols
          ) {
            reference = rowResults[candidateIndex];
            break;
          }
        }
        if (reference) {
          break;
        }
      }
      if (!reference) {
        continue;
      }

      const merged = Array<string>(targetCols).fill('');
      for (let i = 0; i < row.cells.length; i += 1) {
        const pos = row.positions[i];
        let bestCol = 0;
        let bestDist = Math.abs(pos - reference.positions[0]);
        for (let col = 1; col < reference.positions.length; col += 1) {
          const distance = Math.abs(pos - reference.positions[col]);
          if (distance < bestDist) {
            bestDist = distance;
            bestCol = col;
          }
        }
        merged[bestCol] += row.cells[i];
      }
      rowResults[index] = { cells: merged, positions: reference.positions };
    }
  }

  private async recognizeWithClaude(imageBuffer: Buffer, mimeType: string) {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: process.env.ANTHROPIC_OCR_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
                data: imageBuffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: '请识别图片中的表格内容。以JSON格式返回，格式严格为：{"rows":[["单元格","单元格",...],...],"merged_cells":[{"from":[行索引,列索引],"to":[行索引,列索引]}]}。行列索引从0开始。只返回JSON，不要包含任何其他文字或markdown代码块。',
            },
          ],
        },
      ],
    });

    const block = message.content[0];
    const text =
      block && block.type === 'text' ? block.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '') : '';
    const parsed = JSON.parse(text) as {
      rows?: unknown[][];
      merged_cells?: Array<{ from?: [number, number]; to?: [number, number] }>;
    };
    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) {
      throw new Error('未在图片中检测到表格内容');
    }

    const maxCols = Math.max(...parsed.rows.map((row) => row.length));
    const rows = parsed.rows.map((row) =>
      Array.from({ length: maxCols }, (_, index) => String(row[index] ?? '')),
    );
    return {
      rows,
      cell_confidence: rows.map((row) => row.map(() => 0.85)),
      merged_cells: (parsed.merged_cells || []).filter(
        (cell) => Array.isArray(cell.from) && Array.isArray(cell.to),
      ),
      confidence: 'medium',
    };
  }

  private getTableEndpoint() {
    return process.env.BAIDU_OCR_ENDPOINT || 'https://aip.baidubce.com/rest/2.0/ocr/v1/table';
  }

  private getHandwritingEndpoint() {
    return (
      process.env.BAIDU_HANDWRITING_OCR_ENDPOINT ||
      'https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting'
    );
  }

  private getGeneralEndpoint() {
    return (
      process.env.BAIDU_GENERAL_OCR_ENDPOINT ||
      'https://aip.baidubce.com/rest/2.0/ocr/v1/general'
    );
  }

  private getTokenEndpoint() {
    return process.env.BAIDU_TOKEN_ENDPOINT || 'https://aip.baidubce.com/oauth/2.0/token';
  }

  private getMaxImageBytes() {
    return Number(process.env.OCR_MAX_IMAGE_BYTES || 10 * 1024 * 1024);
  }

  private getAllowedMimeTypes() {
    return (process.env.OCR_ALLOWED_MIME_TYPES || 'image/png,image/jpeg,image/jpg')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseTablesResult(tablesResult: BaiduTableResult[]) {
    if (!tablesResult.length) {
      return { rows: [['']], cell_confidence: [[1]], merged_cells: [], confidence: 'low' };
    }

    const table = tablesResult[0];
    const cells = [...(table.header || []), ...(table.body || [])];
    if (!cells.length) {
      return { rows: [['']], cell_confidence: [[1]], merged_cells: [], confidence: 'low' };
    }

    const maxRow = Math.max(...cells.map((cell) => cell.row_end));
    const maxCol = Math.max(...cells.map((cell) => cell.col_end));
    const rows = Array.from({ length: maxRow }, () => Array<string>(maxCol).fill(''));
    const mergedCells: Array<{ from: [number, number]; to: [number, number] }> = [];

    for (const cell of cells) {
      const rowspan = cell.row_end - cell.row_start;
      const colspan = cell.col_end - cell.col_start;
      rows[cell.row_start][cell.col_start] = cell.words || '';

      if (rowspan > 1 || colspan > 1) {
        mergedCells.push({
          from: [cell.row_start, cell.col_start],
          to: [cell.row_end - 1, cell.col_end - 1],
        });
      }
    }

    return {
      rows,
      cell_confidence: rows.map((row) => row.map(() => 0.9)),
      merged_cells: mergedCells,
      confidence: maxRow >= 3 ? 'high' : maxRow >= 1 ? 'medium' : 'low',
    };
  }
}
