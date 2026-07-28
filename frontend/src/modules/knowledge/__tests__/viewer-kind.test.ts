import { resolveKnowledgeViewerKind } from '../viewer-kind'

describe('resolveKnowledgeViewerKind', () => {
  it.each([
    ['报告.pdf', 'application/pdf', 'pdf'],
    ['计划.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['旧计划.doc', 'application/msword', 'office-pdf'],
    ['台账.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'spreadsheet'],
    ['台账.xls', 'application/vnd.ms-excel', 'spreadsheet'],
    ['明细.csv', 'text/csv', 'spreadsheet'],
    ['说明.md', 'text/markdown', 'markdown'],
    ['配置.json', 'application/json', 'json'],
    ['网页.html', 'text/html', 'html'],
    ['照片.png', 'image/png', 'image'],
    ['记录.txt', 'text/plain', 'text'],
  ] as const)('routes %s to its own %s reader', (fileName, mimeType, expected) => {
    expect(resolveKnowledgeViewerKind(fileName, mimeType)).toBe(expected)
  })
})
