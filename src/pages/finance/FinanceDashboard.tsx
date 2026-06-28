import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, PieChart, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'

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

export default function FinanceDashboard() {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('this_month')

  const [income, setIncome] = useState<Row[]>([])
  const [expenses, setExpenses] = useState<Row[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const safe = async <T,>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
        try { const { data } = await p; return data ?? [] } catch { return [] }
      }

      const [receipts, cashbook, purchases, subPay] = await Promise.all([
        safe(supabase.from('receipts').select('amount,receipt_date')),
        safe(supabase.from('accounts_payable').select('amount,entry_date,category')),
        safe(supabase.from('purchase_invoices').select('amount,created_at')),
        safe(supabase.from('subcontractor_payments').select('amount,payment_date')),
      ])

      // الإيرادات = المقبوضات (إيصالات)
      setIncome((receipts as Record<string, unknown>[]).map(r => ({
        amount: Number(r.amount) || 0,
        date: (r.receipt_date as string) || '',
        label: 'مقبوضات',
      })))

      // المصروفات = الصندوق + فواتير الشراء + مدفوعات المقاولين
      const exp: Row[] = []
      for (const c of cashbook as Record<string, unknown>[]) {
        exp.push({ amount: Number(c.amount) || 0, date: (c.entry_date as string) || '', category: (c.category as string) || 'general' })
      }
      for (const p of purchases as Record<string, unknown>[]) {
        exp.push({ amount: Number(p.amount) || 0, date: (p.created_at as string) || '', category: 'supplier' })
      }
      for (const s of subPay as Record<string, unknown>[]) {
        exp.push({ amount: Number(s.amount) || 0, date: (s.payment_date as string) || '', category: 'subcontractor' })
      }
      setExpenses(exp)
      setLoading(false)
    }
    load()
  }, [])

  // تصفية حسب الفترة
  const { from, to } = periodRange(period)
  const inRange = (d: string) => {
    if (!from || !to) return true
    if (!d) return false
    const t = new Date(d).getTime()
    return t >= from.getTime() && t <= to.getTime()
  }

  const fIncome = useMemo(() => income.filter(r => inRange(r.date)), [income, period])
  const fExpenses = useMemo(() => expenses.filter(r => inRange(r.date)), [expenses, period])

  const totalIncome = fIncome.reduce((s, r) => s + r.amount, 0)
  const totalExpense = fExpenses.reduce((s, r) => s + r.amount, 0)
  const net = totalIncome - totalExpense
  const margin = totalIncome > 0 ? (net / totalIncome) * 100 : 0

  // تحليل المصروفات بالفئات
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of fExpenses) {
      const k = e.category || 'other'
      map[k] = (map[k] || 0) + e.amount
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [fExpenses])

  const maxCat = byCategory.length ? byCategory[0][1] : 1

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

      {loading ? (
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
