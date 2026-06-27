import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, TrendingUp, TrendingDown, BarChart2, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'
import Button from '../../components/ui/Button'

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const CATEGORY_LABELS: Record<string, string> = {
  materials: 'مواد بناء', labor: 'عمالة', equipment: 'معدات', transport: 'نقل', other: 'أخرى'
}
const CATEGORY_COLORS: Record<string, string> = {
  materials: '#c4925a', labor: '#2563eb', equipment: '#16a34a', transport: '#dc2626', other: '#7c3aed'
}

interface ProjectReport {
  id: string
  project_name: string
  contract_value: number
  invoiced: number
  paid: number
  status: string
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  const [totalContractValue, setTotalContractValue] = useState(0)
  const [totalInvoiced, setTotalInvoiced] = useState(0)
  const [totalExpenses, setTotalExpenses] = useState(0)
  const [totalPayroll, setTotalPayroll] = useState(0)
  const [monthlyExpenses, setMonthlyExpenses] = useState<number[]>(new Array(12).fill(0))
  const [monthlyPayroll, setMonthlyPayroll] = useState<number[]>(new Array(12).fill(0))
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ category: string; total: number }[]>([])
  const [projects, setProjects] = useState<ProjectReport[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [projRes, milRes, expRes, wRes] = await Promise.all([
        supabase.from('projects').select('id, project_name, contract_value, status'),
        supabase.from('project_milestones').select('project_id, amount, status'),
        supabase.from('accounts_payable').select('amount, entry_date, category').gte('entry_date', `${year}-01-01`).lte('entry_date', `${year}-12-31`),
        supabase.from('workers').select('basic_salary, social_allowance, status').eq('status', 'active').eq('pay_type', 'monthly'),
      ])

      const ps = (projRes.data ?? []) as { id: string; project_name: string; contract_value: number; status: string }[]
      const ms = (milRes.data ?? []) as { project_id: string; amount: number; status: string }[]
      const exps = (expRes.data ?? []) as { amount: number; entry_date: string; category: string }[]
      const ws = (wRes.data ?? []) as { basic_salary: number; social_allowance: number }[]

      const totalContracts = ps.reduce((s, p) => s + Number(p.contract_value), 0)
      const totalInv = ms.filter(m => ['invoiced', 'paid'].includes(m.status)).reduce((s, m) => s + Number(m.amount), 0)
      const totalPaid = ms.filter(m => m.status === 'paid').reduce((s, m) => s + Number(m.amount), 0)
      const totalExp = exps.reduce((s, e) => s + Number(e.amount), 0)
      const monthlyPay = ws.reduce((s, w) => s + Number(w.basic_salary) + Number(w.social_allowance), 0)
      const annualPayroll = monthlyPay * 12

      const mExp = new Array(12).fill(0)
      exps.forEach(e => {
        const m = new Date(e.entry_date).getMonth()
        mExp[m] += Number(e.amount)
      })
      const mPay = new Array(12).fill(monthlyPay)

      const catMap: Record<string, number> = {}
      exps.forEach(e => {
        catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount)
      })
      const cats = Object.entries(catMap).map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total)

      const projectReports: ProjectReport[] = ps.map(p => {
        const pMilestones = ms.filter(m => m.project_id === p.id)
        return {
          id: p.id,
          project_name: p.project_name,
          contract_value: Number(p.contract_value),
          invoiced: pMilestones.filter(m => ['invoiced', 'paid'].includes(m.status)).reduce((s, m) => s + Number(m.amount), 0),
          paid: pMilestones.filter(m => m.status === 'paid').reduce((s, m) => s + Number(m.amount), 0),
          status: p.status,
        }
      })

      setTotalContractValue(totalContracts)
      setTotalInvoiced(totalInv)
      setTotalExpenses(totalExp)
      setTotalPayroll(annualPayroll)
      setMonthlyExpenses(mExp)
      setMonthlyPayroll(mPay)
      setCategoryBreakdown(cats)
      setProjects(projectReports)
      setLoading(false)
    }
    load()
  }, [year])

  const maxBar = Math.max(...monthlyExpenses.map((e, i) => e + monthlyPayroll[i]), 1)

  const STATUS_LABELS: Record<string, string> = { active: 'نشط', completed: 'منتهي', on_hold: 'متوقف', cancelled: 'ملغى' }
  const STATUS_COLORS: Record<string, string> = { active: 'text-green-700 bg-green-50', completed: 'text-blue-700 bg-blue-50', on_hold: 'text-amber-700 bg-amber-50', cancelled: 'text-red-700 bg-red-50' }

  return (
    <div className="p-6 print:p-4">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">التقارير والإحصائيات</h1>
          <p className="text-slate-500 text-sm mt-0.5">تحليل مالي شامل للمشاريع والمصاريف والإيرادات</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button icon={<Printer size={16} />} onClick={() => window.print()}>طباعة التقرير</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'إجمالي قيمة العقود', value: formatCurrency(totalContractValue), icon: FileText, color: '#7b4a2d', bg: '#fdf7f0' },
          { label: 'إجمالي الفواتير', value: formatCurrency(totalInvoiced), icon: TrendingUp, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'إجمالي المصاريف', value: formatCurrency(totalExpenses), icon: TrendingDown, color: '#dc2626', bg: '#fef2f2' },
          { label: `رواتب ${year}`, value: formatCurrency(totalPayroll), icon: BarChart2, color: '#2563eb', bg: '#eff6ff' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-slate-200 p-4" style={{ background: kpi.bg }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: kpi.color + '22' }}>
              <kpi.icon size={18} style={{ color: kpi.color }} />
            </div>
            <div className="text-xs text-slate-500 mb-1">{kpi.label}</div>
            <div className="text-lg font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Monthly Chart */}
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">المصاريف الشهرية — {year}</h2>
          {loading ? <div className="h-40 flex items-center justify-center text-slate-400 text-sm">جاري التحميل...</div> : (
            <div className="flex items-end gap-1.5 h-40">
              {monthlyExpenses.map((exp, i) => {
                const pay = monthlyPayroll[i]
                const totalH = ((exp + pay) / maxBar) * 100
                const expH = (exp / (exp + pay || 1)) * totalH
                const payH = totalH - expH
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group">
                    <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: '120px' }}>
                      <div style={{ height: `${expH}%`, background: '#c4925a', minHeight: exp > 0 ? '2px' : '0' }} title={`مصاريف: ${exp.toFixed(3)}`} />
                      <div style={{ height: `${payH}%`, background: '#2563eb33', minHeight: pay > 0 ? '2px' : '0' }} title={`رواتب: ${pay.toFixed(3)}`} />
                    </div>
                    <span className="text-slate-400 text-[9px]">{MONTHS_AR[i].slice(0, 3)}</span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#c4925a' }} /> مصاريف الصندوق
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#2563eb33' }} /> الرواتب
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">تحليل فئات الإنفاق</h2>
          {loading ? <div className="flex items-center justify-center h-32 text-slate-400 text-sm">جاري التحميل...</div> :
            categoryBreakdown.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">لا توجد بيانات</div>
            ) : (
              <div className="space-y-3">
                {categoryBreakdown.map(c => {
                  const pct = totalExpenses > 0 ? (c.total / totalExpenses) * 100 : 0
                  const color = CATEGORY_COLORS[c.category] ?? '#94a3b8'
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600">{CATEGORY_LABELS[c.category] ?? c.category}</span>
                        <span className="font-medium text-slate-700">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{formatCurrency(c.total)}</div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* Project Revenue Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <FileText size={16} className="text-amber-600" />
          <h2 className="font-semibold text-slate-700">تقرير الإيرادات والتقدم لكل مشروع</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">جاري التحميل...</div>
        ) : projects.length === 0 ? (
          <div className="p-8 text-center text-slate-400">لا توجد مشاريع</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المشروع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">قيمة العقد</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المفوتر</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المتبقي</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">نسبة الإنجاز</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {projects.map(p => {
                  const pct = p.contract_value > 0 ? Math.min(100, (p.invoiced / p.contract_value) * 100) : 0
                  const remaining = p.contract_value - p.invoiced
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                      <td className="px-4 py-3 font-medium text-slate-800">{p.project_name}</td>
                      <td className="px-4 py-3" style={{ color: '#7b4a2d' }}>{formatCurrency(p.contract_value)}</td>
                      <td className="px-4 py-3 text-green-700 font-medium">{formatCurrency(p.invoiced)}</td>
                      <td className="px-4 py-3 text-amber-700">{formatCurrency(remaining)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#c4925a' }} />
                          </div>
                          <span className="text-xs text-slate-500 w-8 text-left">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[p.status] ?? 'text-slate-600 bg-slate-50'}`}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">الإجمالي</td>
                  <td className="px-4 py-2.5" style={{ color: '#7b4a2d' }}>{formatCurrency(totalContractValue)}</td>
                  <td className="px-4 py-2.5 text-green-700">{formatCurrency(totalInvoiced)}</td>
                  <td className="px-4 py-2.5 text-amber-700">{formatCurrency(totalContractValue - totalInvoiced)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
