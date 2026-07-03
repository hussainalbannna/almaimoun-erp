import { forwardRef, useId } from 'react'
import { clsx } from '../../lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, required, ...props }, ref) => {
    // معرّف فريد مضمون — يمنع تكرار المعرّفات عند تكرار نفس التسمية في نموذجين
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`
    const describedBy = error ? errorId : hint ? hintId : undefined

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ms-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <input
          {...props}
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'h-9 px-3 rounded-lg border text-sm bg-white transition-colors outline-none w-full',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
              : 'border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
            className,
          )}
        />
        {error && <span id={errorId} className="text-xs text-red-600">{error}</span>}
        {hint && !error && <span id={hintId} className="text-xs text-slate-500">{hint}</span>}
      </div>
    )
  },
)

Input.displayName = 'Input'
export default Input
