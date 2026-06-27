import { clsx } from '../../lib/utils'

type Color = 'default' | 'gray' | 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'yellow' | 'amber'

const colorStyles: Record<Color, string> = {
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

interface BadgeProps {
  children: React.ReactNode
  color?: Color
  className?: string
}

export default function Badge({ children, color = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        colorStyles[color],
        className
      )}
    >
      {children}
    </span>
  )
}
