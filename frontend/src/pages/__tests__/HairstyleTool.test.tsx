import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HairstyleTool from '../HairstyleTool'
import { hairstyleService } from '@/services/hairstyle'

vi.mock('@/services/hairstyle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/hairstyle')>()
  return {
    ...actual,
    hairstyleService: {
      transform: vi.fn(),
    },
  }
})

describe('HairstyleTool', () => {
  beforeEach(() => {
    vi.mocked(hairstyleService.transform).mockReset()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:portrait-preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('renders upload entry and hairstyle options', () => {
    render(<HairstyleTool />)

    expect(screen.getByRole('heading', { name: '一键换发型' })).toBeTruthy()
    expect(screen.getByText('上传头像')).toBeTruthy()
    expect(screen.getByRole('button', { name: /短波波/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /空气刘海/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /长卷发/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /银灰狼尾/ })).toBeTruthy()
  }, 10_000)

  it('uploads a portrait and renders transform result', async () => {
    vi.mocked(hairstyleService.transform).mockResolvedValueOnce({
      success: true,
      mode: 'demo',
      data: {
        imageUrl: 'data:image/svg+xml;base64,result',
        style: 'short-bob',
        label: '短波波',
      },
    })

    render(<HairstyleTool />)
    const file = new File(['portrait'], 'portrait.jpg', { type: 'image/jpeg' })

    await userEvent.upload(screen.getByLabelText('上传头像文件'), file)
    await userEvent.click(screen.getByRole('button', { name: '一键换发型' }))

    await waitFor(() => {
      expect(hairstyleService.transform).toHaveBeenCalledWith({ image: file, style: 'short-bob' })
    })
    expect(await screen.findByAltText('短波波 发型结果')).toBeTruthy()
  })
})
