import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, PieChart, ArrowUpCircle, ArrowDownCircle, Wallet, AlertTriangle, Clock, ShieldCheck } from 'lucide-react'
import { safeSelect } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'
import { workerDayCost, fetchCheques, computePendingChequeSets, computeCashPosition, type CashPosition } from '../../lib/finance'

interface Row { amount: number; date: string; category?: string; label?: string }

const CATEGORY_LABELS: Record<string, string> = {
  materials: 'مواد', labor: 'عمالة', equipment: 'معدات', transport: 'نقل',
  fuel: 'وقود', rent: 'إيجار', utilities: 'خدمات', salaries: 'رواتب',
  subcontractor: 'مقاولو باطن', supplier: 'موردون', general: 'مصاريف عامة', other: 'أخرى',
}

const PERIODS = [
  { key: 'this_month', label: 'هذا الشهر' },
  { key: 'last_month', label: 'الشهر الماضي' },
  { key: 'this_year', label: 'هذه السنة' },
  { key: 'all', label: 'الكل' },
]

function periodRange(key: string): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (key === 'this_month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) }
  if (key === 'last_month') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) }
  if (key === 'this_year') return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) }
  return { from: null, to: null }
}

// أنواع صفوف الاستعلامات
interface ReceiptRow { amount: number | null; receipt_date: string | null }
interface CashbookRow { amount: number | null; entry_date: string | null; category: string | null }
interface PurchaseRow { id: string; amount: number | null; entry_date: string | null; created_at: string | null }
interface SubPayRow { id: string; amount: number | null; payment_date: string | null }
interface AttendRow { worker_id: string | null; attendance_date: string | null; status: string | null }
interface WorkerRow { id: string; pay_type: string | null; daily_rate: number | null; actual_salary: number | null; basic_salary: number | null; social_allowance: number | null }
// الأوفرتايم المعتمد = ما يُدفع فعلاً في كشف الرواتب الشهري (payroll_adjustments)، لا أوفرتايم التقرير اليومي
interface OtRow { overtime: number | null; month: number | null; year: number | null }
interface RentalPayRow { amount: number | null; payment_date: string | null; payment_method: string | null }

interface FinanceData { income: Row[]; expenses: Row[]; cash: CashPosition }
const EMPTY_CASH: CashPosition = { pendingChequesTotal: 0, guaranteeChequesTotal: 0, dueWithin7Days: 0, overduePending: 0 }
const EMPTY_DATA: FinanceData = { income: [], expenses: [], cash: EMPTY_CASH }

