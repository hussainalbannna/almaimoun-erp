import { forwardRef, useEffect, useState } from 'react'
import { clsx } from '../../lib/utils'

interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** القيمة الرقمية الحالية (بالدينار — بدقة الفلوس: 3 خانات) */
  value: number
  /** يُستدعى بالقيمة الرقمية بعد كل تعديل صالح */
  onValueChange: (value: number) => void
  label?: string
  error?: string
  hint?: string
}

// يسمح بالأرقام ونقطة عشرية واحدة فقط، وبحدٍّ أقصى 3 خانات عشرية (فلوس البحرين)
function sanitizeMoney(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  const intPart = cleaned.slice(0, dot)
  const decPart = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 3)
  return `${intPart}.${decPart}`
}

/**
 * حقل إدخال المبالغ بالفلوس.
 *
 * يحتفظ بالنص الخام أثناء الكتابة بدل تحويله إلى رقم وإعادته فوراً،
 * فلا تنهار الأصفار العشرية أثناء الإدخال (مثل 0.070 أو 0.007)، بينما
 * يبقى الأب مزوَّداً بقيمة رقمية نظيفة عبر onValueChange.
 *
 * - بلا label: يعرض حقل الإدخال فقط ويطبّق className كما هو (للجداول والصفوف).
 * - مع label: يلفّه بتسمية وتلميح/خطأ بنفس نمط بقية الحقول.
 */
const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, label, error, hint, className, id, required, placeholder = '0.000', ...props }, ref) => {
    const [text, setText] = useState<string>(() => (value ? String(value) : ''))

    // مزامنة من الأب عند تغيّر القيمة خارجياً فقط (تعبئة تلقائية / فتح للتعديل)،
    // دون مسح ما يكتبه المستخدم حالياً — نقارن القيمة الرقمية لا النص الحرفي
    useEffect(() => {
      const shown = parseFloat(text)
      const incoming = Number(value) || 0
      if ((isNaN(shown) ? 0 : shown) !== incoming) {
        setText(incoming ? String(incoming) : '')
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = sanitizeMoney(e.target.value)
      setText(next)
      const num = parseFloat(next)
      onValueChange(isNaN(num) ? 0 : num)
    }

    const inputEl = (
      <input
        {...props}
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={handleChange}
        required={required}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={clsx(
          label && 'h-9 px-3 rounded-lg border text-sm bg-white outline-none transition-colors w-full text-right',
          label && (error
            ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
            : 'border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100'),
          className,
        )}
      />
    )

    if (!label) return inputEl

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ms-0.5" aria-hidden="true">*</span>}
        </label>
        {inputEl}
        {error && <span className="text-xs text-red-600">{error}</span>}
        {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
    )
  },
)

MoneyInput.displayName = 'MoneyInput'
export default MoneyInput
