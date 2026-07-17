import { Injectable, Optional } from '@nestjs/common';
import { AppLoggerService } from '../../../infrastructure/logger/app-logger.service';
import {
  CopyrightRiskAnalysisResult,
  CopyrightRiskLevel,
  CopyrightRiskRightPayload,
  CopyrightRiskRegionPayload,
  CopyrightRiskUsageAssessmentPayload,
  CopyrightRiskVisualElementPayload,
} from '../../../shared/contracts/jobs/job-contracts';

export interface CopyrightRiskAnalyzeInput {
  imageBuffer: Buffer;
  mimeType: string;
  originalName: string;
}

type RiskType = CopyrightRiskRegionPayload['riskType'];

interface ImageSize {
  width: number;
  height: number;
}

interface CopyrightAiProviderConfig {
  provider: 'anthropic' | 'anthropic-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
}

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const DISCLAIMER = '仅用于版权/商标风险初筛，不构成法律意见或最终侵权判定。';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5';
const DEFAULT_COMPATIBLE_VISION_MODEL = 'qwen3-vl-plus';
const DEFAULT_AI_TIMEOUT_MS = 180000;
const DEFAULT_AI_MAX_TOKENS = 6000;

const RISK_DICTIONARY: Array<{
  type: RiskType;
  label: string;
  keywords: string[];
  severity: CopyrightRiskLevel;
  confidence: number;
  box: Pick<CopyrightRiskRegionPayload, 'x' | 'y' | 'width' | 'height'>;
  reason: string;
  suggestion: string;
}> = [
  {
    type: 'trademark',
    label: '疑似品牌标识',
    keywords: [
      'logo',
      'brand',
      'trademark',
      'nike',
      'adidas',
      'puma',
      'apple',
      'disney',
      'marvel',
      'pokemon',
      'starbucks',
      'mcdonald',
      'coca',
      'cola',
      'gucci',
      'chanel',
      'supreme',
      'lv',
      '商标',
      '品牌',
    ],
    severity: 'high',
    confidence: 0.84,
    box: { x: 10, y: 10, width: 30, height: 22 },
    reason: '图片名称或上下文包含品牌、商标或品牌标识线索。',
    suggestion: '核验品牌授权、移除品牌标识，或替换为自有/可商用素材。',
  },
  {
    type: 'character',
    label: '疑似受版权保护角色',
    keywords: [
      'cartoon',
      'anime',
      'character',
      'mickey',
      'minion',
      'pikachu',
      'naruto',
      'onepiece',
      'doraemon',
      'hello kitty',
      '卡通',
      '动漫',
      '角色',
      '小黄人',
    ],
    severity: 'high',
    confidence: 0.82,
    box: { x: 35, y: 18, width: 34, height: 46 },
    reason: '图片名称或上下文包含知名角色、动漫或卡通形象线索。',
    suggestion: '确认角色版权授权，或改用原创角色/公共领域素材。',
  },
  {
    type: 'watermark',
    label: '疑似版权水印/署名',
    keywords: ['watermark', 'copyright', 'signature', 'stock', 'shutterstock', 'getty', 'alamy', '水印', '版权', '署名'],
    severity: 'medium',
    confidence: 0.76,
    box: { x: 58, y: 66, width: 32, height: 18 },
    reason: '图片名称或上下文包含图库、水印或版权声明线索。',
    suggestion: '保留授权凭证，移除未授权图库素材，或重新购买商用授权。',
  },
  {
    type: 'artwork',
    label: '疑似海报/画作主体',
    keywords: ['poster', 'movie', 'album', 'cover', 'game', 'artwork', 'illustration', 'comic', '海报', '电影', '专辑', '游戏', '插画'],
    severity: 'medium',
    confidence: 0.7,
    box: { x: 15, y: 16, width: 68, height: 62 },
    reason: '图片名称或上下文包含海报、封面、插画、游戏素材等作品线索。',
    suggestion: '确认图片来源和作品授权范围，避免直接使用第三方完整作品。',
  },
  {
    type: 'portrait',
    label: '疑似公众人物肖像',
    keywords: ['celebrity', 'star', 'messi', 'ronaldo', 'cr7', 'neymar', 'mbappe', 'haaland', '明星', '球星', '梅西', 'c罗', '内马尔', '姆巴佩'],
    severity: 'medium',
    confidence: 0.72,
    box: { x: 28, y: 12, width: 48, height: 54 },
    reason: '图片名称或上下文包含公众人物或球星肖像线索。',
    suggestion: '确认肖像权、赛事素材及商用授权，避免误导性背书。',
  },
];

