import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, FileText, Users, BookOpen,
  ClipboardList, GitMerge, Layers, CalendarDays,
  ChevronLeft, TrendingUp, TrendingDown, BellRing, ChevronRight
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { fetchAllAlerts, type AppAlert, type AlertLevel } from '../lib/notifications'

interface ProjectFin {
  id: string
  project_name: string
  contract_value: number
  revenue: number
  costs: number
  profit: number
  invoiced: number
}

interface Stats {
  activeProjects: number
  totalWorkers: number
  currentMonthExpenses: number
  supplierPayables: number
  subcontractorDue: number
  upcomingMilestones: { id: string; project_name: string; name: string; amount: number; status: string }[]
  projectFin: ProjectFin[]
  recentLogs: { id: string; log_date: string; description: string; project_name?: string }[]
}

// ألوان المستويات — موحّدة مع مركز الإشعارات
const LEVEL_STYLE: Record<AlertLevel, { dot: string; border: string; bg: string; text: string; btn: string }> = {
  overdue: { dot: '#475569', border: '#cbd5e1', bg: '#f1f5f9', text: '#475569', btn: '#475569' },
  danger: { dot: '#dc2626', border: '#fecaca', bg: '#fef2f2', text: '#b91c1c', btn: '#dc2626' },
  warning: { dot: '#d97706', border: '#fde68a', bg: '#fffbeb', text: '#b45309', btn: '#d97706' },
  info: { dot: '#ca8a04', border: '#fde68a', bg: '#fefce8', text: '#a16207', btn: '#ca8a04' },
}
const LEVEL_LABEL: Record<AlertLevel, string> = { overdue: 'متأخر', danger: 'عاجل', warning: 'تحذير', info: 'تنبيه' }

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({
    activeProjects: 0, totalWorkers: 0, currentMonthExpenses: 0, supplierPayables: 0, subcontractorDue: 0,
    upcomingMilestones: [], projectFin: [], recentLogs: [],
  })
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<AppAlert[]>([])

  useEffect(() => {
    // تنبيهات لوحة التحكم = نفس مصدر مركز الإشعارات
    fetchAllAlerts().then(setAlerts)

    const load = async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

      const safe = async <T,>(p: PromiseLike<{ data: T[] | null }>): Promise<{ data: T[] | null }> => {
        try { return await p } catch { return { data: [] } }
      }

      const [
        projRes, workRes, expRes, lpoRes, milRes, logRes,
        allMilRes, apRes, piAllRes, subPayRes, subAssignRes
      ] = await Promise.all([
        safe(supabase.from('projects').select('id, project_name, contract_value, status').eq('status', 'active')),
        safe(supabase.from('workers').select('id').eq('status', 'active')),
        safe(supabase.from('accounts_payable').select('amount').gte('entry_date', monthStart).lte('entry_date', monthEnd)),
        safe(supabase.from('lpos').select('total').eq('status', 'approved')),
        safe(supabase.from('project_milestones').select('id, project_id, name, amount, status').in('status', ['pending', 'in_progress', 'completed']).order('sort_order').limit(6)),
        safe(supabase.from('daily_logs').select('id, project_id, log_date, description').order('log_date', { ascending: false }).limit(5)),
        safe(supabase.from('project_milestones').select('project_id, amount, status')),
        safe(supabase.from('accounts_payable').select('project_id, amount')),
        safe(supabase.from('purchase_invoices').select('project_id, amount')),
        safe(supabase.from('subcontractor_payments').select('project_id, amount')),
        safe(supabase.from('subcontractor_assignments').select('agreed_amount, paid_amount')),
      ])

      const projects = (projRes.data ?? []) as { id: string; project_name: string; contract_value: number; status: string }[]
      const milestones = (milRes.data ?? []) as { id: string; project_id: string; name: string; amount: number; status: string }[]
      const logs = (logRes.data ?? []) as { id: string; project_id: string; log_date: string; description: string }[]
      const allMilestones = (allMilRes.data ?? []) as { project_id: string; amount: number; status: string }[]
      const ap = (apRes.data ?? []) as { project_id: string | null; amount: number }[]
      const piAll = (piAllRes.data ?? []) as { project_id: string | null; amount: number }[]
      const subPay = (subPayRes.data ?? []) as { project_id: string | null; amount: number }[]
      const subAssign = (subAssignRes.data ?? []) as { agreed_amount: number; paid_amount: number }[]

      const monthExpenses = (expRes.data ?? []).reduce((s, e: { amount: number }) => s + Number(e.amount), 0)
      const supplierPayables = (lpoRes.data ?? []).reduce((s, l: { total: number }) => s + Number(l.total), 0)
      const subcontractorDue = subAssign.reduce((s, a) => s + (Number(a.agreed_amount) - Number(a.paid_amount)), 0)

      const projectFin: ProjectFin[] = projects.map(p => {
        const invoiced = allMilestones.filter(m => m.project_id === p.id && ['invoiced', 'paid'].includes(m.status)).reduce((s, m) => s + Number(m.amount), 0)
        const costs =
          ap.filter(x => x.project_id === p.id).reduce((s, x) => s + Number(x.amount), 0) +
          piAll.filter(x => x.project_id === p.id).reduce((s, x) => s + Number(x.amount), 0) +
          subPay.filter(x => x.project_id === p.id).reduce((s, x) => s + Number(x.amount), 0)
        const revenue = Number(p.contract_value)
        return { id: p.id, project_name: p.project_name, contract_value: revenue, revenue, costs, profit: revenue - costs, invoiced }
      })

      const upcomingMilestones = milestones.map(m => ({
        ...m, project_name: projects.find(p => p.id === m.project_id)?.project_name ?? '',
      })).filter(m => m.project_name)

      const recentLogs = logs.map(l => ({
        ...l, project_name: projects.find(p => p.id === l.project_id)?.project_name,
      }))

      setStats({
        activeProjects: projects.length,
        totalWorkers: workRes.data?.length ?? 0,
        currentMonthExpenses: monthExpenses,
        supplierPayables,
        subcontractorDue,
        upcomingMilestones,
        projectFin,
        recentLogs,
      })
      setLoading(false)
    }
    load()
  }, [])

  const MILESTONE_STATUS: Record<string, { label: string; color: string }> = {
    pending: { label: 'معلق', color: 'bg-slate-100 text-slate-600' },
    in_progress: { label: 'جارٍ', color: 'bg-blue-100 text-blue-700' },
    completed: { label: 'مكتمل', color: 'bg-green-100 text-green-700' },
  }

  // العاجل المعروض في لوحة التحكم (متأخر + أحمر + برتقالي)، مرتّب مسبقاً من fetchAllAlerts
  const urgentAlerts = alerts.filter(a => a.level === 'overdue' || a.level === 'danger' || a.level === 'warning')
  const counts = {
    overdue: alerts.filter(a => a.level === 'overdue').length,
    danger: alerts.filter(a => a.level === 'danger').length,
    warning: alerts.filter(a => a.level === 'warning').length,
    info: alerts.filter(a => a.level === 'info').length,
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">لوحة التحكم التنفيذية</h1>
        <p className="text-slate-500 text-sm mt-0.5">مؤسسة الميمون للمقاولات — مملكة البحرين</p>
      </div>

      {/* ═══ التنبيهات العاجلة (من مركز الإشعارات) ═══ */}
      {urgentAlerts.length > 0 && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3" style={{ background: 'linear-gradient(135deg, #7b4a2d 0%, #c4925a 100%)' }}>
            <div className="flex items-center gap-2.5">
              <BellRing size={19} className="text-white" />
              <h2 className="text-white font-bold text-sm">تنبيهات عاجلة تحتاج إجراءً</h2>
            </div>
            <div className="flex items-center gap-1.5">
              {counts.overdue > 0 && <span className="bg-white/25 text-white text-xs px-2 py-0.5 rounded-full font-bold">{counts.overdue} متأخر</span>}
              {counts.danger > 0 && <span className="bg-white/25 text-white text-xs px-2 py-0.5 rounded-full font-bold">{counts.danger} عاجل</span>}
              {counts.warning > 0 && <span className="bg-white/25 text-white text-xs px-2 py-0.5 rounded-full font-bold">{counts.warning} تحذير</span>}
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {urgentAlerts.slice(0, 8).map(a => {
              const st = LEVEL_STYLE[a.level]
              return (
                <button key={a.id} onClick={() => a.link && navigate(a.link)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-right">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.urgent ? 'animate-pulse' : ''}`} style={{ background: st.dot }} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: st.text }}>{a.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ml-1" style={{ background: st.bg, color: st.text }}>{LEVEL_LABEL[a.level]}</span>
                        {a.subtitle}{a.date ? ` — ${formatDate(a.date)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.amount ? <span className="text-sm font-bold text-slate-700">{formatCurrency(a.amount)}</span> : null}
                    <ChevronLeft size={15} className="text-slate-300" />
                  </div>
                </button>
              )
            })}
          </div>
          {(urgentAlerts.length > 8 || counts.info > 0) && (
            <button onClick={() => navigate('/notifications')}
              className="w-full px-5 py-2.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1 border-t border-slate-100">
              عرض كل التنبيهات في مركز الإشعارات ({alerts.length}) <ChevronLeft size={13} />
            </button>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'مصاريف الشهر الحالي', value: formatCurrency(stats.currentMonthExpenses), icon: BookOpen, color: '#dc2626', bg: '#fef2f2', path: '/cashbook' },
          { label: 'مستحقات الموردين', value: formatCurrency(stats.supplierPayables), icon: TrendingUp, color: '#c4925a', bg: '#fdf7f0', path: '/lpos' },
          { label: 'مستحقات المقاولين', value: formatCurrency(stats.subcontractorDue), icon: GitMerge, color: '#7c3aed', bg: '#faf5ff', path: '/subcontractors' },
          { label: 'المشاريع النشطة', value: String(stats.activeProjects), icon: Building2, color: '#7b4a2d', bg: '#fdf7f0', path: '/projects' },
        ].map(kpi => (
          <button key={kpi.label} onClick={() => navigate(kpi.path)}
            className="text-right p-4 rounded-xl border border-slate-200 hover:shadow-md transition-shadow cursor-pointer"
            style={{ background: kpi.bg }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: kpi.color }}>
              <kpi.icon size={18} className="text-white" />
            </div>
            <div className="text-xs text-slate-500 mb-1">{kpi.label}</div>
            <div className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
          </button>
        ))}
      </div>

      {/* إجراءات سريعة */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={15} className="text-amber-600" />
          <span className="text-sm font-semibold text-slate-700">إجراءات سريعة</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'قيد صندوق', icon: BookOpen, path: '/cashbook', style: { background: '#c4925a', color: 'white' } },
            { label: 'فاتورة', icon: FileText, path: '/invoices/new', style: { background: '#16a34a', color: 'white' } },
            { label: 'تقرير يومي', icon: ClipboardList, path: '/daily-logs', style: { background: '#7b4a2d', color: 'white' } },
            { label: 'مقاول باطن', icon: GitMerge, path: '/subcontractors/new', style: { background: '#7c3aed', color: 'white' } },
          ].map(btn => (
            <button key={btn.path} onClick={() => navigate(btn.path)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={btn.style}>
              <btn.icon size={15} /> {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* عمودان */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* مراحل قادمة */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CalendarDays size={15} className="text-amber-600" />
              <span className="font-semibold text-slate-700 text-sm">مراحل قادمة</span>
            </div>
            <button onClick={() => navigate('/projects')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">كل <ChevronLeft size={12} /></button>
          </div>
          {loading ? <div className="p-6 text-center text-slate-400 text-sm">جاري التحميل...</div> :
            stats.upcomingMilestones.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">لا توجد مراحل معلقة</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {stats.upcomingMilestones.slice(0, 5).map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{m.name}</div>
                      {m.project_name && <div className="text-xs text-slate-400">{m.project_name}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: '#7b4a2d' }}>{formatCurrency(Number(m.amount))}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${MILESTONE_STATUS[m.status]?.color ?? 'bg-slate-100 text-slate-600'}`}>
                        {MILESTONE_STATUS[m.status]?.label ?? m.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* ربحية المشاريع */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-amber-600" />
              <span className="font-semibold text-slate-700 text-sm">ربحية المشاريع النشطة</span>
            </div>
            <button onClick={() => navigate('/projects')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">تفاصيل <ChevronLeft size={12} /></button>
          </div>
          {loading ? <div className="p-6 text-center text-slate-400 text-sm">جاري التحميل...</div> :
            stats.projectFin.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">لا توجد مشاريع نشطة</div>
            ) : (
              <div className="p-4 space-y-3">
                {stats.projectFin.slice(0, 4).map(p => {
                  const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0
                  return (
                    <div key={p.id} className="cursor-pointer p-2 rounded-lg hover:bg-slate-50" onClick={() => navigate(`/projects/${p.id}`)}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-slate-700 text-sm truncate max-w-[160px]">{p.project_name}</span>
                        <div className="flex items-center gap-1">
                          {p.profit >= 0 ? <TrendingUp size={13} className="text-green-600" /> : <TrendingDown size={13} className="text-red-600" />}
                          <span className={`text-sm font-bold ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(Math.abs(p.profit))}</span>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>تكاليف: {formatCurrency(p.costs)}</span>
                        <span>هامش {margin.toFixed(0)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* آخر التقارير */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} className="text-amber-600" />
            <span className="font-semibold text-slate-700 text-sm">آخر التقارير</span>
          </div>
          <button onClick={() => navigate('/daily-logs')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">كل <ChevronLeft size={12} /></button>
        </div>
        {loading ? <div className="p-6 text-center text-slate-400 text-sm">جاري التحميل...</div> :
          stats.recentLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">لا توجد تقارير حديثة</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {stats.recentLogs.map(log => (
                <div key={log.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 cursor-pointer" onClick={() => navigate('/daily-logs')}>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{log.description?.slice(0, 60) || 'تقرير يومي'}{(log.description?.length ?? 0) > 60 ? '...' : ''}</div>
                    {log.project_name && <div className="text-xs text-slate-400">{log.project_name}</div>}
                  </div>
                  <div className="text-xs text-slate-500 shrink-0">{formatDate(log.log_date)}</div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
