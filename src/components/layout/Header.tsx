import { Menu, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

interface HeaderProps {
  onMenuClick: () => void
  title?: string
}

export default function Header({ onMenuClick, title }: HeaderProps) {
  const { user, signOut } = useAuth()

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
      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden sm:block text-xs text-slate-400 truncate max-w-[180px]">{user.email}</span>
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
