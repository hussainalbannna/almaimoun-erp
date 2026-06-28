import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, FileText, Users, BookOpen,
  ClipboardList, GitMerge, Layers, CalendarDays,
  ChevronLeft, TrendingUp, TrendingDown, AlertTriangle, ShieldAlert, Wrench
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '../lib/utils'

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

interface DocAlert {
  id: string
  name: string
  detail: string
  type: 'visa' | 'cpr' | 'passport' | 'insurance' | 'registration'
  expiry_date: string
  days_left: number
  action: string
}

interface CheckAlert {
  id: string
  party: string
  project_name: string
  amount: number
  due_date: string
  days_left: number
  source: 'supplier' | 'subcontractor'
  action: string
}

const DOC_TYPE_LABEL: Record<string, string> = {
  visa: 'الإقامة', cpr: 'البطاقة الذكية', passport: 'الجواز',
  insurance: 'التأمين', registration: 'الاستمارة',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({
    activeProjects: 0, totalWorkers: 0, currentMonthExpenses: 0, supplierPayables: 0, subcontractorDue: 0,
    upcomingMilestones: [], projectFin: [], recentLogs: [],
  })
  const [loading, setLoading] = useState(true)
  const [docAlerts, setDocAlerts] = useState<DocAlert[]>([])
  const [checkAlerts, setCheckAlerts] = useState<CheckAlert[]>([])

  useEffect(() => {
    const load = async () => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

      const [
        projRes, workRes, expRes, lpoRes, milRes, logRes, allWorkersRes,
        allMilRes, apRes, piAllRes, subPayRes, assetsRes, subAssignRes
      ] = await Promise.all([
        supabase.from('projects').select('id, project_name, contract_value, status').eq('status', 'active'),
        supabase.from('workers').select('id').eq('status', 'active'),
        supabase.from('accounts_payable').select('amount').gte('entry_date', monthStart).lte('entry_date', monthEnd),
        supabase.from('lpos').select('total').eq('status', 'approved'),
        supabase.from('project_milestones').select('id, project_id, name, amount, status').in('status', ['pending', 'in_progress', 'completed']).order('sort_order').limit(6),
        supabase.from('daily_logs').select('id, project_id, log_date, description').order('log_date', { ascending: false }).limit(5),
        supabase.from('workers').select('id, name, visa_expiry, cpr_expiry, passport_expiry').eq('status', 'active'),
        supabase.from('project_milestones').select('project_id, amount, status'),
        supabase.from('accounts_payable').select('project_id, amount'),
        supabase.from('purchase_invoices').select('project_id, amount'),
        supabase.from('subcontractor_payments').select('project_id, amount'),
        supabase.from('assets').select('id, name, insurance_expiry, registration_expiry'),
        supabase.from('subcontractor_assignments').select('agreed_amount, paid_amount'),
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

      // ربحية كل مشروع نشط
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

      // ───── تنبيهات الوثائق (عمال + معدات) ─────
      const alerts: DocAlert[] = []
      const allWorkers = (allWorkersRes.data ?? []) as { id: string; name: string; visa_expiry: string | null; cpr_expiry: string | null; passport_expiry: string | null }[]
      allWorkers.forEach(w => {
        ;([['visa', w.visa_expiry], ['cpr', w.cpr_expiry], ['passport', w.passport_expiry]] as const).forEach(([type, date]) => {
          if (date) {
            const d = daysUntil(date)
            if (d <= 30) alerts.push({ id: `${type}-${w.id}`, name: w.name, detail: DOC_TYPE_LABEL[type], type, expiry_date: date, days_left: d, action: `/workers/${w.id}/edit` })
          }
        })
      })
      const assets = (assetsRes.data ?? []) as { id: string; name: string; insurance_expiry: string | null; registration_expiry: string | null }[]
      assets.forEach(a => {
        ;([['insurance', a.insurance_expiry], ['registration', a.registration_expiry]] as const).forEach(([type, date]) => {
          if (date) {
            const d = daysUntil(date)
            if (d <= 30) alerts.push({ id: `${type}-${a.id}`, name: a.name, detail: DOC_TYPE_LABEL[type], type, expiry_date: date, days_left: d, action: `/assets` })
          }
        })
      })
      alerts.sort((a, b) => a.days_left - b.days_left)
      setDocAlerts(alerts)

      // ───── تنبيهات الشيكات (موردين + مقاولين) ─────
      const checks: CheckAlert[] = []
      const { data: pdcData } = await supabase
        .from('purchase_invoices')
        .select('id, supplier_name, project_name, amount, check_due_date')
        .eq('payment_method', 'deferred_cheque')
        .not('check_due_date', 'is', null)
      ;((pdcData ?? []) as { id: string; supplier_name: string; project_name: string; amount: number; check_due_date: string }[]).forEach(c => {
        const d = daysUntil(c.check_due_date)
        if (d <= 7) checks.push({ id: c.id, party: c.supplier_name, project_name: c.project_name, amount: Number(c.amount), due_date: c.check_due_date, days_left: d, source: 'supplier', action: `/purchases/${c.id}/edit` })
      })
      const { data: subChecks } = await supabase
        .from('subcontractor_payments')
        .select('id, subcontractor_id, amount, check_due_date, payment_method')
        .eq('payment_method', 'cheque')
        .not('check_due_date', 'is', null)
      const subCheckList = (subChecks ?? []) as { id: string; subcontractor_id: string; amount: number; check_due_date: string }[]
      if (subCheckList.length > 0) {
        const { data: subNames } = await supabase.from('subcontractors').select('id, name')
        const nameMap = new Map(((subNames ?? []) as { id: string; name: string }[]).map(s => [s.id, s.name]))
        subCheckList.forEach(c => {
          const d = daysUntil(c.check_due_date)
          if (d <= 7) checks.push({ id: c.id, party: nameMap.get(c.subcontractor_id) ?? 'مقاول', project_name: '', amount: Number(c.amount), due_date: c.check_due_date, days_left: d, source: 'subcontractor', action: `/subcontractors` })
        })
      }
      checks.sort((a, b) => a.days_left - b.days_left)
      setCheckAlerts(checks)

      setLoading(false)
    }
    load()
  }, [])

  const MILESTONE_STATUS: Record<string, { label: string; color: string }> = {
    pending: { label: 'معلق', color: 'bg-slate-100 text-slate-600' },
    in_progress: { label: 'جارٍ', color: 'bg-blue-100 text-blue-700' },
    completed: { label: 'مكتمل', color: 'bg-green-100 text-green-700' },
  }

  const alertColor = (d: number) => d < 0 ? 'bg-red-600' : d <= 7 ? 'bg-red-500' : d <= 14 ? 'bg-orange-500' : 'bg-yellow-500'

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">لوحة التحكم التنفيذية</h1>
        <p className="text-slate-500 text-sm mt-0.5">مؤسسة الميمون للمقاولات — مملكة البحرين</p>
      </div>

      {/* تنبيهات الوثائق */}
      {docAlerts.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 border-red-400 bg-red-50 overflow-hidden shadow-lg shadow-red-100/50">
          <div className="flex items-center gap-3 px-5 py-3 bg-red-600">
            <ShieldAlert size={20} className="text-white animate-pulse" />
            <h2 className="text-white font-bold text-sm">تنبيهات الوثائق — عمال ومعدات</h2>
            <span className="mr-auto bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">{docAlerts.length} تنبيه</span>
          </div>
          <div className="divide-y divide-red-200 max-h-72 overflow-y-auto">
            {docAlerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between px-5 py-3 hover:bg-red-100/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${alertColor(alert.days_left)} ${alert.days_left <= 0 ? 'animate-pulse' : ''}`} />
                  <div>
                    <p className="text-sm font-bold text-red-900">
                      {alert.detail} — {alert.name}
                    </p>
                    <p className="text-xs text-red-700 mt-0.5">
                      {alert.expiry_date} — {alert.days_left < 0 ? 'منتهية!' : alert.days_left === 0 ? 'تنتهي اليوم' : `${alert.days_left} يوم متبقي`}
                    </p>
                  </div>
                </div>
                <button onClick={() => navigate(alert.action)}
                  className="shrink-0 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 transition-colors">
                  تحديث
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* تنبيهات الشيكات */}
      {checkAlerts.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 border-orange-400 bg-orange-50 overflow-hidden shadow-lg shadow-orange-100/50">
          <div className="flex items-center gap-3 px-5 py-3 bg-orange-500">
            <AlertTriangle size={20} className="text-white animate-bounce" />
            <h2 className="text-white font-bold text-sm">شيكات آجلة مستحقة قريباً</h2>
            <span className="mr-auto bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">{checkAlerts.length} شيك</span>
          </div>
          <div className="divide-y divide-orange-200 max-h-72 overflow-y-auto">
            {checkAlerts.map(alert => (
              <div key={`${alert.source}-${alert.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-orange-100/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${alertColor(alert.days_left)} ${alert.days_left <= 0 ? 'animate-ping' : 'animate-pulse'}`} />
                  <div>
                    <p className="text-sm font-bold text-orange-900">
                      شيك {alert.source === 'supplier' ? 'مورد' : 'مقاول'}: {alert.party} {alert.project_name && `— ${alert.project_name}`} ({formatCurrency(alert.amount)})
                    </p>
                    <p className="text-xs text-orange-700 mt-0.5">
                      الاستحقاق: {alert.due_date} — {alert.days_left < 0 ? 'منتهي!' : alert.days_left === 0 ? 'اليوم' : `${alert.days_left} يوم`}
                    </p>
                  </div>
                </div>
                <button onClick={() => navigate(alert.action)}
                  className="shrink-0 text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-orange-700 transition-colors">
                  تسوية
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'مصاريف الشهر الحالي', value: formatCurrency(stats.currentMonthExpenses), icon: BookOpen, color: '#dc2626', bg: '#fef2f2', path: '/cashbook' },
          { label: 'مستحقات الموردين', value: formatCurrency(stats.supplierPayables), icon: TrendingUp, color: '#c4925a', bg: '#fdf7f0', path: '/lpos' },
          { label: 'مستحقات المقاولين', value: formatCurrency(stats.subcontractorDue), icon: Wrench, color: '#7c3aed', bg: '#faf5ff', path: '/subcontractors' },
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
            { label: 'مقاول باطن', icon: Wrench, path: '/subcontractors/new', style: { background: '#7c3aed', color: 'white' } },
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