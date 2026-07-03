import { forwardRef, useId } from 'react'
import { clsx } from '../../lib/utils'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, required, rows = 3, ...props }, ref) => {
    // معرّف فريد مضمون + ربط صحيح للتسمية والخطأ/التلميح
    const generatedId = useId()
    const textareaId = id ?? generatedId
    const errorId = `${textareaId}-error`
    const hintId = `${textareaId}-hint`
    const describedBy = error ? errorId : hint ? hintId : undefined

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ms-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          {...props}
          ref={ref}
          id={textareaId}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'px-3 py-2 rounded-lg border text-sm bg-white transition-colors outline-none w-full resize-none',
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

Textarea.displayName = 'Textarea'
export default Textarea
