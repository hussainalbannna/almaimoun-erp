import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, RefreshCw, CreditCard, UserCog, Package, FileText, ListTodo, Calculator, ChevronLeft, CheckCircle2 } from 'lucide-react'
import { fetchAllAlerts, type AppAlert, type AlertKind, type AlertLevel } from '../../lib/notifications'
import { formatCurrency, formatDate } from '../../lib/utils'

const KIND_META: Record<AlertKind, { label: string; icon: typeof Bell }> = {
  cheque: { label: 'شيكات مستحقة', icon: CreditCard },
  worker_doc: { label: 'وثائق العمال', icon: UserCog },
  asset_doc: { label: 'وثائق المعدات', icon: Package },
  invoice: { label: 'فواتير', icon: FileText },
  task: { label: 'مهام', icon: ListTodo },
  quote: { label: 'عروض أسعار', icon: Calculator },
}

const LEVEL_STYLE: Record<AlertLevel, { dot: string; border: string; bg: string; text: string }> = {
  danger: { dot: '#dc2626', border: '#fecaca', bg: '#fef2f2', text: '#b91c1c' },
  warning: { dot: '#d97706', border: '#fde68a', bg: '#fffbeb', text: '#b45309' },
  info: { dot: '#0284c7', border: '#bae6fd', bg: '#f0f9ff', text: '#0369a1' },
}

const FILTERS: { key: 'all' | AlertLevel; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'danger', label: 'عاجل' },
  { key: 'warning', label: 'تحذير' },
  { key: 'info', label: 'معلومة' },
]

export default function NotificationsCenter() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<AppAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | AlertLevel>('all')

  const load = async () => {
    setLoading(true)
    const data = await fetchAllAlerts()
    setAlerts(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.level === filter)

  const counts = {
    danger: alerts.filter(a => a.level === 'danger').length,
    warning: alerts.filter(a => a.level === 'warning').length,
    info: alerts.filter(a => a.level === 'info').length,
  }

  // تجميع حسب النوع
  const byKind = filtered.reduce((acc, a) => {
    (acc[a.kind] ??= []).push(a)
    return acc
  }, {} as Record<AlertKind, AppAlert[]>)

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <Bell size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">مركز الإشعارات</h1>
            <p className="text-sm text-slate-500">{alerts.length} تنبيه</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      {/* ملخّص الأعداد */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {(['danger', 'warning', 'info'] as AlertLevel[]).map(lvl => (
          <button key={lvl} onClick={() => setFilter(filter === lvl ? 'all' : lvl)}
            className="rounded-xl border p-4 text-right transition-all"
            style={{
              borderColor: filter === lvl ? LEVEL_STYLE[lvl].dot : LEVEL_STYLE[lvl].border,
              background: LEVEL_STYLE[lvl].bg,
              boxShadow: filter === lvl ? `0 0 0 2px ${LEVEL_STYLE[lvl].dot}33` : 'none',
            }}>
            <div className="text-2xl font-bold" style={{ color: LEVEL_STYLE[lvl].text }}>{counts[lvl]}</div>
            <div className="text-xs mt-1" style={{ color: LEVEL_STYLE[lvl].text }}>
              {lvl === 'danger' ? 'عاجل' : lvl === 'warning' ? 'تحذير' : 'معلومة'}
            </div>
          </button>
        ))}
      </div>

      {/* فلاتر */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            style={filter === f.key ? { background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' } : {}}>
            {f.label}
          </button>
        ))}
      </div>

      {/* القائمة */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">جاري فحص التنبيهات...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CheckCircle2 size={44} className="mx-auto text-green-400 mb-3" />
          <p className="text-slate-700 font-medium">كل شيء على ما يرام</p>
          <p className="text-slate-400 text-sm mt-1">لا توجد تنبيهات{filter !== 'all' ? ' في هذا التصنيف' : ''} حالياً</p>
        </div>
      ) : (
        <div className="space-y-5">
          {(Object.keys(byKind) as AlertKind[]).map(kind => {
            const KindIcon = KIND_META[kind].icon
            const list = byKind[kind]
            return (
              <div key={kind}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <KindIcon size={16} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-600">{KIND_META[kind].label}</span>
                  <span className="text-xs text-slate-400">({list.length})</span>
                </div>
                <div className="space-y-2">
                  {list.map(a => {
                    const st = LEVEL_STYLE[a.level]
                    return (
                      <button key={a.id} onClick={() => a.link && navigate(a.link)}
                        className="w-full bg-white rounded-xl border p-4 flex items-center gap-3 hover:shadow-sm transition-shadow text-right"
                        style={{ borderColor: st.border }}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: st.dot }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-800 text-sm truncate">{a.title}</div>
                          <div className="text-xs mt-0.5" style={{ color: st.text }}>
                            {a.subtitle}{a.date ? ` — ${formatDate(a.date)}` : ''}
                          </div>
                        </div>
                        {a.amount ? <div className="text-sm font-bold text-slate-700 shrink-0">{formatCurrency(a.amount)}</div> : null}
                        <ChevronLeft size={16} className="text-slate-300 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