// جلب وبناء الإيرادات (المقبوضات) والمصروفات (الصندوق + المشتريات + الباطن + رواتب العمالة من الحضور + الأوفرتايم) — مصدر React Query
async function fetchFinanceData(): Promise<FinanceData> {
  const [receipts, cashbook, purchases, subPay, attendance, workers, overtime, rentalPayments, cheques] = await Promise.all([
    safeSelect<ReceiptRow>('receipts', 'amount,receipt_date'),
    safeSelect<CashbookRow>('accounts_payable', 'amount,entry_date,category'),
    safeSelect<PurchaseRow>('purchase_invoices', 'id,amount,entry_date,created_at'),
    safeSelect<SubPayRow>('subcontractor_payments', 'id,amount,payment_date'),
    safeSelect<AttendRow>('worker_attendance', 'worker_id,attendance_date,status'),
    safeSelect<WorkerRow>('workers', 'id,pay_type,daily_rate,actual_salary,basic_salary,social_allowance'),
    safeSelect<OtRow>('payroll_adjustments', 'overtime,month,year'),
    safeSelect<RentalPayRow>('rental_payments', 'amount,payment_date,payment_method'),
    fetchCheques(),
  ])

  // الشيكات الآجلة غير المصروفة تُستبعد من المصروفات حتى تُصرف فعلاً (مصدر الحقيقة: جدول cheques)
  const pending = computePendingChequeSets(cheques)

  // تكلفة يوم العمل لكل عامل (اليومي: أجر اليوم · الشهري: الراتب الكامل ÷ 26) — المصدر الموحّد finance.ts
  const dayCostById = new Map<string, number>()
  for (const w of workers) dayCostById.set(w.id, workerDayCost(w))

  const income: Row[] = receipts.map(r => ({ amount: Number(r.amount) || 0, date: r.receipt_date || '', label: 'مقبوضات' }))
  const expenses: Row[] = [
    ...cashbook.map(c => ({ amount: Number(c.amount) || 0, date: c.entry_date || '', category: c.category || 'general' })),
    // المشتريات: بتاريخ الفاتورة الحقيقي (entry_date)، واستبعاد ما شيكه آجل غير مصروف
    ...purchases
      .filter(p => !(p.id && pending.purchaseIds.has(p.id)))
      .map(p => ({ amount: Number(p.amount) || 0, date: (p.entry_date || p.created_at || '').slice(0, 10), category: 'supplier' })),
    // مقاولو الباطن: استبعاد الدفعات بشيك آجل غير مصروف
    ...subPay
      .filter(s => !(s.id && pending.subPaymentIds.has(s.id)))
      .map(s => ({ amount: Number(s.amount) || 0, date: s.payment_date || '', category: 'subcontractor' })),
    // رواتب العمالة: كل يوم حضور فعلي × تكلفة يوم العامل — نتخطّى غير الحاضر (غياب/إجازة) كما في finance.ts
    ...attendance
      .filter(a => !(a.status && a.status !== 'present'))
      .map(a => ({ amount: (a.worker_id ? dayCostById.get(a.worker_id) : 0) || 0, date: a.attendance_date || '', category: 'salaries' })),
    // الأوفرتايم المستحق من كشف الرواتب (المصدر المعتمد) بأسلوب الاستحقاق كالرواتب الأساسية — يُنسب لمنتصف شهره
    ...overtime
      .filter(o => Number(o.overtime) > 0 && o.month && o.year)
      .map(o => ({ amount: Number(o.overtime) || 0, date: `${o.year}-${String(o.month).padStart(2, '0')}-15`, category: 'salaries' })),
    // الإيجارات: دفعات الإيجار الفعلية، مع استبعاد ما دُفع بشيك آجل لم يُصرف بعد (نفس قاعدة اللوحة النقدية)
    ...rentalPayments
      .filter(rp => rp.payment_method !== 'deferred_cheque')
      .map(rp => ({ amount: Number(rp.amount) || 0, date: rp.payment_date || '', category: 'rent' })),
  ]
  // مركز السيولة — لقطة لحظية لالتزامات الشيكات الصادرة المعلّقة (مستقلة عن فلتر الفترة)
  const cash = computeCashPosition(cheques)
  return { income, expenses, cash }
}

