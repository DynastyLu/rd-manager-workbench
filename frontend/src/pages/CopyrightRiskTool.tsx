import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  ScanLine,
  ShieldAlert,
  Target,
  UploadCloud,
  X,
} from 'lucide-react'
import { motion } from 'framer-motion'
import {
  copyrightRiskService,
  type CopyrightRiskAnalysisResult,
  type CopyrightRiskLevel,
  type CopyrightRiskRegion,
} from '@/services/copyrightRisk'

type UploadStatus = 'queued' | 'processing' | 'done' | 'error'

interface UploadItem {
  id: string
  file: File
  previewUrl: string
  status: UploadStatus
  result?: CopyrightRiskAnalysisResult
  error?: string
  jobId?: string
}

const levelLabel: Record<CopyrightRiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重风险',
}

const levelTone: Record<CopyrightRiskLevel, string> = {
  low: '#24c16b',
  medium: '#f6d05d',
  high: '#ff8a3d',
  critical: '#f04d4d',
}

const elementTypeLabel: Record<string, string> = {
  person: '人物',
  logo: '品牌标识',
  text: '文字',
  product: '商品',
  character: '角色',
  artwork: '作品',
  scene: '场景',
  other: '其他',
}

const rightTypeLabel: Record<string, string> = {
  copyright: '著作权',
  trademark: '商标权',
  portrait: '肖像权',
  font: '字体版权',
  source: '来源授权',
  publicity: '商业宣传权',
  other: '其他权利',
}

const usageScenarioLabel: Record<string, string> = {
  internal: '内部使用',
  'social-media': '自媒体发布',
  ecommerce: '电商详情',
  advertising: '广告投放',
  print: '印刷物料',
  other: '其他场景',
}

const riskTypeLabel: Record<string, string> = {
  trademark: '商标风险',
  character: '角色版权',
  watermark: '水印版权',
  artwork: '作品版权',
  portrait: '肖像风险',
  'unclear-source': '来源不明',
}

const textTranslations: Record<string, string> = {
  '疑似品牌/logo': '疑似品牌标识',
  '画面右上角出现疑似商业品牌 logo。': '画面右上角出现疑似商业品牌标识。',
  '图片名称或上下文包含品牌、商标或 logo 线索。': '图片名称或上下文包含品牌、商标或品牌标识线索。',
  '核验品牌授权、移除 logo，或替换为自有/可商用素材。':
    '核验品牌授权、移除品牌标识，或替换为自有/可商用素材。',
  'cartoon skull with oversized eyes': '大眼卡通骷髅头',
  'black-and-white portrait photographs': '黑白肖像照片',
  'gilded baroque-style photo frames': '镀金巴洛克风格相框',
  'brass candle holders': '黄铜烛台',
  'bell jar display dome': '玻璃展示罩',
  'dark purple cloth tabletop with a stylized skull, candle holders, portrait photos and gilded frames.':
    '深紫色桌布上摆放了风格化骷髅头、烛台、肖像照片和镀金相框。',
  'stylized beige skull with exaggerated large white eyes.':
    '米色风格化骷髅头，白色大眼造型夸张，具有明显卡通化表达。',
  'elaborately carved gold-colored frames with floral motifs.':
    '金色相框带有复杂花纹雕刻，属于常见装饰性道具。',
  'skull with oversized eyes and expressive mouth resembles known stylized characters.':
    '大眼骷髅头和夸张嘴部表情可能接近已知风格化角色。',
  'potential substantial similarity risk.': '存在被认定为实质性相似的潜在风险。',
  'conduct thorough reverse image search.': '进行完整反向搜图，并保留素材来源和授权证明。',
  'use only if generated via licensed platform.':
    '仅在确认由已授权平台生成并具备商用授权时使用。',
}

interface ReportRow {
  id: string
  source: string
  name: string
  category: string
  level: CopyrightRiskLevel
  score: number
  evidence: string
  suggestion: string
}

