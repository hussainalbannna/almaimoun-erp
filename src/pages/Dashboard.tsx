import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, FileText, Users, BookOpen,
  ClipboardList, GitMerge, Layers, CalendarDays,
  ChevronLeft, TrendingUp, AlertTriangle, ShieldAlert
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'

interface Stats {
  activeProjects: number
  totalWorkers: number
  currentMonthExpenses: number
  supplierPayables: number
  upcomingMilestones: { id: string; project_name: string; name: string; amount: number; status: string }[]
  projectHealth: { id: string; project_name: string; contract_value: number; invoiced: number; status: string }[]
  recentLogs: { id: string; log_date: string; description: string; project_name?: string }[]
}

interface EmergencyAlert {
  id: string
  worker_id: string
  worker_name: string
  type: 'visa' | 'cpr'
  expiry_date: string
  days_left: number
}

interface PDCAlert {
  id: string
  supplier_name: string
  project_name: string
  amount: number
  check_due_date: string
  days_left: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({
    activeProjects: 0, totalWorkers: 0, currentMonthExpenses: 0, supplierPayables: 0,
    upcomingMilestones: [], projectHealth: [], recentLogs: [],
  })
  const [loading, setLoading] = useState(true)
  const [emergencyAlerts, setEmergencyAlerts] = useState<EmergencyAlert[]>([])
  const [pdcAlerts, setPdcAlerts] = useState<PDCAlert[]>([])

