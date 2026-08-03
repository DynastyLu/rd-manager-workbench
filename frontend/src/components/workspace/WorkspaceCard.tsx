import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react'

const CardContext = createContext(false)

interface WorkspaceCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
}

export function WorkspaceCard({ children, hover = true, className = '', ...props }: WorkspaceCardProps) {
  const { onPointerMove, onPointerLeave, ...restProps } = props

  return (
    <CardContext.Provider value>
      <div
        className={`workspace-card ${className}`}
        data-interactive={hover ? 'true' : 'false'}
        onPointerMove={(event) => {
          if (hover) {
            const bounds = event.currentTarget.getBoundingClientRect()
            event.currentTarget.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`)
            event.currentTarget.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`)
          }
          onPointerMove?.(event)
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.removeProperty('--spotlight-x')
          event.currentTarget.style.removeProperty('--spotlight-y')
          onPointerLeave?.(event)
        }}
        {...restProps}
      >
        {children}
      </div>
    </CardContext.Provider>
  )
}

function useCard() {
  const inside = useContext(CardContext)
  if (!inside) throw new Error('WorkspaceCard subcomponents must be used inside WorkspaceCard')
}

export function WorkspaceCardHeader({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  useCard()
  return (
    <div className={`flex min-h-[52px] items-center justify-between gap-3 border-b border-[var(--workspace-border-strong)] px-5 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function WorkspaceCardTitle({ children, className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  useCard()
  return (
    <h3 className={`m-0 text-lg font-semibold text-[var(--workspace-text)] ${className}`} {...props}>
      {children}
    </h3>
  )
}

export function WorkspaceCardDescription({ children, className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  useCard()
  return (
    <p className={`m-0 text-sm text-[var(--workspace-text-secondary)] ${className}`} {...props}>
      {children}
    </p>
  )
}

export function WorkspaceCardContent({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  useCard()
  return <div className={`p-5 ${className}`} {...props}>{children}</div>
}

export function WorkspaceCardFooter({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  useCard()
  return <div className={`flex items-center justify-end gap-2 border-t border-[var(--workspace-border-strong)] px-5 py-3 ${className}`} {...props}>{children}</div>
}
