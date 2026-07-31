import { forwardRef, type InputHTMLAttributes } from 'react'

export const WorkspaceInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`workspace-input ${className}`}
        {...props}
      />
    )
  }
)

WorkspaceInput.displayName = 'WorkspaceInput'
