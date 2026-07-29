import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Select } from '@douyinfe/semi-ui'

export interface WorkspaceSelectOption<T extends string = string> {
  disabled?: boolean
  label: ReactNode
  value: T
}

export interface WorkspaceSelectProps<T extends string = string> {
  'aria-label'?: string
  'aria-labelledby'?: string
  className?: string
  defaultValue?: T
  disabled?: boolean
  emptyLabel?: ReactNode
  filter?: boolean
  id?: string
  name?: string
  onChange?: (value: T | '') => void
  options: ReadonlyArray<WorkspaceSelectOption<T>>
  placeholder?: ReactNode
  required?: boolean
  showClear?: boolean
  style?: CSSProperties
  value?: T | ''
}

export function WorkspaceSelect<T extends string = string>({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  defaultValue,
  disabled,
  emptyLabel,
  filter = false,
  id,
  name,
  onChange,
  options,
  placeholder,
  required,
  showClear = false,
  style,
  value,
}: WorkspaceSelectProps<T>) {
  const [uncontrolledValue, setUncontrolledValue] = useState<T | ''>(defaultValue ?? '')
  const fieldRef = useRef<HTMLSpanElement>(null)
  const generatedLabelId = useId()
  const resolvedLabelledBy = ariaLabel ? generatedLabelId : ariaLabelledBy
  const currentValue = value ?? uncontrolledValue
  const optionList = [
    ...(emptyLabel === undefined ? [] : [{ label: emptyLabel, value: '' }]),
    ...options,
  ].map((option) => ({ ...option, 'data-value': option.value }))

  function updateValue(nextValue: unknown) {
    const normalized = typeof nextValue === 'string' ? (nextValue as T | '') : ''
    if (value === undefined) setUncontrolledValue(normalized)
    onChange?.(normalized)
  }

  return (
    <span ref={fieldRef} className="workspace-select-field">
      {ariaLabel ? (
        <span id={generatedLabelId} className="workspace-visually-hidden">
          {ariaLabel}
        </span>
      ) : null}
      <Select<string>
        aria-labelledby={resolvedLabelledBy}
        aria-required={required}
        className={className}
        disabled={disabled}
        filter={filter}
        id={id}
        inputProps={required ? { 'aria-required': true } : undefined}
        motion={import.meta.env.MODE !== 'test'}
        onChange={updateValue}
        optionList={optionList}
        placeholder={placeholder}
        showClear={showClear && !required}
        style={{ width: '100%', ...style }}
        value={currentValue}
      />
      {required ? (
        <input
          aria-label={ariaLabel ? `${ariaLabel}（必填校验）` : '必填下拉校验'}
          className="workspace-select-field__validation"
          disabled={disabled}
          name={name}
          onChange={() => undefined}
          onInvalid={(event) => {
            event.preventDefault()
            fieldRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus()
          }}
          required
          tabIndex={-1}
          value={currentValue}
        />
      ) : name ? (
        <input disabled={disabled} type="hidden" name={name} value={currentValue} />
      ) : null}
    </span>
  )
}
