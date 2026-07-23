import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  Button as SemiButton,
  Card as SemiCard,
  Input as SemiInput,
  Modal,
  Skeleton as SemiSkeleton,
  Tag,
} from '@douyinfe/semi-ui'

type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  asChild?: boolean
  size?: ButtonSize
  type?: 'button' | 'submit' | 'reset'
  variant?: ButtonVariant
}

export function Button({
  asChild: _asChild,
  children,
  size = 'default',
  type = 'button',
  variant = 'default',
  ...props
}: ButtonProps) {
  const theme = variant === 'default' ? 'solid' : variant === 'outline' ? 'light' : 'borderless'
  const semanticType = variant === 'destructive' ? 'danger' : 'primary'
  const semiSize = ['xs', 'sm', 'icon-xs', 'icon-sm'].includes(size)
    ? 'small'
    : ['lg', 'icon-lg'].includes(size)
      ? 'large'
      : 'default'
  return (
    <SemiButton
      {...props}
      htmlType={type}
      size={semiSize}
      theme={theme}
      type={semanticType}
    >
      {children}
    </SemiButton>
  )
}

export function Card(props: ComponentProps<typeof SemiCard>) {
  return <SemiCard {...props} />
}

export function CardHeader(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-header" {...props} />
}

export function CardTitle(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-title" {...props} />
}

export function CardDescription(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-description" {...props} />
}

export function CardContent(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" {...props} />
}

export function CardFooter(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-footer" {...props} />
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onInput' | 'size'>

export function Input({
  defaultValue,
  onChange,
  value,
  ...props
}: InputProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(
    defaultValue === undefined ? '' : String(defaultValue),
  )
  const controlled = value !== undefined
  const resolvedValue = controlled ? String(value) : uncontrolledValue

  return (
    <SemiInput
      {...props}
      value={resolvedValue}
      onChange={(nextValue, event) => {
        if (!controlled) setUncontrolledValue(nextValue)
        onChange?.(event)
      }}
    />
  )
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...props}>
      <SemiSkeleton active loading placeholder={<SemiSkeleton.Paragraph rows={1} />} />
    </div>
  )
}

interface BadgeProps {
  children: ReactNode
  className?: string
  title?: string
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'
}

export function Badge({ children, className, title: _title, variant = 'default' }: BadgeProps) {
  const color = variant === 'destructive' ? 'red' : variant === 'secondary' ? 'blue' : 'grey'
  const type = variant === 'outline' ? 'ghost' : 'light'
  return (
    <Tag className={className} color={color} type={type}>
      {children}
    </Tag>
  )
}

interface DialogContextValue {
  close: () => void
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

interface DialogProps {
  children: ReactNode
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

export function Dialog({ children, defaultOpen = false, onOpenChange, open }: DialogProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const resolvedOpen = open ?? internalOpen
  const setOpen = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }
  return (
    <DialogContext.Provider value={{ close: () => setOpen(false), open: resolvedOpen, setOpen }}>
      {children}
    </DialogContext.Provider>
  )
}

function useDialog() {
  const context = useContext(DialogContext)
  if (!context) throw new Error('Dialog components must be nested inside Dialog')
  return context
}

interface DialogTriggerProps {
  asChild?: boolean
  children: ReactNode
}

export function DialogTrigger({ children }: DialogTriggerProps) {
  const { setOpen } = useDialog()
  const child = Children.only(children)
  if (!isValidElement(child)) return null
  const element = child as ReactElement<{ onClick?: MouseEventHandler<HTMLElement> }>
  return cloneElement(element, {
    onClick: (event) => {
      element.props.onClick?.(event)
      if (!event.defaultPrevented) setOpen(true)
    },
  })
}

interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  showCloseButton?: boolean
}

function dialogText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child)
      if (!isValidElement(child)) return ''
      const element = child as ReactElement<{ children?: ReactNode }>
      return dialogText(element.props.children)
    })
    .join('')
    .trim()
}

function findDialogTitle(node: ReactNode): string | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue
    const element = child as ReactElement<{ children?: ReactNode }>
    if (element.type === DialogTitle) return dialogText(element.props.children)
    const nested = findDialogTitle(element.props.children)
    if (nested) return nested
  }
  return undefined
}

export function DialogContent({ children, className }: DialogContentProps) {
  const { close, open } = useDialog()
  const accessibleTitle = findDialogTitle(children)
  return (
    <Modal
      className={className}
      visible={open}
      footer={null}
      onCancel={close}
      title={accessibleTitle}
      width={520}
      closeOnEsc
      centered
    >
      <div className="workspace-modal-form">{children}</div>
    </Modal>
  )
}

export function DialogHeader(props: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dialog-header" {...props} />
}

export function DialogTitle(props: HTMLAttributes<HTMLHeadingElement>) {
  void props
  return null
}

export function DialogDescription(props: HTMLAttributes<HTMLParagraphElement>) {
  return <p data-slot="dialog-description" {...props} />
}

export function DialogFooter(props: HTMLAttributes<HTMLDivElement>) {
  return <div className="workspace-modal-footer" {...props} />
}

export function DialogClose({ children }: { children: ReactNode }) {
  const { close } = useDialog()
  if (!isValidElement(children)) return null
  const element = children as ReactElement<{ onClick?: MouseEventHandler<HTMLElement> }>
  return cloneElement(element, {
    onClick: (event) => {
      element.props.onClick?.(event)
      if (!event.defaultPrevented) close()
    },
  })
}