@Injectable()
export class CopyrightRiskService {
  constructor(@Optional() private readonly logger?: AppLoggerService) {}

  async analyze(input: CopyrightRiskAnalyzeInput): Promise<CopyrightRiskAnalysisResult> {
    this.validateInput(input);
    const image = {
      ...this.readImageSize(input.imageBuffer, input.mimeType),
      mimeType: input.mimeType,
      originalName: input.originalName,
    };

    const aiConfig = this.resolveAiProviderConfig();
    if (aiConfig) {
      try {
        return await this.analyzeWithAiProvider(input, image, aiConfig);
      } catch (error) {
        this.logger?.warn(
          JSON.stringify({
            event: 'copyright_ai_provider_failed',
            provider: aiConfig.provider,
            model: aiConfig.model,
            baseUrl: this.redactUrl(aiConfig.baseUrl),
            originalName: input.originalName,
            errorMessage: error instanceof Error ? error.message : String(error),
          }),
        );
        // The local scan keeps the feature usable even when the visual provider is unavailable.
      }
    }

    return this.analyzeHeuristically(input, image);
  }

  private validateInput(input: CopyrightRiskAnalyzeInput) {
    if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
      throw new Error('仅支持 JPG、PNG、WEBP 图片');
    }
    if (!input.imageBuffer.length) {
      throw new Error('图片内容不能为空');
    }
  }

  private async analyzeWithAiProvider(
    input: CopyrightRiskAnalyzeInput,
    image: CopyrightRiskAnalysisResult['image'],
    config: CopyrightAiProviderConfig,
  ): Promise<CopyrightRiskAnalysisResult> {
    const response = await this.callAnthropicCompatibleMessages({
      config,
      imageBuffer: input.imageBuffer,
      mimeType: input.mimeType,
      originalName: input.originalName,
    });

    const text = this.extractTextFromMessageResponse(response);
    const parsed = this.parseJsonPayload(text);
    const result = this.normalizeAiResult(parsed, image);
    return {
      ...result,
      mode: 'ai',
      provider: config.provider,
      analysisScope: 'full-image',
      disclaimer: DISCLAIMER,
    };
  }

  private async callAnthropicCompatibleMessages(input: {
    config: CopyrightAiProviderConfig;
    imageBuffer: Buffer;
    mimeType: string;
    originalName: string;
  }) {
    const endpoint = `${input.config.baseUrl.replace(/\/$/, '')}/v1/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': input.config.apiKey,
        },
        body: JSON.stringify({
          model: input.config.model,
          max_tokens: input.config.maxTokens,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: input.mimeType,
                    data: input.imageBuffer.toString('base64'),
                  },
                },
                {
                  type: 'text',
                  text: this.buildAiPrompt(input.originalName),
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`AI provider rejected request: ${response.status} ${body}`);
      }

      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildAiPrompt(originalName: string) {
    return [
      '你是图片版权、商标、肖像权和素材来源风险分析助手。',
      '请对整张图片进行完整视觉分析，不要只分析局部或只根据文件名判断。',
      '请结合图片主体、背景、文字、水印、品牌标识、人物、服饰、商品包装、插画风格、疑似知识产权角色和使用场景生成详细报告。',
      '所有自然语言字段必须使用简体中文，包括 summary、imageDescription、detectedText、label、description、reason、suggestion、evidence、explanation、recommendation、advice、recommendations；禁止输出英文句子或中英混排术语。',
      '输出必须是一个完整 JSON object。不要 Markdown，不要代码块，不要尾逗号，不要返回 JSON schema 本身。',
      'visualElements、regions、rightsRisks、usageAssessments、recommendations 每个数组最多 5 项，描述要具体但保持简洁。',
      '坐标必须使用百分比，x/y/width/height 范围 0-100。如果无法精确定位，也要给出覆盖风险主体的近似区域。',
      'JSON schema:',
      JSON.stringify({
        riskScore: '0-100 number',
        riskLevel: 'low|medium|high|critical',
        summary: 'string',
        imageDescription: '整张图片内容描述',
        detectedText: ['图片中识别到的文字、水印、品牌词，没有则空数组'],
        visualElements: [
          {
            id: 'string',
            type: 'person|logo|text|product|character|artwork|scene|other',
            label: 'string',
            description: 'string',
            riskLevel: 'low|medium|high|critical',
            confidence: '0-1 number',
          },
        ],
        regions: [
          {
            id: 'string',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            label: 'string',
            riskType: 'trademark|character|watermark|artwork|portrait|unclear-source',
            severity: 'low|medium|high|critical',
            confidence: '0-1 number',
            reason: 'string',
            suggestion: 'string',
          },
        ],
        rightsRisks: [
          {
            id: 'string',
            rightType: 'copyright|trademark|portrait|font|source|publicity|other',
            riskLevel: 'low|medium|high|critical',
            evidence: 'string',
            explanation: 'string',
            recommendation: 'string',
          },
        ],
        usageAssessments: [
          {
            scenario: 'internal|social-media|ecommerce|advertising|print|other',
            riskLevel: 'low|medium|high|critical',
            advice: 'string',
          },
        ],
        recommendations: ['string'],
        needsHumanReview: 'boolean',
      }),
      `文件名：${originalName}`,
    ].join('\n');
  }

  private extractTextFromMessageResponse(response: unknown) {
    const content = (response as { content?: Array<{ type?: string; text?: string }> }).content;
    if (!Array.isArray(content)) {
      throw new Error('AI analysis returned invalid content');
    }
    return content
      .map((block) => (block.type === 'text' ? block.text || '' : ''))
      .join('\n')
      .trim();
  }

  private analyzeHeuristically(
    input: CopyrightRiskAnalyzeInput,
    image: CopyrightRiskAnalysisResult['image'],
  ): CopyrightRiskAnalysisResult {
    const normalizedName = input.originalName.toLowerCase();
    const regions = RISK_DICTIONARY.filter((entry) =>
      entry.keywords.some((keyword) => normalizedName.includes(keyword.toLowerCase())),
    ).map((entry, index) =>
      this.normalizeRegion({
        id: `${entry.type}-${index + 1}`,
        x: entry.box.x,
        y: entry.box.y,
        width: entry.box.width,
        height: entry.box.height,
        label: entry.label,
        riskType: entry.type,
        severity: entry.severity,
        confidence: entry.confidence,
        reason: entry.reason,
        suggestion: entry.suggestion,
      }),
    );

    const safeRegions =
      regions.length > 0
        ? regions
        : [
            this.normalizeRegion({
              id: 'source-review-1',
              x: 22,
              y: 20,
              width: 56,
              height: 50,
              label: '来源待确认区域',
              riskType: 'unclear-source',
              severity: 'low',
              confidence: 0.38,
              reason: '未发现明显品牌、角色、水印或公众人物线索，但仍需确认图片来源。',
              suggestion: '保留原图来源、授权证明或拍摄记录。',
            }),
          ];

    const riskScore = this.scoreFromRegions(safeRegions);
    const riskLevel = this.levelFromScore(riskScore);
    return {
      mode: 'heuristic',
      analysisScope: 'filename-rules',
      riskScore,
      riskLevel,
      summary:
        regions.length > 0
          ? `发现 ${regions.length} 个版权/商标/肖像风险点，需要复核授权来源。`
          : '未发现明显高风险元素，建议保留图片来源和授权证明。',
      image,
      regions: safeRegions,
      recommendations: this.recommendationsFor(riskLevel, safeRegions),
      disclaimer: DISCLAIMER,
    };
  }

  private parseJsonPayload(text: string) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('AI analysis returned non-JSON content');
    }
    return JSON.parse(match[0]) as Partial<CopyrightRiskAnalysisResult>;
  }

  private normalizeAiResult(
    raw: Partial<CopyrightRiskAnalysisResult>,
    image: CopyrightRiskAnalysisResult['image'],
  ): Omit<CopyrightRiskAnalysisResult, 'mode' | 'disclaimer'> {
    const regions = Array.isArray(raw.regions)
      ? raw.regions.map((region, index) =>
          this.normalizeRegion({
            id: String(region.id || `risk-${index + 1}`),
            x: Number(region.x),
            y: Number(region.y),
            width: Number(region.width),
            height: Number(region.height),
            label: String(region.label || '风险区域'),
            riskType: this.normalizeRiskType(region.riskType),
            severity: this.normalizeLevel(region.severity) ?? 'low',
            confidence: Number(region.confidence ?? 0.6),
            reason: String(region.reason || '视觉模型识别到潜在版权/商标风险。'),
            suggestion: String(region.suggestion || '请确认授权来源或替换素材。'),
          }),
        )
      : [];
    const safeRegions =
      regions.length > 0
        ? regions
        : [
            this.normalizeRegion({
              id: 'ai-source-review-1',
              x: 22,
              y: 20,
              width: 56,
              height: 50,
              label: '来源待确认区域',
              riskType: 'unclear-source',
              severity: 'low',
              confidence: 0.36,
              reason: '未发现明确侵权线索，但来源仍需人工确认。',
              suggestion: '保留来源证明和授权记录。',
            }),
          ];
    const riskScore = this.clampScore(Number(raw.riskScore ?? this.scoreFromRegions(safeRegions)));
    return {
      riskScore,
      riskLevel: this.normalizeLevel(raw.riskLevel) || this.levelFromScore(riskScore),
      summary: String(raw.summary || '已完成版权、商标和肖像权风险初筛。'),
      imageDescription:
        typeof raw.imageDescription === 'string' && raw.imageDescription.trim()
          ? raw.imageDescription.trim()
          : '智能模型已完成整张图片视觉分析。',
      detectedText: this.normalizeStringArray(raw.detectedText),
      image,
      regions: safeRegions,
      visualElements: this.normalizeVisualElements(raw.visualElements),
      rightsRisks: this.normalizeRightsRisks(raw.rightsRisks),
      usageAssessments: this.normalizeUsageAssessments(raw.usageAssessments),
      needsHumanReview:
        typeof raw.needsHumanReview === 'boolean'
          ? raw.needsHumanReview
          : this.levelFromScore(riskScore) !== 'low',
      recommendations:
        Array.isArray(raw.recommendations) && raw.recommendations.length > 0
          ? raw.recommendations.map(String)
          : this.recommendationsFor(this.levelFromScore(riskScore), safeRegions),
    };
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  private normalizeVisualElements(value: unknown): CopyrightRiskVisualElementPayload[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item, index) => {
      const element = item as Partial<CopyrightRiskVisualElementPayload>;
      return {
        id: String(element.id || `visual-${index + 1}`),
        type: this.normalizeVisualElementType(element.type),
        label: String(element.label || '视觉元素'),
        description: String(element.description || '智能模型识别到的图片元素。'),
        riskLevel: this.normalizeLevel(element.riskLevel) || 'low',
        confidence: Math.min(1, Math.max(0, Number(element.confidence) || 0)),
      };
    });
  }

  private normalizeRightsRisks(value: unknown): CopyrightRiskRightPayload[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item, index) => {
      const risk = item as Partial<CopyrightRiskRightPayload>;
      return {
        id: String(risk.id || `right-${index + 1}`),
        rightType: this.normalizeRightType(risk.rightType),
        riskLevel: this.normalizeLevel(risk.riskLevel) || 'low',
        evidence: String(risk.evidence || '智能模型识别到潜在权利风险线索。'),
        explanation: String(risk.explanation || '需要结合授权文件和使用场景人工复核。'),
        recommendation: String(risk.recommendation || '保留来源证明，必要时替换素材。'),
      };
    });
  }

  private normalizeUsageAssessments(value: unknown): CopyrightRiskUsageAssessmentPayload[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => {
      const assessment = item as Partial<CopyrightRiskUsageAssessmentPayload>;
      return {
        scenario: this.normalizeUsageScenario(assessment.scenario),
        riskLevel: this.normalizeLevel(assessment.riskLevel) || 'low',
        advice: String(assessment.advice || '使用前建议保留来源和授权记录。'),
      };
    });
  }

  private normalizeRegion(region: CopyrightRiskRegionPayload): CopyrightRiskRegionPayload {
    return {
      ...region,
      x: this.clampPercent(region.x),
      y: this.clampPercent(region.y),
      width: this.clampPercent(region.width),
      height: this.clampPercent(region.height),
      severity: this.normalizeLevel(region.severity) || 'low',
      riskType: this.normalizeRiskType(region.riskType),
      confidence: Math.min(1, Math.max(0, Number(region.confidence) || 0)),
    };
  }

  private scoreFromRegions(regions: CopyrightRiskRegionPayload[]) {
    const maxSeverity = Math.max(...regions.map((region) => this.severityScore(region.severity)));
    const confidenceBonus = Math.round(
      regions.reduce((sum, region) => sum + region.confidence * 8, 0),
    );
    const countBonus = Math.min(12, (regions.length - 1) * 6);
    return this.clampScore(maxSeverity + confidenceBonus + countBonus);
  }

  private severityScore(level: CopyrightRiskLevel) {
    switch (level) {
      case 'critical':
        return 86;
      case 'high':
        return 68;
      case 'medium':
        return 45;
      case 'low':
      default:
        return 18;
    }
  }

  private levelFromScore(score: number): CopyrightRiskLevel {
    if (score >= 85) return 'critical';
    if (score >= 65) return 'high';
    if (score >= 35) return 'medium';
    return 'low';
  }

  private normalizeLevel(value: unknown): CopyrightRiskLevel | null {
    if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') {
      return value;
    }
    return null;
  }

  private normalizeRiskType(value: unknown): RiskType {
    if (
      value === 'trademark' ||
      value === 'character' ||
      value === 'watermark' ||
      value === 'artwork' ||
      value === 'portrait' ||
      value === 'unclear-source'
    ) {
      return value;
    }
    return 'unclear-source';
  }

  private normalizeVisualElementType(
    value: unknown,
  ): CopyrightRiskVisualElementPayload['type'] {
    if (
      value === 'person' ||
      value === 'logo' ||
      value === 'text' ||
      value === 'product' ||
      value === 'character' ||
      value === 'artwork' ||
      value === 'scene' ||
      value === 'other'
    ) {
      return value;
    }
    return 'other';
  }

  private normalizeRightType(value: unknown): CopyrightRiskRightPayload['rightType'] {
    if (
      value === 'copyright' ||
      value === 'trademark' ||
      value === 'portrait' ||
      value === 'font' ||
      value === 'source' ||
      value === 'publicity' ||
      value === 'other'
    ) {
      return value;
    }
    return 'other';
  }

  private normalizeUsageScenario(
    value: unknown,
  ): CopyrightRiskUsageAssessmentPayload['scenario'] {
    if (
      value === 'internal' ||
      value === 'social-media' ||
      value === 'ecommerce' ||
      value === 'advertising' ||
      value === 'print' ||
      value === 'other'
    ) {
      return value;
    }
    return 'other';
  }

  private recommendationsFor(
    riskLevel: CopyrightRiskLevel,
    regions: CopyrightRiskRegionPayload[],
  ) {
    if (riskLevel === 'critical' || riskLevel === 'high') {
      return [
        '上线或商用前请人工复核授权文件。',
        '对标出的品牌标识、角色、肖像或第三方作品区域做替换、裁切或二次创作处理。',
        '保留素材来源、合同、购买记录和授权范围截图。',
      ];
    }
    if (riskLevel === 'medium') {
      return [
        '确认标注区域是否来自可商用图库或自有拍摄。',
        '无法确认来源时建议替换为自有素材。',
      ];
    }
    return [
      regions[0]?.suggestion || '保留图片来源和授权记录。',
      '低风险不代表无风险，关键商业页面仍建议抽样人工复核。',
    ];
  }

  private readImageSize(buffer: Buffer, mimeType: string): ImageSize {
    if (mimeType === 'image/png' && buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && buffer.length > 4) {
      const jpegSize = this.readJpegSize(buffer);
      if (jpegSize) return jpegSize;
    }
    if (mimeType === 'image/webp' && buffer.length > 30) {
      const webpSize = this.readWebpSize(buffer);
      if (webpSize) return webpSize;
    }
    return { width: 1024, height: 768 };
  }

  private readJpegSize(buffer: Buffer): ImageSize | null {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < buffer.length) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
    return null;
  }

  private readWebpSize(buffer: Buffer): ImageSize | null {
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
      return null;
    }
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buffer.length >= 30) {
      return {
        width: buffer.readUIntLE(24, 3) + 1,
        height: buffer.readUIntLE(27, 3) + 1,
      };
    }
    if (chunk === 'VP8 ' && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    return null;
  }

  private clampPercent(value: number) {
    return Math.min(100, Math.max(0, Number.isFinite(value) ? Math.round(value * 10) / 10 : 0));
  }

  private clampScore(value: number) {
    return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
  }

  private resolveAiProviderConfig(): CopyrightAiProviderConfig | null {
    const provider = process.env.COPYRIGHT_RISK_PROVIDER;
    if (provider === 'anthropic') {
      const apiKey = process.env.COPYRIGHT_AI_API_KEY || process.env.ANTHROPIC_API_KEY;
      if (!apiKey?.trim()) {
        return null;
      }
      return {
        provider: 'anthropic',
        baseUrl:
          process.env.COPYRIGHT_AI_BASE_URL ||
          process.env.ANTHROPIC_BASE_URL ||
          DEFAULT_ANTHROPIC_BASE_URL,
        apiKey,
        model:
          process.env.COPYRIGHT_AI_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
        timeoutMs: Number(process.env.COPYRIGHT_AI_TIMEOUT_MS) || DEFAULT_AI_TIMEOUT_MS,
        maxTokens: Number(process.env.COPYRIGHT_AI_MAX_TOKENS) || DEFAULT_AI_MAX_TOKENS,
      };
    }

    if (provider === 'anthropic-compatible') {
      const apiKey =
        process.env.COPYRIGHT_AI_API_KEY ||
        process.env.ANTHROPIC_AUTH_TOKEN ||
        process.env.ANTHROPIC_API_KEY;
      const baseUrl = process.env.COPYRIGHT_AI_BASE_URL || process.env.ANTHROPIC_BASE_URL;
      if (!apiKey?.trim() || !baseUrl?.trim()) {
        return null;
      }
      return {
        provider: 'anthropic-compatible',
        baseUrl,
        apiKey,
        model:
          process.env.COPYRIGHT_AI_MODEL ||
          process.env.ANTHROPIC_MODEL ||
          DEFAULT_COMPATIBLE_VISION_MODEL,
        timeoutMs: Number(process.env.COPYRIGHT_AI_TIMEOUT_MS) || DEFAULT_AI_TIMEOUT_MS,
        maxTokens: Number(process.env.COPYRIGHT_AI_MAX_TOKENS) || DEFAULT_AI_MAX_TOKENS,
      };
    }

    return null;
  }

  private redactUrl(value: string) {
    try {
      const url = new URL(value);
      url.username = '';
      url.password = '';
      return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
    } catch {
      return value.replace(/([?&](?:api[_-]?key|token|access[_-]?token)=)[^&]+/gi, '$1<redacted>');
    }
  }
}
