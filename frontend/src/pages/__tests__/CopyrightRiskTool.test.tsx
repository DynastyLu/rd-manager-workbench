import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CopyrightRiskTool from '../CopyrightRiskTool'
import { copyrightRiskService } from '@/services/copyrightRisk'

vi.mock('@/services/copyrightRisk', () => ({
  copyrightRiskService: {
    createBatch: vi.fn(),
    waitForResult: vi.fn(),
  },
}))

describe('CopyrightRiskTool', () => {
  beforeEach(() => {
    vi.mocked(copyrightRiskService.createBatch).mockReset()
    vi.mocked(copyrightRiskService.waitForResult).mockReset()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:risk-preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('uploads images and renders risk markers over the selected image', async () => {
    vi.mocked(copyrightRiskService.createBatch).mockResolvedValueOnce({
      pending: true,
      count: 1,
      jobs: [
        {
          jobId: 'copyright-job-1',
          originalName: 'brand-poster.png',
          statusUrl: '/api/copyright/jobs/copyright-job-1',
          resultUrl: '/api/copyright/jobs/copyright-job-1',
        },
      ],
    })
    vi.mocked(copyrightRiskService.waitForResult).mockResolvedValueOnce({
      jobId: 'copyright-job-1',
      originalName: 'brand-poster.png',
      result: riskResult('brand-poster.png', 84, 'high'),
    })

    render(<CopyrightRiskTool />)
    const file = new File(['image'], 'brand-poster.png', { type: 'image/png' })

    await userEvent.upload(screen.getByLabelText('批量上传图片'), file)
    await userEvent.click(screen.getByRole('button', { name: /开始检测/ }))

    await waitFor(() => {
      expect(copyrightRiskService.createBatch).toHaveBeenCalledWith([file])
      expect(copyrightRiskService.waitForResult).toHaveBeenCalledWith({
        jobId: 'copyright-job-1',
        originalName: 'brand-poster.png',
        statusUrl: '/api/copyright/jobs/copyright-job-1',
        resultUrl: '/api/copyright/jobs/copyright-job-1',
      })
    })
    await waitFor(() => {
      expect(screen.getAllByText('84').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('疑似品牌标识').length).toBeGreaterThan(0)
    expect(screen.getByTitle('疑似品牌标识：检测到品牌标识线索')).toBeTruthy()
  })

  it('updates each image independently when one batch item times out', async () => {
    vi.mocked(copyrightRiskService.createBatch).mockResolvedValueOnce({
      pending: true,
      count: 2,
      jobs: [
        {
          jobId: 'copyright-job-ok',
          originalName: 'ok-poster.png',
          statusUrl: '/api/copyright/jobs/copyright-job-ok',
          resultUrl: '/api/copyright/jobs/copyright-job-ok',
        },
        {
          jobId: 'copyright-job-slow',
          originalName: 'slow-poster.png',
          statusUrl: '/api/copyright/jobs/copyright-job-slow',
          resultUrl: '/api/copyright/jobs/copyright-job-slow',
        },
      ],
    })
    vi.mocked(copyrightRiskService.waitForResult)
      .mockResolvedValueOnce({
        jobId: 'copyright-job-ok',
        originalName: 'ok-poster.png',
        result: riskResult('ok-poster.png', 31, 'low'),
      })
      .mockRejectedValueOnce(new Error('版权风险分析时间较长，请稍后查看任务状态'))

    render(<CopyrightRiskTool />)
    const okFile = new File(['ok'], 'ok-poster.png', { type: 'image/png' })
    const slowFile = new File(['slow'], 'slow-poster.png', { type: 'image/png' })

    await userEvent.upload(screen.getByLabelText('批量上传图片'), [okFile, slowFile])
    await userEvent.click(screen.getByRole('button', { name: /开始检测/ }))

    await waitFor(() => {
      expect(screen.getAllByText('低风险').length).toBeGreaterThan(0)
      expect(screen.getByText('版权风险分析时间较长，请稍后查看任务状态')).toBeTruthy()
    })
    expect(screen.getAllByText('31').length).toBeGreaterThan(0)
  })

  it('renders the detailed AI report fields when available', async () => {
    vi.mocked(copyrightRiskService.createBatch).mockResolvedValueOnce({
      pending: true,
      count: 1,
      jobs: [
        {
          jobId: 'copyright-job-ai',
          originalName: 'world-cup-poster.png',
          statusUrl: '/api/copyright/jobs/copyright-job-ai',
          resultUrl: '/api/copyright/jobs/copyright-job-ai',
        },
      ],
    })
    vi.mocked(copyrightRiskService.waitForResult).mockResolvedValueOnce({
      jobId: 'copyright-job-ai',
      originalName: 'world-cup-poster.png',
      result: {
        ...riskResult('world-cup-poster.png', 91, 'critical'),
        mode: 'ai',
        provider: 'anthropic-compatible',
        analysisScope: 'full-image',
        imageDescription: '整张图片是一张足球赛事宣传图，包含球员、球衣、奖杯和赞助品牌标识。',
        detectedText: ['WORLD CUP', 'SPORTS BRAND'],
        visualElements: [
          {
            id: 'visual-logo',
            type: 'logo',
            label: '赞助品牌标识',
            description: '画面右上角出现疑似商业品牌 Logo。',
            riskLevel: 'high',
            confidence: 0.92,
          },
        ],
        rightsRisks: [
          {
            id: 'right-trademark',
            rightType: 'trademark',
            riskLevel: 'high',
            evidence: '画面中出现疑似赞助品牌标识。',
            explanation: '未经授权商用可能涉及商标权风险。',
            recommendation: '确认商标授权或移除相关标识。',
          },
        ],
        usageAssessments: [
          {
            scenario: 'advertising',
            riskLevel: 'critical',
            advice: '不建议直接用于广告投放，需先完成人工授权复核。',
          },
        ],
        needsHumanReview: true,
      } as never,
    })

    render(<CopyrightRiskTool />)
    const file = new File(['image'], 'world-cup-poster.png', { type: 'image/png' })

    await userEvent.upload(screen.getByLabelText('批量上传图片'), file)
    await userEvent.click(screen.getByRole('button', { name: /开始检测/ }))

    const table = await screen.findByRole('table', { name: '风险分析表' })
    expect(screen.getByText('整图分析')).toBeTruthy()
    expect(screen.getByText('整张图片是一张足球赛事宣传图，包含球员、球衣、奖杯和赞助品牌标识。')).toBeTruthy()
    expect(screen.queryByText('WORLD CUP')).toBeNull()
    expect(screen.getAllByText('图片文字').length).toBeGreaterThan(0)
    expect(within(table).getByText('赞助品牌标识')).toBeTruthy()
    expect(within(table).getByText(/画面中出现疑似赞助品牌标识。/)).toBeTruthy()
    expect(within(table).getByText('不建议直接用于广告投放，需先完成人工授权复核。')).toBeTruthy()
  })

  it('renders AI report as a Chinese table sorted by risk score', async () => {
    vi.mocked(copyrightRiskService.createBatch).mockResolvedValueOnce({
      pending: true,
      count: 1,
      jobs: [
        {
          jobId: 'copyright-job-table',
          originalName: 'ornament.png',
          statusUrl: '/api/copyright/jobs/copyright-job-table',
          resultUrl: '/api/copyright/jobs/copyright-job-table',
        },
      ],
    })
    vi.mocked(copyrightRiskService.waitForResult).mockResolvedValueOnce({
      jobId: 'copyright-job-table',
      originalName: 'ornament.png',
      result: {
        ...riskResult('ornament.png', 78, 'medium'),
        mode: 'ai',
        provider: 'anthropic-compatible',
        analysisScope: 'full-image',
        imageDescription:
          'Dark purple cloth tabletop with a stylized skull, candle holders, portrait photos and gilded frames.',
        visualElements: [
          {
            id: 'skull',
            type: 'character',
            label: 'cartoon skull with oversized eyes',
            description: 'Stylized beige skull with exaggerated large white eyes.',
            riskLevel: 'medium',
            confidence: 0.85,
          },
          {
            id: 'frames',
            type: 'product',
            label: 'gilded baroque-style photo frames',
            description: 'Elaborately carved gold-colored frames with floral motifs.',
            riskLevel: 'low',
            confidence: 0.95,
          },
        ],
        rightsRisks: [
          {
            id: 'copyright',
            rightType: 'copyright',
            riskLevel: 'high',
            evidence: 'Skull with oversized eyes and expressive mouth resembles known stylized characters.',
            explanation: 'Potential substantial similarity risk.',
            recommendation: 'Conduct thorough reverse image search.',
          },
        ],
        usageAssessments: [
          {
            scenario: 'advertising',
            riskLevel: 'critical',
            advice: 'Use only if generated via licensed platform.',
          },
        ],
        recommendations: ['Conduct thorough reverse image search.'],
        needsHumanReview: true,
      } as never,
    })

    render(<CopyrightRiskTool />)
    const file = new File(['image'], 'ornament.png', { type: 'image/png' })

    await userEvent.upload(screen.getByLabelText('批量上传图片'), file)
    await userEvent.click(screen.getByRole('button', { name: /开始检测/ }))

    const table = await screen.findByRole('table', { name: '风险分析表' })
    const rows = within(table).getAllByRole('row')
    const bodyRows = rows.slice(1)

    expect(within(table).getByText('风险分析表')).toBeTruthy()
    expect(within(table).getByText('大眼卡通骷髅头')).toBeTruthy()
    expect(within(table).getByText('镀金巴洛克风格相框')).toBeTruthy()
    expect(within(table).queryByText('cartoon skull with oversized eyes')).toBeNull()

    const scores = bodyRows.map((row) =>
      Number(within(row).getByTestId('copyright-report-score').textContent)
    )
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('keeps risk marker styling from covering the whole preview image', () => {
    const css = readFileSync(new NodeURL('../../index.css', import.meta.url), 'utf8')
    const riskBoxRule = css.match(/\.copyright-risk-box\s*{[^}]+}/)?.[0] ?? ''

    expect(riskBoxRule).not.toContain('999px')
  })
})

function riskResult(
  originalName: string,
  riskScore: number,
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
) {
  return {
    mode: 'heuristic' as const,
    riskScore,
    riskLevel,
    summary: riskLevel === 'low' ? '低风险' : '存在品牌标识风险',
    image: {
      width: 1000,
      height: 700,
      mimeType: 'image/png',
      originalName,
    },
    regions: [
      {
        id: 'brand-logo',
        x: 10,
        y: 16,
        width: 26,
        height: 20,
        label: '疑似品牌/Logo',
        riskType: 'trademark' as const,
        severity: riskLevel,
        confidence: 0.86,
        reason: '检测到品牌标识线索',
        suggestion: '确认授权或替换素材',
      },
    ],
    recommendations: ['确认授权来源'],
    disclaimer: '仅用于版权/商标风险初筛，不构成法律意见或最终侵权判定。',
  }
}