export default function CopyrightRiskTool() {
  const [items, setItems] = useState<UploadItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const itemsRef = useRef<UploadItem[]>([])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    }
  }, [])

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  )

  const stats = useMemo(() => {
    const done = items.filter((item) => item.status === 'done').length
    const maxScore = Math.max(0, ...items.map((item) => item.result?.riskScore ?? 0))
    const active = items.some((item) => item.status === 'processing')
    return { done, maxScore, active }
  }, [items])

  const handleFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/')).slice(0, 20)
    if (!files.length) {
      setBatchError('请上传 JPG、PNG 或 WEBP 图片')
      return
    }

    const nextItems = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'queued' as const,
    }))
    setItems((current) => [...current, ...nextItems].slice(0, 20))
    setSelectedId((current) => current ?? nextItems[0]?.id ?? null)
    setBatchError(null)
  }

  const removeItem = (id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      const next = current.filter((item) => item.id !== id)
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null)
      }
      return next
    })
  }

  const analyze = async () => {
    const batchItems = items.filter((item) => item.status !== 'processing')
    if (!batchItems.length) {
      setBatchError('请先上传需要检测的图片')
      return
    }

    setBatchError(null)
    setItems((current) =>
      current.map((item) =>
        batchItems.some((batchItem) => batchItem.id === item.id)
          ? { ...item, status: 'processing', error: undefined, result: undefined }
          : item
      )
    )

    let batch
    try {
      batch = await copyrightRiskService.createBatch(batchItems.map((item) => item.file))
    } catch (error) {
      const message = error instanceof Error ? error.message : '版权风险任务创建失败'
      setBatchError(message)
      setItems((current) =>
        current.map((item) =>
          batchItems.some((batchItem) => batchItem.id === item.id)
            ? { ...item, status: 'error', error: message }
            : item
        )
      )
      return
    }

    const jobsByItemId = new Map(batch.jobs.map((job, index) => [batchItems[index]?.id, job]))
    setItems((current) =>
      current.map((item) => {
        const job = jobsByItemId.get(item.id)
        return job ? { ...item, jobId: job.jobId } : item
      })
    )

    const settled = await Promise.allSettled(
      batchItems.map(async (item) => {
        const job = jobsByItemId.get(item.id)
        if (!job) {
          throw new Error('版权风险任务创建失败')
        }
        try {
          const completedItem = await copyrightRiskService.waitForResult(job)
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? {
                    ...currentItem,
                    status: 'done',
                    jobId: completedItem.jobId,
                    result: completedItem.result,
                    error: undefined,
                  }
                : currentItem
            )
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : '版权风险分析失败'
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? { ...currentItem, status: 'error', error: message, result: undefined }
                : currentItem
            )
          )
          throw error
        }
      })
    )

    const failedCount = settled.filter((result) => result.status === 'rejected').length
    if (failedCount > 0) {
      setBatchError(`${failedCount} 张图片暂未完成，其他图片结果已正常展示`)
    }
    if (failedCount === 0) {
      setBatchError(null)
    }
  }

  return (
    <div className="app-page app-page--copyright">
      <div className="app-page__inner app-page__inner--wide">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">版权风控室</p>
            <h1 className="app-page__title">图片侵权风险检测</h1>
            <p className="app-page__subtitle">批量上传图片，标出疑似版权、商标、肖像风险点。</p>
          </div>
          <div className="app-page__meta" aria-label="版权风险检测统计">
            <span className="app-page__chip">{items.length} 张图片</span>
            <span className="app-page__chip">{stats.done} 张完成</span>
            <span className="app-page__chip">最高 {stats.maxScore} 分</span>
          </div>
        </div>

        <div className="copyright-workbench">
          <section className="copyright-sidebar tool-panel">
            <div
              className={`copyright-dropzone${isDragging ? ' copyright-dropzone--active' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragging(false)
                handleFiles(event.dataTransfer.files)
              }}
            >
              <UploadCloud size={34} />
              <div>
                <strong>批量上传</strong>
                <span>最多 20 张图片</span>
              </div>
              <button
                type="button"
                className="action-button"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={16} />
                选择图片
              </button>
              <input
                ref={fileInputRef}
                type="file"
                aria-label="批量上传图片"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(event) => handleFiles(event.target.files ?? [])}
              />
            </div>

            {batchError && (
              <div className="copyright-alert" role="alert">
                <AlertTriangle size={16} />
                <span>{batchError}</span>
              </div>
            )}

            <button
              type="button"
              className="action-button action-button--primary copyright-start"
              disabled={!items.length || stats.active}
              onClick={() => void analyze()}
            >
              {stats.active ? <Loader2 className="copyright-spin" size={17} /> : <ScanLine size={17} />}
              开始检测
            </button>

            <div className="copyright-file-list" aria-label="上传图片列表">
              {items.length === 0 ? (
                <div className="copyright-empty">
                  <ShieldAlert size={28} />
                  <span>等待图片入场</span>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="copyright-file-row">
                    <button
                      type="button"
                      className={`copyright-file${selectedItem?.id === item.id ? ' copyright-file--active' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <img src={item.previewUrl} alt={item.file.name} />
                      <span className="copyright-file__main">
                        <span className="copyright-file__name">{item.file.name}</span>
                        <span className="copyright-file__status">
                          {statusIcon(item.status)}
                          {statusText(item)}
                        </span>
                      </span>
                      <span
                        className="copyright-file__score"
                        style={{
                          color: item.result
                            ? levelTone[item.result.riskLevel]
                            : 'var(--text-muted)',
                        }}
                      >
                        {item.result ? item.result.riskScore : '--'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="copyright-file__remove"
                      title="移除"
                      onClick={() => {
                        removeItem(item.id)
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="copyright-stage tool-panel">
            {selectedItem ? (
              <>
                <div className="copyright-stage__header">
                  <div>
                    <span className="copyright-kicker">当前图片</span>
                    <h2>{selectedItem.file.name}</h2>
                  </div>
                  {selectedItem.result && (
                    <div
                      className="copyright-score"
                      style={{ borderColor: levelTone[selectedItem.result.riskLevel] }}
                    >
                      <strong style={{ color: levelTone[selectedItem.result.riskLevel] }}>
                        {selectedItem.result.riskScore}
                      </strong>
                      <span>{levelLabel[selectedItem.result.riskLevel]}</span>
                    </div>
                  )}
                </div>

                <div className="copyright-preview">
                  <img src={selectedItem.previewUrl} alt={`${selectedItem.file.name} 风险预览`} />
                  {selectedItem.status === 'processing' && (
                    <div className="copyright-processing">
                      <Loader2 className="copyright-spin" size={26} />
                      <span>分析中</span>
                    </div>
                  )}
                  {selectedItem.result?.regions.map((region) => (
                    <RiskBox key={region.id} region={region} />
                  ))}
                </div>
              </>
            ) : (
              <div className="copyright-empty copyright-empty--stage">
                <UploadCloud size={42} />
                <span>上传图片后查看风险标注</span>
              </div>
            )}
          </section>

          <section className="copyright-report-panel tool-panel" aria-label="风险报告">
            {selectedItem ? (
              <ReportPanel item={selectedItem} />
            ) : (
              <div className="copyright-empty copyright-empty--stage">
                <ShieldAlert size={34} />
                <span>上传图片后查看分析报告</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function ReportPanel({ item }: { item: UploadItem }) {
  if (!item.result) {
    return (
      <>
        <div className="copyright-report-panel__header">
          <div>
            <span className="copyright-kicker">分析报告</span>
            <h2>{item.status === 'processing' ? '正在生成报告' : '等待检测'}</h2>
          </div>
        </div>
        <div className="copyright-empty copyright-empty--stage">
          <ShieldAlert size={34} />
          <span>点击开始检测后，这里会显示表格化风险报告</span>
        </div>
      </>
    )
  }

  const rows = buildReportRows(item.result)

  return (
    <>
      <div className="copyright-report-panel__header">
        <div>
          <span className="copyright-kicker">分析报告</span>
          <h2>风险明细</h2>
        </div>
        <div className="copyright-score" style={{ borderColor: levelTone[item.result.riskLevel] }}>
          <strong style={{ color: levelTone[item.result.riskLevel] }}>{item.result.riskScore}</strong>
          <span>{levelLabel[item.result.riskLevel]}</span>
        </div>
      </div>

      <div className="copyright-report-scroll">
        <section className="copyright-report-summary">
          <div className="copyright-summary">
            <Target size={18} />
            <span>{localizeText(item.result.summary, '智能分析已完成整图版权风险识别。')}</span>
          </div>
          <div className="copyright-report-badges">
            <span>{item.result.provider === 'anthropic-compatible' ? '阿里百炼兼容接口' : '智能视觉模型'}</span>
            <span>{item.result.analysisScope === 'full-image' ? '整图分析' : '文件名规则分析'}</span>
            {item.result.needsHumanReview && <em>需要人工复核</em>}
          </div>
          <p>
            {localizeText(
              item.result.imageDescription,
              item.result.mode === 'ai'
                ? '智能模型已完成整张图片视觉识别，详细风险见下方表格。'
                : '当前为规则初筛结果，建议结合人工复核确认。'
            )}
          </p>
          {item.result.detectedText?.length ? (
            <div className="copyright-ai-report__chips" aria-label="图片文字识别结果">
              {item.result.detectedText.map((text) => (
                <span key={text}>{localizeText(text, '图片文字')}</span>
              ))}
            </div>
          ) : null}
        </section>

        <table className="copyright-report-table" aria-label="风险分析表">
          <caption>风险分析表</caption>
          <thead>
            <tr>
              <th>排名</th>
              <th>风险项</th>
              <th>类别</th>
              <th>风险等级</th>
              <th>依据与建议</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td>{index + 1}</td>
                <td>
                  <strong>{row.name}</strong>
                  <span>{row.source}</span>
                </td>
                <td>{row.category}</td>
                <td className="copyright-report-table__risk">
                  <strong data-testid="copyright-report-score">{row.score}</strong>
                  <span className="copyright-report-table__level" style={{ color: levelTone[row.level] }}>
                    {levelLabel[row.level]}
                  </span>
                </td>
                <td>
                  <p>{row.evidence}</p>
                  <em>{row.suggestion}</em>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="copyright-report-actions" aria-label="处理建议">
          <h3>处理建议</h3>
          <div>
            {item.result.recommendations.map((recommendation) => (
              <span key={recommendation}>
                <CheckCircle2 size={15} />
                {localizeText(recommendation, '保留来源证明，必要时替换素材。')}
              </span>
            ))}
          </div>
        </section>

        <p className="copyright-disclaimer">{item.result.disclaimer}</p>
      </div>
    </>
  )
}

function buildReportRows(result: CopyrightRiskAnalysisResult): ReportRow[] {
  const rows: ReportRow[] = [
    ...result.regions.map((region) => ({
      id: `region-${region.id}`,
      source: '标注区域',
      name: localizeText(region.label, riskTypeLabel[region.riskType] ?? '风险区域'),
      category: riskTypeLabel[region.riskType] ?? '风险区域',
      level: region.severity,
      score: scoreFromLevel(region.severity, region.confidence),
      evidence: localizeText(region.reason, '图像中存在需要复核的风险区域。'),
      suggestion: localizeText(region.suggestion, '确认授权来源，必要时替换或裁切该区域。'),
    })),
    ...(result.visualElements ?? []).map((element) => ({
      id: `visual-${element.id}`,
      source: '视觉元素',
      name: localizeText(element.label, `${elementTypeLabel[element.type] ?? '视觉'}风险项`),
      category: elementTypeLabel[element.type] ?? '视觉元素',
      level: element.riskLevel,
      score: scoreFromLevel(element.riskLevel, element.confidence),
      evidence: localizeText(element.description, '智能模型识别到该视觉元素存在版权或来源复核价值。'),
      suggestion: suggestionForLevel(element.riskLevel),
    })),
    ...(result.rightsRisks ?? []).map((risk) => ({
      id: `right-${risk.id}`,
      source: '权利风险',
      name: rightTypeLabel[risk.rightType] ?? '权利风险',
      category: '权利风险',
      level: risk.riskLevel,
      score: scoreFromLevel(risk.riskLevel),
      evidence: localizeText(
        [risk.evidence, risk.explanation].filter(Boolean).join(' '),
        '该项可能涉及版权、商标、肖像或来源授权风险。'
      ),
      suggestion: localizeText(risk.recommendation, '上线或商用前请完成人工授权复核。'),
    })),
    ...(result.usageAssessments ?? []).map((assessment) => ({
      id: `usage-${assessment.scenario}`,
      source: '使用场景',
      name: usageScenarioLabel[assessment.scenario] ?? '使用场景',
      category: '场景建议',
      level: assessment.riskLevel,
      score: scoreFromLevel(assessment.riskLevel),
      evidence: localizeText(assessment.advice, '该使用场景需要结合授权范围复核。'),
      suggestion: suggestionForLevel(assessment.riskLevel),
    })),
  ]

  if (!rows.length) {
    rows.push({
      id: 'summary',
      source: '整图结论',
      name: '来源复核',
      category: '整体风险',
      level: result.riskLevel,
      score: result.riskScore,
      evidence: localizeText(result.summary, '未发现明确高风险元素，但仍需确认图片来源。'),
      suggestion: '保留图片来源、授权记录和生成记录。',
    })
  }

  return rows.sort((a, b) => b.score - a.score)
}

function scoreFromLevel(level: CopyrightRiskLevel, confidence = 0.72) {
  const baseScore: Record<CopyrightRiskLevel, number> = {
    critical: 92,
    high: 78,
    medium: 54,
    low: 18,
  }
  return Math.min(100, Math.round(baseScore[level] + Math.max(0, Math.min(1, confidence)) * 10))
}

function suggestionForLevel(level: CopyrightRiskLevel) {
  if (level === 'critical' || level === 'high') {
    return '商用前必须确认授权，无法确认时替换素材。'
  }
  if (level === 'medium') {
    return '建议补充来源证明，并进行人工复核。'
  }
  return '保留来源记录，常规使用前抽样复核。'
}

function localizeText(value: string | undefined, fallback: string) {
  const text = value?.trim()
  if (!text) {
    return fallback
  }
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  if (textTranslations[normalized]) {
    return textTranslations[normalized]
  }
  if (/[\u4e00-\u9fff]/.test(text)) {
    return text.replace(/\bLogo\b/gi, '品牌标识').replace(/\bIP\b/g, '知识产权').replace(/\bAI\b/g, '智能分析')
  }
  return textTranslations[normalized] ?? fallback
}

function RiskBox({ region }: { region: CopyrightRiskRegion }) {
  const tone = levelTone[region.severity]
  const label = localizeText(region.label, riskTypeLabel[region.riskType] ?? '风险区域')
  const reason = localizeText(region.reason, '检测到需要复核的版权风险线索。')
  return (
    <motion.button
      type="button"
      className="copyright-risk-box"
      title={`${label}：${reason}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        left: `${region.x}%`,
        top: `${region.y}%`,
        width: `${region.width}%`,
        height: `${region.height}%`,
        borderColor: tone,
        color: tone,
      }}
    >
      <span>{label}</span>
    </motion.button>
  )
}

function statusIcon(status: UploadStatus) {
  if (status === 'processing') return <Loader2 className="copyright-spin" size={13} />
  if (status === 'done') return <CheckCircle2 size={13} />
  if (status === 'error') return <AlertTriangle size={13} />
  return <ShieldAlert size={13} />
}

function statusText(item: UploadItem) {
  if (item.status === 'processing') return '检测中'
  if (item.status === 'done') return item.result ? levelLabel[item.result.riskLevel] : '已完成'
  if (item.status === 'error') return item.error || '检测失败'
  return '待检测'
}
