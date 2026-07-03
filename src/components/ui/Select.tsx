import { forwardRef, useId } from 'react'
import { clsx } from '../../lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  options: SelectOption[]
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, id, required, ...props }, ref) => {
    // معرّف فريد مضمون + ربط صحيح للتسمية والخطأ/التلميح
    const generatedId = useId()
    const selectId = id ?? generatedId
    const errorId = `${selectId}-error`
    const hintId = `${selectId}-hint`
    const describedBy = error ? errorId : hint ? hintId : undefined

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ms-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <select
          {...props}
          ref={ref}
          id={selectId}
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
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span id={errorId} className="text-xs text-red-600">{error}</span>}
        {hint && !error && <span id={hintId} className="text-xs text-slate-500">{hint}</span>}
      </div>
    )
  },
)

Select.displayName = 'Select'
export default Select
