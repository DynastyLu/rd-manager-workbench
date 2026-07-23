import { WorkspaceFormSelect } from '@/components/workspace/WorkspaceFormSelect'
import { useEffect, useMemo, useState } from 'react'
import { Banner, Button, Modal, Toast } from '@douyinfe/semi-ui'
import {
  commitBaseImport,
  downloadBaseImportErrors,
  inspectBaseImport,
  previewBaseImport,
  uploadBaseImport,
} from '../api'
import type {
  BaseImportPreview,
  BaseImportPreviewResult,
  BaseImportSession,
  DataTable,
  ImportColumnMapping,
} from '../types'
import { uniqueImportFieldKey } from './import-utils'

const STEP_NAMES = ['选择文件', '选择工作表', '字段映射', '全量预检', '导入结果']

function saveDownload(download: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(download.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = download.fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ImportDialog({
  visible,
  table,
  onClose,
  onCompleted,
}: {
  visible: boolean
  table: DataTable
  onClose: () => void
  onCompleted: (session: BaseImportSession) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState(0)
  const [session, setSession] = useState<BaseImportSession | null>(null)
  const [source, setSource] = useState<BaseImportPreview | null>(null)
  const [sheet, setSheet] = useState('')
  const [mapping, setMapping] = useState<ImportColumnMapping[]>([])
  const [preflight, setPreflight] = useState<BaseImportPreviewResult | null>(null)
  const [result, setResult] = useState<BaseImportSession | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const fields = useMemo(() => table.fields ?? [], [table.fields])
  const writableFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          !['ATTACHMENT', 'LOOKUP', 'ROLLUP', 'FORMULA', 'CREATED_AT', 'UPDATED_AT'].includes(
            field.type,
          ),
      ),
    [fields],
  )

  useEffect(() => {
    if (visible) return
    setFile(null); setStep(0); setSession(null); setSource(null); setMapping([]); setPreflight(null); setResult(null); setError('')
  }, [visible])

  async function upload() {
    if (!file || pending) return
    setPending(true); setError('')
    try {
      const uploaded = await uploadBaseImport(table.id, file)
      setSession(uploaded.session); setSource(uploaded.preview); setSheet(uploaded.preview.selectedSheet)
      setMapping(mappingFor(uploaded.preview))
      setStep(uploaded.preview.sheetNames.length > 1 ? 1 : 2)
    } catch {
      setError('上传或解析失败，请确认文件格式、编码和大小。')
    } finally { setPending(false) }
  }

  function mappingFor(preview: BaseImportPreview): ImportColumnMapping[] {
    return preview.columns.map((column, index) => {
      const exact = writableFields.find((field) => field.name === column || field.key === column)
      const primary = index === 0 ? writableFields.find((field) => field.isPrimary) : undefined
      return exact || primary
        ? { sourceColumn: column, targetFieldId: (exact ?? primary)!.id }
        : { sourceColumn: column, ignored: true }
    })
  }

  async function inspectSheet() {
    if (!session || pending) return
    setPending(true); setError('')
    try {
      const inspected = await inspectBaseImport(session.id, sheet)
      setSource(inspected)
      setMapping(mappingFor(inspected))
      setPreflight(null)
      setStep(2)
    } catch {
      setError('工作表读取失败，请重新选择。')
    } finally {
      setPending(false)
    }
  }

  function updateMapping(index: number, value: string) {
    if (!source) return
    setMapping((current) => {
      const existingKeys = new Set([
        ...fields.map((field) => field.key),
        ...current.flatMap((item, itemIndex) =>
          itemIndex !== index && item.newField ? [item.newField.key] : [],
        ),
      ])
      return current.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        if (value === 'ignore') return { sourceColumn: item.sourceColumn, ignored: true }
        if (value.startsWith('field:')) return { sourceColumn: item.sourceColumn, targetFieldId: value.slice(6) }
        const type = value.slice(4) as ImportColumnMapping['newField'] extends infer N ? N extends { type: infer T } ? T : never : never
        return {
          sourceColumn: item.sourceColumn,
          newField: {
            name: item.newField?.name ?? item.sourceColumn,
            key:
              item.newField?.key ??
              uniqueImportFieldKey(existingKeys, `import_${index + 1}`),
            type,
          },
        }
      })
    })
    setPreflight(null)
  }

  function mappingValue(index: number) {
    const item = mapping[index]
    if (item?.targetFieldId) return `field:${item.targetFieldId}`
    if (item?.newField) return `new:${item.newField.type}`
    return 'ignore'
  }

  async function preview() {
    if (!session || pending) return
    setPending(true); setError('')
    try {
      const inspected = await previewBaseImport(session.id, { selectedSheet: sheet, mapping })
      setPreflight(inspected); setStep(3)
    } catch { setError('全量预检失败，请检查必填字段、字段类型和选项映射。') }
    finally { setPending(false) }
  }

  async function commit() {
    if (!session || !preflight || pending) return
    setPending(true); setError('')
    try {
      const committed = await commitBaseImport(session.id)
      setResult(committed); setStep(4); onCompleted(committed)
    } catch { setError('提交失败。已写入与失败行会按后端事务结果保留。') }
    finally { setPending(false) }
  }

  return (
    <Modal title={`导入到 ${table.name}`} visible={visible} footer={null} onCancel={onClose} width={760}>
      <div className="base-import-dialog">
        <ol className="base-import-dialog__steps">{STEP_NAMES.map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} className={index <= step ? 'is-active' : ''}><span>{index + 1}</span>{name}</li>)}</ol>
        {error ? <Banner type="danger" fullMode={false} description={error} closeIcon={null} /> : null}
        {step === 0 ? <section className="base-import-dialog__upload"><h3>选择 CSV 或 Excel 文件</h3><p>最大 20 MiB、50,000 行；数据只在本机解析。</p><input aria-label="选择导入文件" type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Button theme="solid" type="primary" disabled={!file} loading={pending} onClick={() => void upload()}>上传并继续</Button></section> : null}
        {step === 1 && source ? <section><h3>选择工作表</h3><WorkspaceFormSelect aria-label="工作表" value={sheet} onChange={(event) => setSheet(event.target.value)}>{source.sheetNames.map((name) => <option key={name}>{name}</option>)}</WorkspaceFormSelect><Button theme="solid" type="primary" loading={pending} onClick={() => void inspectSheet()}>继续字段映射</Button></section> : null}
        {step === 2 && source ? <section className="base-import-dialog__mapping"><header><h3>字段映射</h3><p>类型建议只用于参考；未映射列会被忽略。</p></header>{source.columns.map((column, index) => <label key={column}><span>{column}<small>建议 {source.inferredTypes[column]}</small></span><WorkspaceFormSelect aria-label={`${column} 映射`} value={mappingValue(index)} onChange={(event) => updateMapping(index, event.target.value)}><option value="ignore">忽略此列</option>{writableFields.map((field) => <option key={field.id} value={`field:${field.id}`}>{field.name} · {field.type}</option>)}<option value="new:TEXT">新建文本字段</option><option value="new:LONG_TEXT">新建多行文本字段</option><option value="new:NUMBER">新建数字字段</option><option value="new:DATETIME">新建日期字段</option><option value="new:SINGLE_SELECT">新建单选字段</option><option value="new:MULTI_SELECT">新建多选字段</option><option value="new:CHECKBOX">新建勾选字段</option><option value="new:LINK">新建链接字段</option></WorkspaceFormSelect></label>)}<Button theme="solid" type="primary" loading={pending} onClick={() => void preview()}>全量预检</Button></section> : null}
        {step === 3 && preflight ? <section className="base-import-dialog__preflight"><h3>全量预检完成</h3><div><strong>有效 {preflight.session.validRows} 行</strong><strong>错误 {preflight.session.errorRows} 行</strong><strong>总计 {preflight.session.totalRows} 行</strong></div>{preflight.errors.length ? <ul>{preflight.errors.slice(0, 10).map((item) => <li key={item.rowNumber}>第 {item.rowNumber} 行：{item.message}</li>)}</ul> : <p>没有发现阻断错误，可以安全导入。</p>}<div><Button onClick={() => { setStep(2); setPreflight(null) }}>返回修改映射</Button><Button theme="solid" type="primary" loading={pending} onClick={() => void commit()}>确认导入</Button></div></section> : null}
        {step === 4 && result ? <section className="base-import-dialog__result"><span>✓</span><h3>{result.status === 'PARTIAL' ? '部分导入完成' : result.status === 'FAILED' ? '导入失败' : '导入完成'}</h3><p>成功导入 {result.importedRows} 行</p><p>失败 {result.errorRows} 行</p>{result.hasErrors ? <Button onClick={() => void downloadBaseImportErrors(result.id).then(saveDownload).catch(() => Toast.error('错误行下载失败。'))}>下载错误行</Button> : null}<Button theme="solid" type="primary" onClick={onClose}>完成</Button></section> : null}
      </div>
    </Modal>
  )
}
