import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSelect } from '../WorkspaceSelect'
import { WorkspaceFormSelect } from '../WorkspaceFormSelect'
import { WorkspaceFormActions } from '../WorkspaceForm'
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Input,
} from '../SemiCompat'

describe('WorkspaceSelect', () => {
  it('uses the Semi combobox and keeps the submitted field value in sync', () => {
    const { container, rerender } = render(
      <WorkspaceSelect
        aria-label="状态"
        name="status"
        value="DRAFT"
        options={[
          { value: 'DRAFT', label: '草稿' },
          { value: 'ACTIVE', label: '进行中' },
        ]}
      />,
    )

    expect(container.querySelector('select')).not.toBeInTheDocument()
    expect(container.querySelector('input[type="hidden"][name="status"]')).toHaveValue('DRAFT')

    rerender(
      <WorkspaceSelect
        aria-label="状态"
        name="status"
        value="ACTIVE"
        options={[
          { value: 'DRAFT', label: '草稿' },
          { value: 'ACTIVE', label: '进行中' },
        ]}
      />,
    )
    expect(container.querySelector('input[type="hidden"][name="status"]')).toHaveValue('ACTIVE')
  })

  it('renders an explicit empty option for optional fields', () => {
    render(
      <WorkspaceSelect
        aria-label="负责人"
        value=""
        emptyLabel="未指定"
        options={[{ value: 'owner-1', label: '负责人一' }]}
      />,
    )

    expect(screen.getByRole('combobox', { name: '负责人' })).toHaveTextContent('未指定')
  })

  it('enforces required values and omits disabled values from native form data', () => {
    const { container } = render(
      <form>
        <WorkspaceSelect
          aria-label="来源"
          name="sourceId"
          required
          value=""
          options={[{ value: 'source-1', label: '行业协会' }]}
        />
        <WorkspaceSelect
          aria-label="禁用状态"
          name="disabledStatus"
          disabled
          value="ARCHIVED"
          options={[{ value: 'ARCHIVED', label: '已归档' }]}
        />
      </form>,
    )

    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.checkValidity()).toBe(false)
    expect(new FormData(form!).has('disabledStatus')).toBe(false)
  })
})

describe('WorkspaceFormSelect', () => {
  it('adapts declarative option children to the Semi control without a native select', () => {
    const { container } = render(
      <WorkspaceFormSelect aria-label="导出格式" name="format" defaultValue="xlsx">
        <option value="xlsx">Excel</option>
        <option value="csv">CSV</option>
      </WorkspaceFormSelect>,
    )

    expect(container.querySelector('select')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '导出格式' })).toHaveTextContent('Excel')
    expect(container.querySelector('input[name="format"]')).toHaveValue('xlsx')
  })
})

describe('WorkspaceFormActions', () => {
  it('keeps secondary and primary actions inside a named footer region', () => {
    render(
      <WorkspaceFormActions
        cancelText="取消"
        submitText="保存"
        onCancel={vi.fn()}
        submitting
      />,
    )

    expect(screen.getByRole('group', { name: '表单操作' })).toHaveClass('workspace-modal-footer')
    expect(screen.getByRole('button', { name: '取消' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })
})

describe('Semi compatibility components', () => {
  it('keeps uncontrolled input values available to native form submission', async () => {
    const submit = vi.fn()
    const user = userEvent.setup()
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit(new FormData(event.currentTarget).get('title'))
        }}
      >
        <Input name="title" required placeholder="标题" />
        <Button type="submit">保存</Button>
      </form>,
    )

    await user.type(screen.getByPlaceholderText('标题'), '供应链延期')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(submit).toHaveBeenCalledWith('供应链延期')
  })

  it('opens a Semi modal through the existing compound dialog contract', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>新建记录</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>新建记录</DialogTitle>
          <p>表单内容</p>
        </DialogContent>
      </Dialog>,
    )

    await user.click(screen.getByRole('button', { name: '新建记录' }))

    expect(await screen.findByRole('dialog', { name: '新建记录' })).toHaveTextContent('表单内容')
  })
})
