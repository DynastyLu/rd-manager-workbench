import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type WorkspaceButtonVariant = 'primary' | 'secondary' | 'ghost'
type WorkspaceButtonSize = 'sm' | 'md' | 'lg'

interface WorkspaceButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: WorkspaceButtonVariant
  size?: WorkspaceButtonSize
  loading?: boolean
  children: ReactNode
}

const sizeClasses: Record<WorkspaceButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-[14px]',
  lg: 'px-5 py-2.5 text-base',
}

export const WorkspaceButton = forwardRef<HTMLButtonElement, WorkspaceButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, children, disabled, className = '', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--workspace-brand)] focus:ring-offset-1 focus:ring-offset-[var(--workspace-canvas)]'
    const variantClasses: Record<WorkspaceButtonVariant, string> = {
      primary: 'workspace-button-primary',
      secondary: 'bg-[var(--workspace-surface)] border border-[var(--workspace-border-strong)] text-[var(--workspace-text-secondary)] hover:bg-[var(--workspace-surface-elevated)] hover:border-[var(--workspace-border-strong)] transition-colors duration-150',
      ghost: 'bg-transparent text-[var(--workspace-text-secondary)] hover:bg-[var(--workspace-surface-subtle)] transition-colors duration-150',
    }

    return (
      <button
        ref={ref}
        className={`${base} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {children}
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

WorkspaceButton.displayName = 'WorkspaceButton'
