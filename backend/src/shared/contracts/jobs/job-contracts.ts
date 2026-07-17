export interface OcrRecognizePayload {
  imageBase64: string;
  mimeType: string;
  originalName: string;
}

export interface MergedCellPayload {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface ExcelExportPayload {
  rows: string[][];
  mergedCells: MergedCellPayload[];
}

export interface ExcelExportBatchPayload {
  sheets: Array<{
    name: string;
    rows: string[][];
    mergedCells: MergedCellPayload[];
  }>;
}

export interface HairstyleTransformPayload {
  imageBase64: string;
  mimeType: string;
  originalName: string;
  style: string;
}

export interface CopyrightRiskAnalyzePayload {
  imageBase64: string;
  mimeType: string;
  originalName: string;
}

export type CopyrightRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CopyrightRiskRegionPayload {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  riskType: 'trademark' | 'character' | 'watermark' | 'artwork' | 'portrait' | 'unclear-source';
  severity: CopyrightRiskLevel;
  confidence: number;
  reason: string;
  suggestion: string;
}

export interface CopyrightRiskVisualElementPayload {
  id: string;
  type: 'person' | 'logo' | 'text' | 'product' | 'character' | 'artwork' | 'scene' | 'other';
  label: string;
  description: string;
  riskLevel: CopyrightRiskLevel;
  confidence: number;
}

export interface CopyrightRiskRightPayload {
  id: string;
  rightType: 'copyright' | 'trademark' | 'portrait' | 'font' | 'source' | 'publicity' | 'other';
  riskLevel: CopyrightRiskLevel;
  evidence: string;
  explanation: string;
  recommendation: string;
}

export interface CopyrightRiskUsageAssessmentPayload {
  scenario: 'internal' | 'social-media' | 'ecommerce' | 'advertising' | 'print' | 'other';
  riskLevel: CopyrightRiskLevel;
  advice: string;
}

export interface CopyrightRiskAnalysisResult {
  mode: 'ai' | 'heuristic';
  provider?: string;
  analysisScope?: 'full-image' | 'filename-rules';
  riskScore: number;
  riskLevel: CopyrightRiskLevel;
  summary: string;
  imageDescription?: string;
  detectedText?: string[];
  image: {
    width: number;
    height: number;
    mimeType: string;
    originalName: string;
  };
  regions: CopyrightRiskRegionPayload[];
  visualElements?: CopyrightRiskVisualElementPayload[];
  rightsRisks?: CopyrightRiskRightPayload[];
  usageAssessments?: CopyrightRiskUsageAssessmentPayload[];
  needsHumanReview?: boolean;
  recommendations: string[];
  disclaimer: string;
}

export interface JobFileResult {
  fileId: string;
  filename: string;
  mimeType: string;
}