  useEffect(() => {
    const load = async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

      const [projRes, workRes, expRes, lpoRes, milRes, logRes, allWorkersRes] = await Promise.all([
        supabase.from('projects').select('id, project_name, contract_value, status').eq('status', 'active'),
        supabase.from('workers').select('id').eq('status', 'active'),
        supabase.from('accounts_payable').select('amount').gte('entry_date', monthStart).lte('entry_date', monthEnd),
        supabase.from('lpos').select('total').eq('status', 'approved'),
        supabase.from('project_milestones').select('id, project_id, name, amount, status').in('status', ['pending', 'in_progress', 'completed']).order('sort_order').limit(6),
        supabase.from('daily_logs').select('id, project_id, log_date, description').order('log_date', { ascending: false }).limit(5),
        supabase.from('workers').select('id, name, visa_expiry, cpr_expiry').eq('status', 'active'),
      ])

      const projects = (projRes.data ?? []) as { id: string; project_name: string; contract_value: number; status: string }[]
      const milestones = (milRes.data ?? []) as { id: string; project_id: string; name: string; amount: number; status: string }[]
      const logs = (logRes.data ?? []) as { id: string; project_id: string; log_date: string; description: string }[]

      const monthExpenses = (expRes.data ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0)
      const supplierPayables = (lpoRes.data ?? []).reduce((s: number, l: { total: number }) => s + Number(l.total), 0)

      const { data: allMil } = await supabase.from('project_milestones').select('project_id, amount, status')
      const allMilestones = (allMil ?? []) as { project_id: string; amount: number; status: string }[]

      const projectHealth = projects.map(p => ({
        id: p.id,
        project_name: p.project_name,
        contract_value: Number(p.contract_value),
        invoiced: allMilestones.filter(m => m.project_id === p.id && ['invoiced', 'paid'].includes(m.status)).reduce((s, m) => s + Number(m.amount), 0),
        status: p.status,
      }))

      const upcomingMilestones = milestones.map(m => ({
        ...m,
        project_name: projects.find(p => p.id === m.project_id)?.project_name ?? '',
      })).filter(m => m.project_name)

      const recentLogs = logs.map(l => ({
        ...l,
        project_name: projects.find(p => p.id === l.project_id)?.project_name,
      }))

      setStats({
        activeProjects: projects.length,
        totalWorkers: workRes.data?.length ?? 0,
        currentMonthExpenses: monthExpenses,
        supplierPayables,
        upcomingMilestones,
        projectHealth,
        recentLogs,
      })

      // Emergency alerts - 7 day window, non-dismissible
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const alerts: EmergencyAlert[] = []
      const allWorkers = (allWorkersRes.data ?? []) as { id: string; name: string; visa_expiry: string | null; cpr_expiry: string | null }[]

      allWorkers.forEach(w => {
        if (w.visa_expiry) {
          const exp = new Date(w.visa_expiry); exp.setHours(0, 0, 0, 0)
          const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          if (diff <= 7) {
            alerts.push({ id: `visa-${w.id}`, worker_id: w.id, worker_name: w.name, type: 'visa', expiry_date: w.visa_expiry, days_left: diff })
          }
        }
        if (w.cpr_expiry) {
          const exp = new Date(w.cpr_expiry); exp.setHours(0, 0, 0, 0)
          const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          if (diff <= 7) {
            alerts.push({ id: `cpr-${w.id}`, worker_id: w.id, worker_name: w.name, type: 'cpr', expiry_date: w.cpr_expiry, days_left: diff })
          }
        }
      })

      alerts.sort((a, b) => a.days_left - b.days_left)
      setEmergencyAlerts(alerts)

      // PDC (Post-Dated Check) alerts — 3 days or less
      const { data: pdcData } = await supabase
        .from('purchase_invoices')
        .select('id, supplier_name, project_name, amount, check_due_date')
        .eq('payment_method', 'deferred_cheque')
        .not('check_due_date', 'is', null)
      const pdcChecks = (pdcData ?? []) as { id: string; supplier_name: string; project_name: string; amount: number; check_due_date: string }[]
      const pdcWarnings: PDCAlert[] = []
      pdcChecks.forEach(c => {
        const due = new Date(c.check_due_date); due.setHours(0, 0, 0, 0)
        const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        if (diff <= 3) {
          pdcWarnings.push({ id: c.id, supplier_name: c.supplier_name, project_name: c.project_name, amount: Number(c.amount), check_due_date: c.check_due_date, days_left: diff })
        }
      })
      pdcWarnings.sort((a, b) => a.days_left - b.days_left)
      setPdcAlerts(pdcWarnings)

      setLoading(false)
    }
    load()
  }, [])

  const MILESTONE_STATUS: Record<string, { label: string; color: string }> = {
    pending: { label: 'معلق', color: 'bg-slate-100 text-slate-600' },
    in_progress: { label: 'جارٍ', color: 'bg-blue-100 text-blue-700' },
    completed: { label: 'مكتمل', color: 'bg-green-100 text-green-700' },
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">لوحة التحكم التنفيذية</h1>
        <p className="text-slate-500 text-sm mt-0.5">شركة الميمون للإنشاءات — مملكة البحرين</p>
      </div>

      {/* PERMANENT Emergency Alert Widget */}
      {emergencyAlerts.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 border-red-400 bg-red-50 overflow-hidden shadow-lg shadow-red-100/50">
          <div className="flex items-center gap-3 px-5 py-3 bg-red-600">
            <ShieldAlert size={20} className="text-white animate-pulse" />
            <h2 className="text-white font-bold text-sm">تنبيهات طارئة — انتهاء وثائق العمال</h2>
            <span className="mr-auto bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
              {emergencyAlerts.length} تنبيه
            </span>
          </div>
          <div className="divide-y divide-red-200">
            {emergencyAlerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between px-5 py-3 hover:bg-red-100/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${alert.days_left <= 0 ? 'bg-red-600 animate-pulse' : 'bg-amber-500'}`} />
                  <div>
                    <p className="text-sm font-bold text-red-900">
                      {alert.days_left <= 0
                        ? `تنبيه طارئ: ${alert.type === 'visa' ? 'إقامة' : 'بطاقة CPR'} العامل ${alert.worker_name} منتهية الصلاحية!`
                        : `تنبيه طارئ: ${alert.type === 'visa' ? 'إقامة' : 'بطاقة CPR'} العامل ${alert.worker_name} تنتهي خلال أقل من أسبوع`
                      }
                    </p>
                    <p className="text-xs text-red-700 mt-0.5">
                      تاريخ الانتهاء: {alert.expiry_date} —
                      {alert.days_left <= 0 ? ' منتهية!' : ` ${alert.days_left} يوم متبقي`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/workers/${alert.worker_id}/profile`)}
                  className="shrink-0 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 transition-colors"
                >
                  فتح الملف وتحديث
                </button>
              </div>
            ))}
          </div>
          <div className="px-5 py-2 bg-red-100 border-t border-red-200">
            <p className="text-xs text-red-700 font-medium">
              <AlertTriangle size={11} className="inline ml-1" />
              هذه التنبيهات لا يمكن إخفاؤها — يجب تحديث بيانات العامل مباشرة لإزالتها
            </p>
          </div>
        </div>
      )}

      {/* PDC (Post-Dated Check) Emergency Alert */}
      {pdcAlerts.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 border-orange-400 bg-orange-50 overflow-hidden shadow-lg shadow-orange-100/50 animate-pulse-subtle">
          <div className="flex items-center gap-3 px-5 py-3 bg-orange-500">
            <AlertTriangle size={20} className="text-white animate-bounce" />
            <h2 className="text-white font-bold text-sm">تنبيه طارئ — شيكات آجلة مستحقة خلال 3 أيام</h2>
            <span className="mr-auto bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
              {pdcAlerts.length} شيك
            </span>
          </div>
          <div className="divide-y divide-orange-200">
            {pdcAlerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between px-5 py-3 hover:bg-orange-100/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${alert.days_left <= 0 ? 'bg-red-600 animate-ping' : 'bg-orange-500 animate-pulse'}`} />
                  <div>
                    <p className="text-sm font-bold text-orange-900">
                      تنبيه طارئ: موعد استحقاق شيك المورد {alert.supplier_name} الخاص بمشروع {alert.project_name || 'غير محدد'} بقيمة ({formatCurrency(alert.amount)}) متبقي عليه {alert.days_left <= 0 ? 'منتهي!' : `${alert.days_left} أيام فقط`} (تاريخ الصرف: {alert.check_due_date})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/purchases/${alert.id}/edit`)}
                  className="shrink-0 text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-orange-700 transition-colors"
                >
                  عرض وتسوية
                </button>
              </div>
            ))}
          </div>
          <div className="px-5 py-2 bg-orange-100 border-t border-orange-200">
            <p className="text-xs text-orange-700 font-medium">
              <AlertTriangle size={11} className="inline ml-1" />
              هذه التنبيهات لا يمكن إخفاؤها — يجب تسوية الشيك أو تعديل تاريخ الاستحقاق لإزالتها
            </p>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'مصاريف الشهر الحالي', value: formatCurrency(stats.currentMonthExpenses), icon: BookOpen, color: '#dc2626', bg: '#fef2f2', path: '/cashbook' },
          { label: 'مستحقات الموردين', value: formatCurrency(stats.supplierPayables), icon: TrendingUp, color: '#c4925a', bg: '#fdf7f0', path: '/lpos' },
          { label: 'إجمالي العمالة', value: String(stats.totalWorkers), icon: Users, color: '#16a34a', bg: '#f0fdf4', path: '/workers' },
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

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={15} className="text-amber-600" />
          <span className="text-sm font-semibold text-slate-700">إجراءات سريعة</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'قيد صندوق', icon: BookOpen, path: '/cashbook', style: { background: '#c4925a', color: 'white' } },
            { label: 'أمر تغيير', icon: GitMerge, path: '/projects', style: { background: '#2563eb', color: 'white' } },
            { label: 'فاتورة مرحلة', icon: FileText, path: '/invoices/new', style: { background: '#16a34a', color: 'white' } },
            { label: 'تقرير يومي', icon: ClipboardList, path: '/daily-logs', style: { background: '#7b4a2d', color: 'white' } },
          ].map(btn => (
            <button key={btn.path} onClick={() => navigate(btn.path)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={btn.style}>
              <btn.icon size={15} /> {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Upcoming Milestones */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CalendarDays size={15} className="text-amber-600" />
              <span className="font-semibold text-slate-700 text-sm">مراحل قادمة</span>
            </div>
            <button onClick={() => navigate('/projects')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">
              كل <ChevronLeft size={12} />
            </button>
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

        {/* Project Health */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-amber-600" />
              <span className="font-semibold text-slate-700 text-sm">صحة المشاريع المالية</span>
            </div>
            <button onClick={() => navigate('/projects')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">
              تفاصيل <ChevronLeft size={12} />
            </button>
          </div>
          {loading ? <div className="p-6 text-center text-slate-400 text-sm">جاري التحميل...</div> :
            stats.projectHealth.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">لا توجد مشاريع نشطة</div>
            ) : (
              <div className="p-4 space-y-4">
                {stats.projectHealth.slice(0, 4).map(p => {
                  const pct = p.contract_value > 0 ? Math.min(100, (p.invoiced / p.contract_value) * 100) : 0
                  return (
                    <div key={p.id} className="cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-slate-700 hover:text-amber-600 truncate max-w-[180px]">{p.project_name}</span>
                        <span className="text-slate-400 shrink-0">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#c4925a' }} />
                      </div>
                      <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                        <span>مفوتر: {formatCurrency(p.invoiced)}</span>
                        <span>العقد: {formatCurrency(p.contract_value)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* Recent Logs */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} className="text-amber-600" />
            <span className="font-semibold text-slate-700 text-sm">آخر التقارير</span>
          </div>
          <button onClick={() => navigate('/daily-logs')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">
            كل <ChevronLeft size={12} />
          </button>
        </div>
        {loading ? <div className="p-6 text-center text-slate-400 text-sm">جاري التحميل...</div> :
          stats.recentLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">لا توجد تقارير حديثة</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {stats.recentLogs.map(log => (
                <div key={log.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 cursor-pointer"
                  onClick={() => navigate('/daily-logs')}>
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
