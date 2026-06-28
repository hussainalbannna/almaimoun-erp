import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, ShoppingCart, Users, Building2,
  Settings, FileArchive, X, HardHat, Receipt, UserCog,
  ClipboardList, BookOpen, Truck, BarChart2, Phone, CreditCard,
  Wrench, Package
} from 'lucide-react'

const navGroups = [
  {
    label: 'الرئيسية',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, exact: true },
      { to: '/reports', label: 'التقارير والإحصائيات', icon: BarChart2 },
    ]
  },
  {
    label: 'إدارة المشاريع',
    items: [
      { to: '/projects', label: 'المشاريع والمراحل', icon: HardHat },
      { to: '/daily-logs', label: 'تقارير الموقع وأوامر التغيير', icon: ClipboardList },
      { to: '/assets', label: 'الأصول والمعدات', icon: Package },
    ]
  },
  {
    label: 'الموارد البشرية',
    items: [
      { to: '/workers', label: 'العمالة والسجلات', icon: Users },
      { to: '/payroll', label: 'كشف الرواتب', icon: UserCog },
      { to: '/subcontractors', label: 'مقاولو الباطن', icon: Wrench },
    ]
  },
  {
    label: 'المالية والمحاسبة',
    items: [
      { to: '/invoices', label: 'الفواتير', icon: FileText },
      { to: '/receipts', label: 'الإيصالات', icon: Receipt },
      { to: '/cashbook', label: 'دفتر الصندوق', icon: BookOpen },
    ]
  },
  {
    label: 'المشتريات',
    items: [
      { to: '/purchases', label: 'الفواتير والمدفوعات', icon: CreditCard },
      { to: '/lpos', label: 'أوامر الشراء (LPO)', icon: ShoppingCart },
      { to: '/suppliers', label: 'الموردون', icon: Truck },
    ]
  },
  {
    label: 'الدليل',
    items: [
      { to: '/contacts', label: 'جهات الاتصال', icon: Phone },
      { to: '/customers', label: 'العملاء', icon: Building2 },
    ]
  },
  {
    label: '',
    items: [
      { to: '/documents', label: 'المستندات', icon: FileArchive },
      { to: '/settings', label: 'الإعدادات', icon: Settings },
    ]
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation()

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onClose} />
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
          <button className="lg:hidden text-white/50 hover:text-white" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin space-y-3">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="text-xs font-semibold uppercase px-3 mb-1" style={{ color: '#c4925a55', letterSpacing: '0.08em' }}>
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const { to, label, icon: Icon } = item
                  const exact = 'exact' in item ? item.exact : false
                  const isActive = exact
                    ? location.pathname === to
                    : location.pathname.startsWith(to)

                  return (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={onClose}
                      className={`
                        flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${isActive
                          ? 'text-white'
                          : 'text-white/50 hover:text-white hover:bg-white/5'
                        }
                      `}
                      style={isActive ? { background: 'rgba(196,146,90,0.2)', color: '#d9a04e' } : {}}
                    >
                      <Icon size={16} style={isActive ? { color: '#c4925a' } : {}} />
                      {label}
                    </NavLink>
                  )
                })}
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