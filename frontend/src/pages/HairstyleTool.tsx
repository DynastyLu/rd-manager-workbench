import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, ImagePlus, Loader2, Shuffle, Sparkles, Wand2 } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  HAIRSTYLE_OPTIONS,
  hairstyleService,
  type HairStyleId,
  type HairstyleTransformResult,
} from '@/services/hairstyle'

const panelStyle = {
  border: '1px solid var(--border-color)',
  background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-panel))',
  boxShadow: '0 18px 54px rgba(0,0,0,0.22)',
  borderRadius: 8,
} as const

export default function HairstyleTool() {
  const [image, setImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedStyle, setSelectedStyle] = useState<HairStyleId>('short-bob')
  const [result, setResult] = useState<HairstyleTransformResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTransforming, setIsTransforming] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const selectedOption = useMemo(
    () => HAIRSTYLE_OPTIONS.find((option) => option.id === selectedStyle) ?? HAIRSTYLE_OPTIONS[0],
    [selectedStyle]
  )

  const handleImageChange = (file: File | null) => {
    setError(null)
    setResult(null)
    setImage(file)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const handleRandomStyle = () => {
    const candidates = HAIRSTYLE_OPTIONS.filter((option) => option.id !== selectedStyle)
    const nextOption =
      candidates[Math.floor(Math.random() * candidates.length)] ?? HAIRSTYLE_OPTIONS[0]
    setSelectedStyle(nextOption.id)
    setResult(null)
  }

  const handleTransform = async () => {
    if (!image) {
      setError('请先上传头像')
      return
    }

    setIsTransforming(true)
    setError(null)
    try {
      const response = await hairstyleService.transform({ image, style: selectedStyle })
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发型变换失败')
    } finally {
      setIsTransforming(false)
    }
  }

  const handleDownload = () => {
    if (!result) return
    const link = document.createElement('a')
    link.href = result.data.imageUrl
    link.download = `hairstyle-${result.data.style}.svg`
    link.click()
  }

  return (
    <div className="app-page app-page--hairstyle">
      <div className="app-page__inner">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Player Look Studio</p>
            <h1 className="app-page__title">一键换发型</h1>
            <p className="app-page__subtitle">上传头像，选择风格，生成新的发型预览。</p>
          </div>
          <div className="app-page__meta">
            <span className="app-page__chip">{HAIRSTYLE_OPTIONS.length} 种风格</span>
            <span className="app-page__chip">{selectedOption.label}</span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: 18,
            alignItems: 'stretch',
          }}
        >
          <section className="tool-panel" style={{ ...panelStyle, padding: 18 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                border: '1px dashed var(--border-active)',
                borderRadius: 8,
                background: previewUrl
                  ? `linear-gradient(rgba(5,5,16,0.04), rgba(5,5,16,0.04)), url(${previewUrl}) center / cover`
                  : 'linear-gradient(135deg, rgba(246,208,93,0.12), rgba(36,193,107,0.1)), var(--bg-panel)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
              }}
            >
              {!previewUrl && (
                <span style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
                  <ImagePlus size={34} color="var(--accent-gold)" />
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>上传头像</span>
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="上传头像文件"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(event) => handleImageChange(event.target.files?.[0] ?? null)}
            />

            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              {HAIRSTYLE_OPTIONS.map((option) => {
                const isSelected = selectedStyle === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setSelectedStyle(option.id)
                      setResult(null)
                    }}
                    style={{
                      minHeight: 48,
                      border: `1px solid ${isSelected ? option.tone : 'var(--border-color)'}`,
                      borderRadius: 8,
                      background: isSelected
                        ? 'linear-gradient(90deg, rgba(246,208,93,0.14), rgba(36,193,107,0.1))'
                        : 'rgba(255,255,255,0.03)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 14px',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          background: option.tone,
                          boxShadow: `0 0 14px ${option.tone}`,
                        }}
                      />
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{option.label}</span>
                    </span>
                    {isSelected && <Sparkles size={16} color={option.tone} />}
                  </button>
                )
              })}
            </div>
          </section>

          <section
            className="tool-panel"
            style={{
              ...panelStyle,
              padding: 18,
              display: 'grid',
              gridTemplateRows: 'auto 1fr auto',
              minHeight: 520,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>当前风格</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: selectedOption.tone }}>
                  {selectedOption.label}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRandomStyle}
                title="随机切换"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'rgba(246,208,93,0.08)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Shuffle size={18} />
              </button>
            </div>

            <div
              style={{
                marginTop: 18,
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.04), transparent), repeating-linear-gradient(90deg, rgba(255,255,255,0.024) 0 1px, transparent 1px 74px), rgba(0,0,0,0.18)',
                minHeight: 340,
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
              }}
            >
              {result ? (
                <motion.img
                  src={result.data.imageUrl}
                  alt={`${result.data.label} 发型结果`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Wand2 size={40} color="var(--accent-gold)" />
                  <div style={{ marginTop: 12, fontSize: 14 }}>等待生成</div>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  void handleTransform()
                }}
                disabled={isTransforming}
                style={{
                  minHeight: 44,
                  border: '1px solid var(--border-active)',
                  borderRadius: 8,
                  background: 'linear-gradient(90deg, var(--accent-gold), var(--accent-green))',
                  color: 'var(--text-inverse)',
                  cursor: isTransforming ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 18px',
                  fontWeight: 800,
                }}
              >
                {isTransforming ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Wand2 size={18} />
                )}
                一键换发型
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!result}
                style={{
                  minHeight: 44,
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  background: result ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                  color: result ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: result ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 16px',
                }}
              >
                <Download size={18} />
                下载结果
              </button>
              {error && <span style={{ color: 'var(--accent-pink)', fontSize: 13 }}>{error}</span>}
              {result?.mode === 'demo' && (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>演示模式</span>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
