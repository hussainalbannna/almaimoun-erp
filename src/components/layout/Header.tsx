import { useMemo } from 'react'
import { Menu, LogOut, Bell, Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAllAlerts } from '../../lib/notifications'

interface HeaderProps {
  onMenuClick: () => void
  title?: string
}

const ALERTS_REFETCH_MS = 5 * 60 * 1000 // تحديث عدّاد التنبيهات كل 5 دقائق

export default function Header({ onMenuClick, title }: HeaderProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  // عدّاد التنبيهات عبر React Query — مصدر واحد بمفتاح 'app-alerts'
  // يُشارَك مع مركز الإشعارات، ويتوقّف تلقائياً عند إخفاء التبويب
  const { data: alerts = [] } = useQuery({
    queryKey: ['app-alerts'],
    queryFn: fetchAllAlerts,
    refetchInterval: ALERTS_REFETCH_MS,
  })

  const alertCount = alerts.length

  // اللون الأحمر للأشد خطورة (متأخر أو أحمر danger)، وإلا فاللون الذهبي للعلامة
  const hasUrgent = useMemo(
    () => alerts.some(a => a.level === 'overdue' || a.level === 'danger'),
    [alerts],
  )

  return (
    <header className="no-print bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between h-14 shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
          onClick={onMenuClick}
          aria-label="فتح القائمة"
        >
          <Menu size={22} />
        </button>
        {title && (
          <h1 className="text-slate-800 font-semibold text-base">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* زر المساعد الذكي السريع */}
        <button
          type="button"
          onClick={() => navigate('/assistant')}
          title="المساعد الذكي"
          aria-label="المساعد الذكي"
          className="p-2 rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
        >
          <Bot size={19} />
        </button>

        {/* جرس الإشعارات مع العدّاد */}
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          title="الإشعارات"
          aria-label={alertCount > 0 ? `الإشعارات (${alertCount})` : 'الإشعارات'}
          className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <Bell size={19} />
          {alertCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ background: hasUrgent ? '#dc2626' : '#c4925a' }}
            >
              {alertCount > 99 ? '99+' : alertCount}
            </span>
          )}
        </button>

        {user && (
          <span className="hidden sm:block text-xs text-slate-400 truncate max-w-[160px]">{user.email}</span>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          title="تسجيل الخروج"
          aria-label="تسجيل الخروج"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 border border-slate-200 transition-colors"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">خروج</span>
        </button>

        <img
          src="/Logo_Final-01.jpg"
          alt="AlMaimoun"
          className="w-8 h-8 rounded-lg object-cover"
        />
      </div>
    </header>
  )
}
