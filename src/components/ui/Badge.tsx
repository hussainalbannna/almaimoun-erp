import type { HTMLAttributes } from 'react'
import { clsx } from '../../lib/utils'

// نوع مُصدَّر ليُستخدم في صفحات القوائم لتوحيد ألوان الشارات ومنع القيم الخاطئة
export type BadgeColor =
  | 'default' | 'gray' | 'blue' | 'green' | 'red'
  | 'orange' | 'purple' | 'yellow' | 'amber'

const COLOR_STYLES: Record<BadgeColor, string> = {
  default: 'bg-slate-100 text-slate-700',
  gray: 'bg-slate-100 text-slate-500',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  purple: 'bg-purple-100 text-purple-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  amber: 'bg-amber-100 text-amber-800',
}

// يقبل كل خصائص <span> القياسية (title, onClick, aria-*, data-*) إضافةً إلى color
interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor
}

export default function Badge({ children, color = 'default', className, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={clsx(
        'inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium',
        COLOR_STYLES[color],
        className,
      )}
    >
      {children}
    </span>
  )
}
