import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react'
import { DatePicker } from '@douyinfe/semi-ui'

type PickerMode = 'date' | 'dateTime'

interface DateTimePickerFieldProps {
  'aria-label'?: string
  'aria-labelledby'?: string
  className?: string
  defaultValue?: string
  disabled?: boolean
  id?: string
  mode?: PickerMode
  name?: string
  onChange?: (value: string) => void
  placeholder?: string
  required?: boolean
  value?: string
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function parseLocalValue(value: string | undefined, mode: PickerMode) {
  if (!value) return undefined
  const match = mode === 'date'
    ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }
  const [, year, month, day, hour = '00', minute = '00'] = match
  const result = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  return Number.isNaN(result.getTime()) ? undefined : result
}

function serializeLocalValue(value: unknown, mode: PickerMode) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return ''
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  return mode === 'date' ? date : `${date}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function normalizeTypedValue(value: string, mode: PickerMode) {
  if (mode === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})$/.exec(value)
  return match ? `${match[1]}T${match[2]}:${match[3]}` : undefined
}

export function DateTimePickerField({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  defaultValue = '',
  disabled,
  id,
  mode = 'dateTime',
  name,
  onChange,
  placeholder,
  required,
  value,
}: DateTimePickerFieldProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const pickerRef = useRef<ComponentRef<typeof DatePicker>>(null)
  const currentValue = value ?? uncontrolledValue

  const commitValue = useCallback((serialized: string) => {
    if (value === undefined) setUncontrolledValue(serialized)
    onChange?.(serialized)
  }, [onChange, value])

  useEffect(() => {
    const input = pickerRef.current?.inputRef?.current
    if (!input) return
    if (id) input.id = id
    if (ariaLabel) input.setAttribute('aria-label', ariaLabel)
    if (ariaLabelledBy) input.setAttribute('aria-labelledby', ariaLabelledBy)
    if (required) input.setAttribute('aria-required', 'true')
    const handleTypedValue = (event: Event) => {
      const nextValue = normalizeTypedValue((event.target as HTMLInputElement).value, mode)
      if (nextValue !== undefined) commitValue(nextValue)
    }
    input.addEventListener('input', handleTypedValue)
    input.addEventListener('change', handleTypedValue)
    return () => {
      input.removeEventListener('input', handleTypedValue)
      input.removeEventListener('change', handleTypedValue)
    }
  }, [ariaLabel, ariaLabelledBy, commitValue, id, mode, required])

  const updateValue = (nextValue: unknown) => {
    const serialized = serializeLocalValue(nextValue, mode)
    commitValue(serialized)
  }

  return (
    <>
      <DatePicker
        ref={pickerRef}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={className}
        disabled={disabled}
        type={mode}
        format={mode === 'date' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm'}
        value={parseLocalValue(currentValue, mode)}
        onChange={updateValue}
        placeholder={placeholder ?? (mode === 'date' ? '选择日期' : '选择日期和时间')}
        showClear={!required}
        style={{ width: '100%' }}
      />
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}
    </>
  )
}
