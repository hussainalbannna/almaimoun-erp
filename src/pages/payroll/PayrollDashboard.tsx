import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ArrowLeft, Printer, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Worker, WorkerAdvance } from '../../types'
import { formatCurrency } from '../../lib/utils'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

const BRANCHES = ['all', '2', '4', '5']
const BRANCH_LABELS: Record<string, string> = { all: 'الكل', '2': 'الفرع 2', '4': 'الفرع 4', '5': 'الفرع 5' }
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

type WorkerWithAdvances = Worker & { advances: WorkerAdvance[] }
const EMPTY_WORKERS: WorkerWithAdvances[] = []

// جلب عمّال الشركة الشهريين وسلفهم غير المخصومة (مصدر React Query)
async function fetchPayrollWorkers(): Promise<WorkerWithAdvances[]> {
  const { data: wData } = await supabase.from('workers').select('*').eq('worker_type', 'company').eq('status', 'active').order('name')
  const { data: aData } = await supabase.from('worker_advances').select('*').eq('deducted', false)
  const advances = (aData ?? []) as WorkerAdvance[]
  return ((wData ?? []) as Worker[]).map(w => ({
    ...w,
    advances: advances.filter(a => a.worker_id === w.id),
  }))
}

export default function PayrollDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [branch, setBranch] = useState('all')
  const [payingAll, setPayingAll] = useState(false)
  // حالة "تم الصرف" مؤشّر جلسة مؤقت (لا يُحفظ في القاعدة) — منفصل عن بيانات الخادم
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set())
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())

  const { data: workers = EMPTY_WORKERS, isLoading } = useQuery({ queryKey: ['payroll-workers'], queryFn: fetchPayrollWorkers })

  const branchWorkers = useMemo(
    () => workers.filter(w => w.pay_type === 'monthly' && (branch === 'all' || w.branch === branch)),
    [workers, branch],
  )

  const { totalWPS, totalActual, totalAdvances } = useMemo(() => ({
    totalWPS: branchWorkers.reduce((s, w) => s + Number(w.basic_salary) + Number(w.social_allowance), 0),
    totalActual: branchWorkers.reduce((s, w) => s + Number(w.actual_salary), 0),
    totalAdvances: branchWorkers.reduce((s, w) => s + w.advances.reduce((a, adv) => a + Number(adv.amount), 0), 0),
  }), [branchWorkers])

  const paidCount = useMemo(() => branchWorkers.filter(w => paidIds.has(w.id)).length, [branchWorkers, paidIds])

  const exportWPS = () => {
    const rows = [
      ['CPR/GCC ID', 'Worker Name', 'IBAN/Wallet Number', 'Currency', 'Fixed Salary', 'Social Allowance', 'variable Salary BHD', 'Total Amount BHD', 'Salary Month', 'Salary year'],
      ...branchWorkers.map(w => [
        w.cpr,
        w.name_en || w.name,
        w.iban,
        'BHD',
        Number(w.basic_salary).toFixed(3),
        Number(w.social_allowance).toFixed(3),
        '0.000',
        (Number(w.basic_salary) + Number(w.social_allowance)).toFixed(3),
        MONTHS[month],
        year,
      ])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `WPS_${branch === 'all' ? 'AllBranches' : 'Branch' + branch}_${MONTHS[month]}_${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تصدير ملف WPS')
  }

  const handlePayAll = async () => {
    if (!window.confirm(`هل تريد تسجيل صرف الرواتب لـ ${branchWorkers.length} موظف؟`)) return
    setPayingAll(true)
    for (const w of branchWorkers) {
      for (const adv of w.advances) {
        await supabase.from('worker_advances').update({ deducted: true }).eq('id', adv.id)
      }
    }
    setPaidIds(prev => new Set([...prev, ...branchWorkers.map(w => w.id)]))
    queryClient.invalidateQueries({ queryKey: ['payroll-workers'] })
    toast.success(`تم تسجيل صرف الرواتب لـ ${branchWorkers.length} موظف`)
    setPayingAll(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/workers')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">كشف الرواتب الشهري</h1>
            <p className="text-slate-500 text-sm">احتساب وصرف جميع رواتب العمال والموظفين</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>طباعة</Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={exportWPS}>تصدير Excel</Button>
          <Button icon={<CheckCircle size={16} />} loading={payingAll} onClick={handlePayAll}>صرف الكل</Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {BRANCHES.map(b => (
            <button key={b} onClick={() => setBranch(b)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${branch === b ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >{BRANCH_LABELS[b]}</button>
          ))}
        </div>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30">
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* WPS Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-800">
        ملاحظة: كشف الرواتب هذا يشمل فقط عمال الشركة المسجلين. الأرقام المُصدَّرة (Fixed Salary + Social Allowance) هي فقط ما يتم تحويله عبر نظام الرواتب — بقية المبالغ تُحوَّل بشكل منفصل.
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'إجمالي الصافي', value: formatCurrency(totalWPS), color: '#7b4a2d', sub: `${branchWorkers.length} موظف` },
          { label: 'عدد الموظفين', value: String(branchWorkers.length), color: '#2563eb', sub: `تم الصرف: ${paidCount} / ${branchWorkers.length}` },
          { label: 'السلف المعلقة', value: formatCurrency(totalAdvances), color: '#dc2626', sub: 'تُخصم من الراتب' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">{kpi.label}</div>
            <div className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-600">
          {BRANCH_LABELS[branch]} — {MONTHS[month]} {year} ({branchWorkers.length} عامل)
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">جاري التحميل...</div>
        ) : branchWorkers.length === 0 ? (
          <div className="p-8 text-center text-slate-400">لا يوجد موظفون في هذا الفرع</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Worker Name</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">CPR/GCC ID</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Fixed Salary</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Social Allow.</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Total WPS</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">الراتب الفعلي</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">السلف المعلقة</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {branchWorkers.map(w => {
                  const pendingAdv = w.advances.reduce((s, a) => s + Number(a.amount), 0)
                  const wpsTotal = Number(w.basic_salary) + Number(w.social_allowance)
                  return (
                    <tr key={w.id} className={`hover:bg-slate-50/50 ${paidIds.has(w.id) ? 'bg-green-50/30' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        <div>{w.name_en || w.name}</div>
                        {w.branch && <div className="text-xs text-slate-400">فرع {w.branch}</div>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{w.cpr || '-'}</td>
                      <td className="px-4 py-2.5">{Number(w.basic_salary).toFixed(3)}</td>
                      <td className="px-4 py-2.5">{Number(w.social_allowance).toFixed(3)}</td>
                      <td className="px-4 py-2.5 font-bold text-green-700">{wpsTotal.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-blue-700">{Number(w.actual_salary).toFixed(3)}</td>
                      <td className="px-4 py-2.5">
                        {pendingAdv > 0 ? (
                          <span className="text-red-600 font-medium">{pendingAdv.toFixed(3)}</span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {paidIds.has(w.id) ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">تم الصرف</span>
                        ) : (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">معلق</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                <tr>
                  <td className="px-4 py-2.5" colSpan={2}>الإجمالي</td>
                  <td className="px-4 py-2.5">{branchWorkers.reduce((s, w) => s + Number(w.basic_salary), 0).toFixed(3)}</td>
                  <td className="px-4 py-2.5">{branchWorkers.reduce((s, w) => s + Number(w.social_allowance), 0).toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-green-700">{totalWPS.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-blue-700">{totalActual.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-red-600">{totalAdvances.toFixed(3)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
