import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, FileText, Users, BookOpen,
  ClipboardList, Layers, CalendarDays,
  ChevronRight, TrendingUp, TrendingDown, AlertTriangle, ShieldAlert, Wrench, Wallet, CreditCard
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '../lib/utils'

interface ProjectFin {
  id: string
  project_name: string
  contract_value: number
  received: number   // المقبوض فعلياً من العميل
  cashOut: number    // المدفوع فعلياً (بدون شيكات آجلة معلّقة)
  cashProfit: number // المقبوض − المدفوع
}

interface Stats {
  activeProjects: number
  totalWorkers: number
  monthReceived: number     // المقبوض هذا الشهر (تدفق داخل)
  monthPaid: number         // المدفوع هذا الشهر (تدفق خارج)
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

interface InstallmentAlert {
  id: string
  asset_name: string
  bank_name: string
  amount: number
  due_date: string
  days_left: number
  remaining: number
}

const DOC_TYPE_LABEL: Record<string, string> = {
  visa: 'الإقامة', cpr: 'البطاقة الذكية', passport: 'الجواز',
  insurance: 'التأمين', registration: 'الاستمارة',
}

const num = (v: unknown): number => Number(v) || 0
const todayStr = () => new Date().toISOString().slice(0, 10)

const safe = async <T,>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
  try { const { data } = await p; return data ?? [] } catch { return [] }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({
    activeProjects: 0, totalWorkers: 0, monthReceived: 0, monthPaid: 0, subcontractorDue: 0,
    upcomingMilestones: [], projectFin: [], recentLogs: [],
  })
  const [loading, setLoading] = useState(true)
  const [docAlerts, setDocAlerts] = useState<DocAlert[]>([])
  const [checkAlerts, setCheckAlerts] = useState<CheckAlert[]>([])
  const [installmentAlerts, setInstallmentAlerts] = useState<InstallmentAlert[]>([])