export default function FinanceDashboard() {
  const [period, setPeriod] = useState('this_month')

  const { data = EMPTY_DATA, isLoading } = useQuery({ queryKey: ['finance-dashboard'], queryFn: fetchFinanceData })

  // كل الأرقام المشتقّة تُحسب معاً عند تغيّر البيانات أو الفترة (فلترة + إجماليات + هامش + تحليل الفئات)
  const { fIncome, fExpenses, totalIncome, totalExpense, net, margin, byCategory, maxCat } = useMemo(() => {
    const { from, to } = periodRange(period)
    const inRange = (d: string) => {
      if (!from || !to) return true
      if (!d) return false
      const t = new Date(d).getTime()
      return t >= from.getTime() && t <= to.getTime()
    }

    const fIncome = data.income.filter(r => inRange(r.date))
    const fExpenses = data.expenses.filter(r => inRange(r.date))
    const totalIncome = fIncome.reduce((s, r) => s + r.amount, 0)
    const totalExpense = fExpenses.reduce((s, r) => s + r.amount, 0)
    const net = totalIncome - totalExpense
    const margin = totalIncome > 0 ? (net / totalIncome) * 100 : 0

    const catMap: Record<string, number> = {}
    for (const e of fExpenses) {
      const k = e.category || 'other'
      catMap[k] = (catMap[k] || 0) + e.amount
    }
    const byCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1])
    const maxCat = byCategory.length ? byCategory[0][1] : 1

    return { fIncome, fExpenses, totalIncome, totalExpense, net, margin, byCategory, maxCat }
  }, [data, period])

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <PieChart size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">اللوحة المالية</h1>
            <p className="text-sm text-slate-500">نظرة شاملة على الإيرادات والمصروفات</p>
          </div>
        </div>
        {/* فلتر الفترة */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-slate-400 py-12">جاري حساب البيانات المالية...</div>
      ) : (
        <>
          {/* البطاقات الرئيسية */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500">الإيرادات (المقبوضات)</span>
                <ArrowUpCircle size={20} className="text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</div>
              <div className="text-xs text-slate-400 mt-1">{fIncome.length} عملية قبض</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500">المصروفات</span>
                <ArrowDownCircle size={20} className="text-red-500" />
              </div>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(totalExpense)}</div>
              <div className="text-xs text-slate-400 mt-1">{fExpenses.length} مصروف</div>
            </div>

            <div className="rounded-xl border p-5" style={{ background: net >= 0 ? '#f0fdf4' : '#fef2f2', borderColor: net >= 0 ? '#bbf7d0' : '#fecaca' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm" style={{ color: net >= 0 ? '#15803d' : '#b91c1c' }}>صافي الربح</span>
                {net >= 0 ? <TrendingUp size={20} className="text-green-600" /> : <TrendingDown size={20} className="text-red-600" />}
              </div>
              <div className="text-2xl font-bold" style={{ color: net >= 0 ? '#16a34a' : '#dc2626' }}>{formatCurrency(net)}</div>
              <div className="text-xs mt-1" style={{ color: net >= 0 ? '#15803d' : '#b91c1c' }}>هامش الربح: {margin.toFixed(1)}%</div>
            </div>
          </div>

          {/* مركز السيولة — التزامات الشيكات الصادرة المعلّقة (لقطة لحظية، مستقلة عن الفترة) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Wallet size={18} className="text-amber-700" />
              <h2 className="font-semibold text-slate-700">مركز السيولة — التزامات الشيكات المعلّقة</h2>
              <span className="text-xs text-slate-400">(لقطة حالية، لا تتأثر بفلتر الفترة)</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-amber-800">إجمالي الشيكات الآجلة المعلّقة</span>
                  <ArrowDownCircle size={18} className="text-amber-600" />
                </div>
                <div className="text-xl font-bold text-amber-700">{formatCurrency(data.cash.pendingChequesTotal)}</div>
                <div className="text-xs text-amber-700/70 mt-1">التزامات قادمة على الصندوق</div>
              </div>

              <div className="rounded-xl border p-4" style={{ borderColor: data.cash.overduePending > 0 ? '#fecaca' : '#e2e8f0', background: data.cash.overduePending > 0 ? '#fef2f2' : '#f8fafc' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs" style={{ color: data.cash.overduePending > 0 ? '#b91c1c' : '#64748b' }}>استحقّت ولم تُصرف</span>
                  <AlertTriangle size={18} style={{ color: data.cash.overduePending > 0 ? '#dc2626' : '#94a3b8' }} />
                </div>
                <div className="text-xl font-bold" style={{ color: data.cash.overduePending > 0 ? '#dc2626' : '#334155' }}>{formatCurrency(data.cash.overduePending)}</div>
                <div className="text-xs mt-1" style={{ color: data.cash.overduePending > 0 ? '#b91c1c' : '#94a3b8' }}>{data.cash.overduePending > 0 ? 'تحتاج تسوية فورية' : 'لا متأخرات'}</div>
              </div>

              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-orange-800">تستحق خلال 7 أيام</span>
                  <Clock size={18} className="text-orange-500" />
                </div>
                <div className="text-xl font-bold text-orange-600">{formatCurrency(data.cash.dueWithin7Days)}</div>
                <div className="text-xs text-orange-600/70 mt-1">جهّز السيولة اللازمة</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-600">شيكات ضمان قائمة</span>
                  <ShieldCheck size={18} className="text-slate-400" />
                </div>
                <div className="text-xl font-bold text-slate-700">{formatCurrency(data.cash.guaranteeChequesTotal)}</div>
                <div className="text-xs text-slate-400 mt-1">غير مطالَبة عادةً</div>
              </div>
            </div>
          </div>

          {/* شريط الإيراد مقابل المصروف */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h2 className="font-semibold text-slate-700 mb-4">الإيرادات مقابل المصروفات</h2>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">الإيرادات</span>
                  <span className="font-medium text-green-600">{formatCurrency(totalIncome)}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(100, totalIncome + totalExpense > 0 ? (totalIncome / (totalIncome + totalExpense)) * 100 : 0)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">المصروفات</span>
                  <span className="font-medium text-red-600">{formatCurrency(totalExpense)}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, totalIncome + totalExpense > 0 ? (totalExpense / (totalIncome + totalExpense)) * 100 : 0)}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* تحليل المصروفات بالفئات */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-700 mb-4">تحليل المصروفات حسب الفئة</h2>
            {byCategory.length === 0 ? (
              <div className="text-center text-slate-400 py-6 text-sm">لا توجد مصروفات في هذه الفترة</div>
            ) : (
              <div className="space-y-3">
                {byCategory.map(([cat, amount]) => (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">{CATEGORY_LABELS[cat] ?? cat}</span>
                      <span className="font-medium text-slate-700">
                        {formatCurrency(amount)}
                        <span className="text-xs text-slate-400 mr-2">({totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(0) : 0}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(amount / maxCat) * 100}%`, background: 'linear-gradient(90deg, #c4925a, #7b4a2d)' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
