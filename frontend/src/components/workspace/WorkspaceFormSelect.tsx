import {
  Children,
  isValidElement,
  type CSSProperties,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react'
import { WorkspaceSelect } from './WorkspaceSelect'

interface NativeOptionProps {
  children?: ReactNode
  disabled?: boolean
  value?: string | number
}

interface WorkspaceFormSelectProps {
  'aria-label'?: string
  'aria-labelledby'?: string
  children: ReactNode
  className?: string
  defaultValue?: string
  disabled?: boolean
  id?: string
  name?: string
  onChange?: (event: { target: { value: string } }) => void
  onKeyDown?: KeyboardEventHandler<HTMLSpanElement>
  onPointerDown?: PointerEventHandler<HTMLSpanElement>
  required?: boolean
  style?: CSSProperties
  value?: string
}

function optionText(children: ReactNode): string {
  return Children.toArray(children)
    .filter((child): child is string | number => ['string', 'number'].includes(typeof child))
    .join('')
}

export function WorkspaceFormSelect({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  children,
  className,
  defaultValue,
  disabled,
  id,
  name,
  onChange,
  onKeyDown,
  onPointerDown,
  required,
  style,
  value,
}: WorkspaceFormSelectProps) {
  const options = Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child) || child.type !== 'option') return []
    const option = child as ReactElement<NativeOptionProps>
    const label = option.props.children ?? ''
    const fallbackValue = optionText(label)
    return [{
      disabled: option.props.disabled,
      label,
      value: String(option.props.value ?? fallbackValue),
    }]
  })

  return (
    <span role="presentation" onKeyDown={onKeyDown} onPointerDown={onPointerDown}>
      <WorkspaceSelect
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={className}
        defaultValue={defaultValue}
        disabled={disabled}
        id={id}
        name={name}
        onChange={(nextValue) => onChange?.({ target: { value: nextValue } })}
        options={options}
        required={required}
        style={style}
        value={value}
      />
    </span>
  )
}