  useEffect(() => {
    const load = async () => {
      const now = new Date()
      const today = todayStr()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

      const [
        projects, allWorkersActive, logs, allMilestones,
        boxRows, piRows, subPay, subAssign, receipts_,
        allWorkersDocs, assets
      ] = await Promise.all([
        safe(supabase.from('projects').select('id, project_name, contract_value, status').eq('status', 'active')),
        safe(supabase.from('workers').select('id').eq('status', 'active')),
        safe(supabase.from('daily_logs').select('id, project_id, log_date, description').order('log_date', { ascending: false }).limit(5)),
        safe(supabase.from('project_milestones').select('id, project_id, name, amount, status').in('status', ['pending', 'in_progress', 'completed']).order('sort_order').limit(6)),
        safe(supabase.from('accounts_payable').select('project_id, amount, entry_date')),
        safe(supabase.from('purchase_invoices').select('project_id, amount, payment_method, check_due_date, created_at')),
        safe(supabase.from('subcontractor_payments').select('project_id, amount, payment_method, check_due_date, payment_date')),
        safe(supabase.from('subcontractor_assignments').select('agreed_amount, paid_amount')),
        safe(supabase.from('receipts').select('project_id, amount, receipt_date')),
        safe(supabase.from('workers').select('id, name, visa_expiry, cpr_expiry, passport_expiry').eq('status', 'active')),
        safe(supabase.from('assets').select('id, name, insurance_expiry, registration_expiry')),
      ])

      const projs = projects as { id: string; project_name: string; contract_value: number; status: string }[]
      const projName = new Map(projs.map(p => [p.id, p.project_name]))

      // ── المقبوض الفعلي لكل مشروع + هذا الشهر ──
      const receivedByProject: Record<string, number> = {}
      let monthReceived = 0
      ;(receipts_ as { project_id: string | null; amount: number; receipt_date: string }[]).forEach(r => {
        const amt = num(r.amount)
        if (r.project_id) receivedByProject[r.project_id] = (receivedByProject[r.project_id] ?? 0) + amt
        const d = r.receipt_date ?? ''
        if (d >= monthStart && d <= monthEnd) monthReceived += amt
      })

      // ── المدفوع الفعلي لكل مشروع + هذا الشهر (استثناء الشيكات الآجلة) ──
      const paidByProject: Record<string, number> = {}
      let monthPaid = 0

      // الصندوق: كله مدفوع فعلي
      ;(boxRows as { project_id: string | null; amount: number; entry_date: string }[]).forEach(e => {
        const amt = num(e.amount)
        if (e.project_id) paidByProject[e.project_id] = (paidByProject[e.project_id] ?? 0) + amt
        const d = e.entry_date ?? ''
        if (d >= monthStart && d <= monthEnd) monthPaid += amt
      })

      // فواتير الموردين: نستثني الشيك الآجل المعلّق
      ;(piRows as { project_id: string | null; amount: number; payment_method: string; check_due_date: string | null; created_at: string }[]).forEach(r => {
        const amt = num(r.amount)
        if (r.payment_method === 'deferred_cheque' && r.check_due_date && r.check_due_date > today) return
        if (r.project_id) paidByProject[r.project_id] = (paidByProject[r.project_id] ?? 0) + amt
        const d = (r.created_at ?? '').slice(0, 10)
        if (d >= monthStart && d <= monthEnd) monthPaid += amt
      })

      // مقاولو الباطن: نستثني الشيك الآجل المعلّق
      ;(subPay as { project_id: string | null; amount: number; payment_method: string; check_due_date: string | null; payment_date: string }[]).forEach(r => {
        const amt = num(r.amount)
        if (r.payment_method === 'cheque' && r.check_due_date && r.check_due_date > today) return
        if (r.project_id) paidByProject[r.project_id] = (paidByProject[r.project_id] ?? 0) + amt
        const d = r.payment_date ?? ''
        if (d >= monthStart && d <= monthEnd) monthPaid += amt
      })

      const subAssignList = subAssign as { agreed_amount: number; paid_amount: number }[]
      const subcontractorDue = subAssignList.reduce((s, a) => s + (num(a.agreed_amount) - num(a.paid_amount)), 0)

      // ── ربحية كل مشروع نشط (المقبوض − المدفوع) — نفس منطق ProjectDetail ──
      const projectFin: ProjectFin[] = projs.map(p => {
        const received = receivedByProject[p.id] ?? 0
        const cashOut = paidByProject[p.id] ?? 0
        return {
          id: p.id, project_name: p.project_name, contract_value: num(p.contract_value),
          received, cashOut, cashProfit: received - cashOut,
        }
      })

      const mil = allMilestones as { id: string; project_id: string; name: string; amount: number; status: string }[]
      const upcomingMilestones = mil.map(m => ({
        ...m, project_name: projName.get(m.project_id) ?? '',
      })).filter(m => m.project_name)

      const lgs = logs as { id: string; project_id: string; log_date: string; description: string }[]
      const recentLogs = lgs.map(l => ({ ...l, project_name: projName.get(l.project_id) }))

      setStats({
        activeProjects: projs.length,
        totalWorkers: (allWorkersActive as { id: string }[]).length,
        monthReceived,
        monthPaid,
        subcontractorDue,
        upcomingMilestones,
        projectFin,
        recentLogs,
      })

      // ───── تنبيهات الوثائق (عمال + معدات) ─────
      const alerts: DocAlert[] = []
      const aw = allWorkersDocs as { id: string; name: string; visa_expiry: string | null; cpr_expiry: string | null; passport_expiry: string | null }[]
      aw.forEach(w => {
        ;([['visa', w.visa_expiry], ['cpr', w.cpr_expiry], ['passport', w.passport_expiry]] as const).forEach(([type, date]) => {
          if (date) {
            const d = daysUntil(date)
            if (d <= 30) alerts.push({ id: `${type}-${w.id}`, name: w.name, detail: DOC_TYPE_LABEL[type], type, expiry_date: date, days_left: d, action: `/workers/${w.id}/edit` })
          }
        })
      })
      const as = assets as { id: string; name: string; insurance_expiry: string | null; registration_expiry: string | null }[]
      as.forEach(a => {
        ;([['insurance', a.insurance_expiry], ['registration', a.registration_expiry]] as const).forEach(([type, date]) => {
          if (date) {
            const d = daysUntil(date)
            if (d <= 30) alerts.push({ id: `${type}-${a.id}`, name: a.name, detail: DOC_TYPE_LABEL[type], type, expiry_date: date, days_left: d, action: `/assets` })
          }
        })
      })
      alerts.sort((a, b) => a.days_left - b.days_left)
      setDocAlerts(alerts)

      // ───── تنبيهات الشيكات الآجلة القريبة (موردين + مقاولين) ─────
      const checks: CheckAlert[] = []
      ;(piRows as { project_id: string | null; amount: number; payment_method: string; check_due_date: string | null }[]).forEach((c, idx) => {
        if (c.payment_method === 'deferred_cheque' && c.check_due_date) {
          const d = daysUntil(c.check_due_date)
          if (d <= 7) checks.push({ id: `pi-${idx}`, party: 'مورد', project_name: c.project_id ? (projName.get(c.project_id) ?? '') : '', amount: num(c.amount), due_date: c.check_due_date, days_left: d, source: 'supplier', action: `/purchases` })
        }
      })
      ;(subPay as { project_id: string | null; amount: number; payment_method: string; check_due_date: string | null }[]).forEach((c, idx) => {
        if (c.payment_method === 'cheque' && c.check_due_date) {
          const d = daysUntil(c.check_due_date)
          if (d <= 7) checks.push({ id: `sub-${idx}`, party: 'مقاول باطن', project_name: c.project_id ? (projName.get(c.project_id) ?? '') : '', amount: num(c.amount), due_date: c.check_due_date, days_left: d, source: 'subcontractor', action: `/subcontractors` })
        }
      })
      checks.sort((a, b) => a.days_left - b.days_left)
      setCheckAlerts(checks)

      // ───── تنبيهات أقساط الأصول (البيكاب والمعدات الممولة) ─────
      const installments: InstallmentAlert[] = []
      const assetsInst = (assetsRes.data ?? []) as {
        id: string; name: string; payment_method?: string; bank_name?: string
        monthly_installment?: number; total_installments?: number; paid_installments?: number; next_installment_date?: string | null
      }[]
      assetsInst.forEach(a => {
        if (a.payment_method === 'installment' && a.next_installment_date) {
          const paid = Number(a.paid_installments) || 0
          const total = Number(a.total_installments) || 0
          // فقط لو باقي أقساط لم تُسدّد
          if (paid < total) {
            const d = daysUntil(a.next_installment_date)
            if (d <= 7) {
              const monthly = Number(a.monthly_installment) || 0
              installments.push({
                id: a.id,
                asset_name: a.name,
                bank_name: a.bank_name || '',
                amount: monthly,
                due_date: a.next_installment_date,
                days_left: d,
                remaining: (total - paid) * monthly,
              })
            }
          }
        }
      })
      installments.sort((a, b) => a.days_left - b.days_left)
      setInstallmentAlerts(installments)

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
  const netMonth = stats.monthReceived - stats.monthPaid

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
                    <p className="text-sm font-bold text-red-900">{alert.detail} — {alert.name}</p>
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
              <div key={alert.id} className="flex items-center justify-between px-5 py-3 hover:bg-orange-100/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${alertColor(alert.days_left)} ${alert.days_left <= 0 ? 'animate-ping' : 'animate-pulse'}`} />
                  <div>
                    <p className="text-sm font-bold text-orange-900">
                      شيك {alert.source === 'supplier' ? 'مورد' : 'مقاول'}: {alert.party}{alert.project_name && ` — ${alert.project_name}`} ({formatCurrency(alert.amount)})
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

      {/* تنبيهات أقساط الأصول (البيكاب) */}
      {installmentAlerts.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 border-purple-400 bg-purple-50 overflow-hidden shadow-lg shadow-purple-100/50">
          <div className="flex items-center gap-3 px-5 py-3 bg-purple-600">
            <CreditCard size={20} className="text-white animate-pulse" />
            <h2 className="text-white font-bold text-sm">أقساط الأصول المستحقة قريباً</h2>
            <span className="mr-auto bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">{installmentAlerts.length} قسط</span>
          </div>
          <div className="divide-y divide-purple-200 max-h-72 overflow-y-auto">
            {installmentAlerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between px-5 py-3 hover:bg-purple-100/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${alertColor(alert.days_left)} ${alert.days_left <= 0 ? 'animate-ping' : 'animate-pulse'}`} />
                  <div>
                    <p className="text-sm font-bold text-purple-900">
                      قسط {alert.asset_name}{alert.bank_name && ` — ${alert.bank_name}`} ({formatCurrency(alert.amount)})
                    </p>
                    <p className="text-xs text-purple-700 mt-0.5">
                      الاستحقاق: {alert.due_date} — {alert.days_left < 0 ? 'مستحق متأخر!' : alert.days_left === 0 ? 'مستحق اليوم' : `${alert.days_left} يوم`} &nbsp;•&nbsp; المتبقي: {formatCurrency(alert.remaining)}
                    </p>
                  </div>
                </div>
                <button onClick={() => navigate('/assets')}
                  className="shrink-0 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-purple-700 transition-colors">
                  عرض
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs — تدفق نقدي حقيقي */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'المقبوض هذا الشهر', value: formatCurrency(stats.monthReceived), icon: TrendingUp, color: '#16a34a', bg: '#f0fdf4', path: '/receipts' },
          { label: 'المدفوع هذا الشهر', value: formatCurrency(stats.monthPaid), icon: TrendingDown, color: '#dc2626', bg: '#fef2f2', path: '/cashbook' },
          { label: 'صافي تدفق الشهر', value: formatCurrency(netMonth), icon: Wallet, color: netMonth >= 0 ? '#16a34a' : '#dc2626', bg: netMonth >= 0 ? '#f0fdf4' : '#fef2f2', path: '/reports' },
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
            <button onClick={() => navigate('/projects')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">الكل <ChevronRight size={12} /></button>
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
                      <span className="text-sm font-bold" style={{ color: '#7b4a2d' }}>{formatCurrency(num(m.amount))}</span>
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

        {/* ربحية المشاريع — تدفق نقدي حقيقي */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Wallet size={15} className="text-amber-600" />
              <span className="font-semibold text-slate-700 text-sm">صافي النقد للمشاريع النشطة</span>
            </div>
            <button onClick={() => navigate('/reports')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">تفاصيل <ChevronRight size={12} /></button>
          </div>
          {loading ? <div className="p-6 text-center text-slate-400 text-sm">جاري التحميل...</div> :
            stats.projectFin.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">لا توجد مشاريع نشطة</div>
            ) : (
              <div className="p-4 space-y-3">
                {stats.projectFin.slice(0, 4).map(p => (
                  <div key={p.id} className="cursor-pointer p-2 rounded-lg hover:bg-slate-50" onClick={() => navigate(`/projects/${p.id}`)}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium text-slate-700 text-sm truncate max-w-[160px]">{p.project_name}</span>
                      <div className="flex items-center gap-1">
                        {p.cashProfit >= 0 ? <TrendingUp size={13} className="text-green-600" /> : <TrendingDown size={13} className="text-red-600" />}
                        <span className={`text-sm font-bold ${p.cashProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(Math.abs(p.cashProfit))}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>مقبوض: {formatCurrency(p.received)}</span>
                      <span>مدفوع: {formatCurrency(p.cashOut)}</span>
                    </div>
                  </div>
                ))}
                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">صافي النقد = المقبوض فعلياً − المدفوع فعلياً (لا يشمل الشيكات الآجلة)</div>
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
          <button onClick={() => navigate('/daily-logs')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">الكل <ChevronRight size={12} /></button>
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
