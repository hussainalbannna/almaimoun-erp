import { useEffect, useState } from 'react'
import { Menu, LogOut, Bell, Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAllAlerts } from '../../lib/notifications'

interface HeaderProps {
  onMenuClick: () => void
  title?: string
}

export default function Header({ onMenuClick, title }: HeaderProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [alertCount, setAlertCount] = useState(0)
  const [urgentCount, setUrgentCount] = useState(0)

  // جلب عدد التنبيهات وتحديثه كل 5 دقائق
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const alerts = await fetchAllAlerts()
        if (!active) return
        setAlertCount(alerts.length)
        setUrgentCount(alerts.filter(a => a.level === 'danger').length)
      } catch { /* تجاهل */ }
    }
    load()
    const timer = setInterval(load, 5 * 60 * 1000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  return (
    <header className="no-print bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between h-14 shrink-0">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
          onClick={onMenuClick}
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
          onClick={() => navigate('/assistant')}
          title="المساعد الذكي"
          className="p-2 rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
        >
          <Bot size={19} />
        </button>

        {/* جرس الإشعارات مع العدّاد */}
        <button
          onClick={() => navigate('/notifications')}
          title="الإشعارات"
          className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <Bell size={19} />
          {alertCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ background: urgentCount > 0 ? '#dc2626' : '#c4925a' }}
            >
              {alertCount > 99 ? '99+' : alertCount}
            </span>
          )}
        </button>

        {user && (
          <span className="hidden sm:block text-xs text-slate-400 truncate max-w-[160px]">{user.email}</span>
        )}

        <button
          onClick={signOut}
          title="تسجيل الخروج"
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
