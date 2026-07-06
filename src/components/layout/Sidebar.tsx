import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import { navGroups } from '../../lib/navigation'


interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          no-print fixed top-0 right-0 h-full w-64 z-30 flex flex-col
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          lg:static lg:translate-x-0
        `}
        style={{ background: 'linear-gradient(180deg, #1c0f09 0%, #2a1510 100%)' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src="/Logo_Final-01.jpg"
              alt="AlMaimoun Construction"
              className="w-10 h-10 rounded-lg object-cover"
            />
            <div>
              <div className="text-white font-bold text-sm leading-tight">الميمون</div>
              <div className="text-xs" style={{ color: '#c4925a' }}>ALMAIMOUN CONSTRUCTION</div>
            </div>
          </div>
          <button
            type="button"
            className="lg:hidden text-white/50 hover:text-white"
            onClick={onClose}
            aria-label="إغلاق القائمة"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin space-y-3" aria-label="التنقّل الرئيسي">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="text-xs font-semibold uppercase px-3 mb-1" style={{ color: '#c4925a55', letterSpacing: '0.08em' }}>
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'text-white'
                          : 'text-white/50 hover:text-white hover:bg-white/5'
                      }`
                    }
                    style={({ isActive }) =>
                      isActive ? { background: 'rgba(196,146,90,0.2)', color: '#d9a04e' } : undefined
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={16} style={isActive ? { color: '#c4925a' } : undefined} />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <div className="text-xs text-center" style={{ color: '#c4925a55' }}>
            مؤسسة الميمون للمقاولات
          </div>
        </div>
      </aside>
    </>
  )
}