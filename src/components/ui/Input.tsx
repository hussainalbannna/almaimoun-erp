import { forwardRef } from 'react'
import { clsx } from '../../lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.replace(/\s/g, '-').toLowerCase()
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'h-9 px-3 rounded-lg border text-sm bg-white transition-colors outline-none w-full',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
              : 'border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
            className
          )}
          {...props}
        />
        {error && <span className="text-xs text-red-600">{error}</span>}
        {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
