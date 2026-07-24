import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Printer, CheckCircle, ShieldCheck, Wallet, Save, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Worker, WorkerAdvance } from '../../types'
import { formatCurrency } from '../../lib/utils'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

// تبويبات: فروع الشركة + تبويب مستقل لعمال الهيئة
const BRANCHES = ['all', '2', '4', '5', 'lmra']
const BRANCH_LABELS: Record<string, string> = { all: 'الكل', '2': 'الفرع 2', '4': 'الفرع 4', '5': 'الفرع 5', lmra: 'الهيئة' }
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

// صف تعديلات كشف الرواتب لعامل واحد في شهر واحد (المصدر: جدول payroll_adjustments)
interface PayrollAdjustment {
  id: string
  worker_id: string
  month: number // 1..12
  year: number
  overtime: number       // زيادة/ساعات إضافية بالدينار
  deduction: number      // خصم بالدينار
  manual_salary: number | null // راتب عامل الهيئة اليدوي لهذا الشهر (NULL لعمال الشركة)
  notes: string
}

// عامل مع تعديلات الشهر المحدّد وسلفه المعلّقة ضمن ذلك الشهر
type PayrollWorker = Worker & {
  advances: WorkerAdvance[] // سلف معلّقة (غير مخصومة) تقع ضمن الشهر المحدّد
  overtime: number
  deduction: number
  manualSalary: number | null // من payroll_adjustments — يُستخدم لعمال الهيئة فقط
}

// حالة تحرير الحقول لكل عامل في الجدول (نصّية لدعم الإدخال الجزئي)
interface RowEdit {
  manualSalary: string // راتب الهيئة اليدوي لهذا الشهر (يُستخدم فقط لعمال الهيئة)
  overtime: string
  deduction: string
  newAdvance: string   // سلفة جديدة تُضاف لهذا الشهر (تُسجَّل في worker_advances)
}

const EMPTY_WORKERS: PayrollWorker[] = []
const EMPTY_EDIT: RowEdit = { manualSalary: '', overtime: '0', deduction: '0', newAdvance: '' }

// تحقّق أن تاريخ 'YYYY-MM-DD' يقع ضمن شهر/سنة محددين (month هنا 1..12)
function isInPeriod(dateStr: string | null, month: number, year: number): boolean {
  if (!dateStr) return false
  const [y, m] = dateStr.split('-').map(Number)
  return m === month && y === year
}

// تاريخ السلفة: اليوم إن كان الشهر المعروض هو الشهر الحالي، وإلا منتصف الشهر المختار
function advanceDateForPeriod(monthIndex: number, year: number): string {
  const now = new Date()
  if (now.getFullYear() === year && now.getMonth() === monthIndex) return now.toISOString().slice(0, 10)
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-15`
}

// تنزيل مصفوفة صفوف كملف CSV يفتح في Excel (BOM لدعم العربية + تهريب آمن للخلايا)
function downloadCsv(rows: (string | number)[][], filename: string) {
  const csv = rows
    .map(row =>
      row
        .map(cell => {
          const s = String(cell ?? '')
          // تغليف أي خلية تحوي فاصلة أو اقتباساً أو سطراً جديداً (يمنع كسر الأعمدة عند وجود فاصلة في الاسم)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// جلب كل العمال النشطين (شركة + هيئة) + سلفهم المعلّقة ضمن الشهر + تعديلات الشهر (مصدر React Query)
async function fetchPayrollData(monthIndex: number, year: number): Promise<PayrollWorker[]> {
  const month = monthIndex + 1 // تخزين قاعدة البيانات 1..12
  const [wRes, aRes, adjRes] = await Promise.all([
    supabase.from('workers').select('*').eq('status', 'active').order('name'),
    supabase.from('worker_advances').select('*').eq('deducted', false),
    supabase.from('payroll_adjustments').select('*').eq('month', month).eq('year', year),
  ])

  const advances = (aRes.data ?? []) as WorkerAdvance[]
  const adjustments = (adjRes.data ?? []) as PayrollAdjustment[]

  return ((wRes.data ?? []) as Worker[]).map(w => {
    const adj = adjustments.find(a => a.worker_id === w.id)
    return {
      ...w,
      advances: advances.filter(a => a.worker_id === w.id && isInPeriod(a.advance_date, month, year)),
      overtime: adj ? Number(adj.overtime) : 0,
      deduction: adj ? Number(adj.deduction) : 0,
      manualSalary: adj && adj.manual_salary != null ? Number(adj.manual_salary) : null,
    }
  })
}

export default function PayrollDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [branch, setBranch] = useState('all')
  const [payingAll, setPayingAll] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  // حالة "تم الصرف" مؤشّر جلسة مؤقت (لا يُحفظ في القاعدة) — منفصل عن بيانات الخادم
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set())
  // قيم الحقول القابلة للتعديل لكل عامل (تُهيّأ من بيانات الخادم عند كل تحميل/تغيير شهر)
  const [edits, setEdits] = useState<Record<string, RowEdit>>({})
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())

  const isLmraTab = branch === 'lmra'

  const { data: workers = EMPTY_WORKERS, isLoading } = useQuery({
    queryKey: ['payroll-data', month, year],
    queryFn: () => fetchPayrollData(month, year),
  })

  // عمال الشركة الشهريون حسب الفرع (المسار الأصلي — بلا أي تغيير في سلوكه)
  const branchWorkers = useMemo(
    () => workers.filter(w => w.worker_type === 'company' && w.pay_type === 'monthly' && (branch === 'all' || w.branch === branch)),
    [workers, branch],
  )

  // عمال الهيئة (مسار جديد منفصل)
  const lmraWorkers = useMemo(
    () => workers.filter(w => w.worker_type === 'lmra'),
    [workers],
  )

  // المجموعة النشطة حسب التبويب المختار
  const activeWorkers = isLmraTab ? lmraWorkers : branchWorkers

  // مزامنة حقول التحرير مع بيانات الخادم كلما تغيّر الشهر/السنة أو أُعيد الجلب
  useEffect(() => {
    const next: Record<string, RowEdit> = {}
    for (const w of workers) {
      next[w.id] = {
        manualSalary: w.manualSalary != null ? String(w.manualSalary) : '',
        overtime: String(w.overtime || 0),
        deduction: String(w.deduction || 0),
        newAdvance: '',
      }
    }
    setEdits(next)
  }, [workers])

  const setEdit = (id: string, field: keyof RowEdit, value: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_EDIT), [field]: value } }))

  // القيم الحيّة لعامل واحد (تشمل ما يكتبه المستخدم قبل الحفظ) — مصدر واحد للحساب والعرض
  // الأساس: عامل الشركة = actual_salary الثابت · عامل الهيئة = الراتب اليدوي المُدخَل لهذا الشهر
  const liveRow = (w: PayrollWorker) => {
    const e = edits[w.id] ?? EMPTY_EDIT
    const isLmra = w.worker_type === 'lmra'
    const overtime = parseFloat(e.overtime) || 0
    const deduction = parseFloat(e.deduction) || 0
    const newAdvance = parseFloat(e.newAdvance) || 0
    const pendingAdv = w.advances.reduce((s, a) => s + Number(a.amount), 0)
    const base = isLmra ? (parseFloat(e.manualSalary) || 0) : Number(w.actual_salary)
    const net = base + overtime - deduction - pendingAdv - newAdvance
    return { e, isLmra, overtime, deduction, newAdvance, pendingAdv, base, net }
  }

  // الإجماليات الحيّة للمجموعة النشطة (تعتمد على قيم التحرير الحالية)
  const totals = useMemo(() => {
    const t = { basic: 0, social: 0, wps: 0, base: 0, overtime: 0, deduction: 0, advances: 0, net: 0 }
    for (const w of activeWorkers) {
      const { overtime, deduction, pendingAdv, newAdvance, base, net } = liveRow(w)
      t.basic += Number(w.basic_salary)
      t.social += Number(w.social_allowance)
      t.wps += Number(w.basic_salary) + Number(w.social_allowance)
      t.base += base
      t.overtime += overtime
      t.deduction += deduction
      t.advances += pendingAdv + newAdvance
      t.net += net
    }
    return t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkers, edits])

  const paidCount = useMemo(() => activeWorkers.filter(w => paidIds.has(w.id)).length, [activeWorkers, paidIds])

  const branchTag = isLmraTab ? 'LMRA' : (branch === 'all' ? 'AllBranches' : 'Branch' + branch)

  // حفظ صف عامل: upsert لتعديلات الشهر (ساعات إضافية/خصم + الراتب اليدوي للهيئة) + تسجيل سلفة جديدة إن وُجدت
  const saveRow = async (w: PayrollWorker) => {
    const { overtime, deduction, newAdvance, isLmra } = liveRow(w)
    const manual_salary = isLmra ? (parseFloat(edits[w.id]?.manualSalary ?? '') || 0) : null
    setSavingId(w.id)
    try {
      const { error: adjError } = await supabase
        .from('payroll_adjustments')
        .upsert(
          { worker_id: w.id, month: month + 1, year, overtime, deduction, manual_salary, updated_at: new Date().toISOString() },
          { onConflict: 'worker_id,month,year' },
        )
      if (adjError) throw adjError

      if (newAdvance > 0) {
        const { error: advError } = await supabase.from('worker_advances').insert({
          worker_id: w.id,
          amount: newAdvance,
          advance_date: advanceDateForPeriod(month, year),
          notes: `سلفة كشف ${MONTHS[month]} ${year}`,
          deducted: false,
        })
        if (advError) throw advError
      }

      await queryClient.invalidateQueries({ queryKey: ['payroll-data', month, year] })
      toast.success(`تم حفظ تعديلات ${w.name_en || w.name}`)
    } catch (err) {
      toast.error('تعذّر الحفظ: ' + ((err as Error)?.message ?? ''))
    } finally {
      setSavingId(null)
    }
  }

  // تصدير 1: ملف حماية الأجور (WPS) — عمال الشركة فقط (لا يظهر في تبويب الهيئة)
  const exportWPS = () => {
    if (branchWorkers.length === 0) { toast.error('لا يوجد موظفون للتصدير'); return }
    const rows: (string | number)[][] = [
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
      ]),
    ]
    downloadCsv(rows, `WPS_${branchTag}_${MONTHS[month]}_${year}.csv`)
    toast.success('تم تصدير ملف حماية الأجور (WPS)')
  }

  // تصدير 2: كشف الرواتب الفعلية — عمال الشركة (الراتب الفعلي + الزيادة − الخصم − السلف = الصافي)
  const exportActual = () => {
    if (branchWorkers.length === 0) { toast.error('لا يوجد موظفون للتصدير'); return }
    const rows: (string | number)[][] = [
      ['اسم الموظف', 'CPR', 'الراتب الفعلي', 'ساعات إضافية', 'خصم', 'السلف', 'الصافي المستحق', 'الشهر', 'السنة'],
      ...branchWorkers.map(w => {
        const { overtime, deduction, pendingAdv, newAdvance, base, net } = liveRow(w)
        return [
          w.name_en || w.name,
          w.cpr || '-',
          base.toFixed(3),
          overtime.toFixed(3),
          deduction.toFixed(3),
          (pendingAdv + newAdvance).toFixed(3),
          net.toFixed(3),
          MONTHS[month],
          year,
        ]
      }),
      ['الإجمالي', '', totals.base.toFixed(3), totals.overtime.toFixed(3), totals.deduction.toFixed(3), totals.advances.toFixed(3), totals.net.toFixed(3), '', ''],
    ]
    downloadCsv(rows, `Salaries_${branchTag}_${MONTHS[month]}_${year}.csv`)
    toast.success('تم تصدير كشف الرواتب الفعلية')
  }

  // تصدير 3: رواتب عمال الهيئة (ملف منفصل تمامًا للحسابات الداخلية — بلا أعمدة WPS)
  const exportLmra = () => {
    if (lmraWorkers.length === 0) { toast.error('لا يوجد عمال هيئة للتصدير'); return }
    const rows: (string | number)[][] = [
      ['اسم العامل', 'CPR', 'نوع الأجر', 'الراتب', 'ساعات إضافية', 'خصم', 'السلف', 'الصافي المستحق', 'الشهر', 'السنة'],
      ...lmraWorkers.map(w => {
        const { overtime, deduction, pendingAdv, newAdvance, base, net } = liveRow(w)
        return [
          w.name_en || w.name,
          w.cpr || '-',
          w.pay_type === 'daily' ? 'يومي' : 'شهري',
          base.toFixed(3),
          overtime.toFixed(3),
          deduction.toFixed(3),
          (pendingAdv + newAdvance).toFixed(3),
          net.toFixed(3),
          MONTHS[month],
          year,
        ]
      }),
      ['الإجمالي', '', '', totals.base.toFixed(3), totals.overtime.toFixed(3), totals.deduction.toFixed(3), totals.advances.toFixed(3), totals.net.toFixed(3), '', ''],
    ]
    downloadCsv(rows, `LMRA_Salaries_${MONTHS[month]}_${year}.csv`)
    toast.success('تم تصدير رواتب عمال الهيئة')
  }

  const handlePayAll = async () => {
    if (activeWorkers.length === 0) { toast.error('لا يوجد موظفون'); return }
    if (!window.confirm(`هل تريد تسجيل صرف الرواتب لـ ${activeWorkers.length} عامل؟`)) return
    setPayingAll(true)
    for (const w of activeWorkers) {
      for (const adv of w.advances) {
        await supabase.from('worker_advances').update({ deducted: true }).eq('id', adv.id)
      }
    }
    setPaidIds(prev => new Set([...prev, ...activeWorkers.map(w => w.id)]))
    queryClient.invalidateQueries({ queryKey: ['payroll-data', month, year] })
    toast.success(`تم تسجيل صرف الرواتب لـ ${activeWorkers.length} عامل`)
    setPayingAll(false)
  }

  const numCellClass = 'w-24 border border-slate-200 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/workers')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">كشف الرواتب الشهري</h1>
            <p className="text-slate-500 text-sm">احتساب وصرف جميع رواتب العمال والموظفين</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>طباعة</Button>
          {isLmraTab ? (
            <Button variant="secondary" icon={<Users size={16} />} onClick={exportLmra}>تصدير رواتب الهيئة</Button>
          ) : (
            <>
              <Button variant="secondary" icon={<ShieldCheck size={16} />} onClick={exportWPS}>تصدير حماية الأجور (WPS)</Button>
              <Button variant="secondary" icon={<Wallet size={16} />} onClick={exportActual}>تصدير الرواتب الفعلية</Button>
            </>
          )}
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

      {/* Note */}
      {isLmraTab ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-xs text-blue-800">
          عمال <strong>الهيئة</strong> ليسوا على حماية الأجور. أدخل <strong>الراتب</strong> يدويًا لكل عامل لهذا الشهر (لأنهم يعملون أحيانًا)، مع الساعات الإضافية والخصم والسلفة، ثم احفظ صفّه. تُصدَّر لهم في ملف منفصل، وتُخصم تكلفتهم من الربح.
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-800">
          ملاحظة: <strong>الراتب الأساسي والبدل الاجتماعي (WPS)</strong> ثابتان لحماية الأجور — لا يمكن تعديلهما من هنا. أما <strong>الساعات الإضافية والخصم والسلفة</strong> فتُعدَّل لكل عامل ولكل شهر، ثم تُحفظ بزر الحفظ في صفّه.
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          isLmraTab
            ? { label: 'إجمالي رواتب الهيئة', value: formatCurrency(totals.base), color: '#7b4a2d', sub: `${activeWorkers.length} عامل` }
            : { label: 'إجمالي حماية الأجور (WPS)', value: formatCurrency(totals.wps), color: '#7b4a2d', sub: `${activeWorkers.length} موظف` },
          { label: 'إجمالي الصافي المستحق', value: formatCurrency(totals.net), color: '#2563eb', sub: `تم الصرف: ${paidCount} / ${activeWorkers.length}` },
          { label: 'السلف المعلقة', value: formatCurrency(totals.advances), color: '#dc2626', sub: `زيادة: ${totals.overtime.toFixed(3)} — خصم: ${totals.deduction.toFixed(3)}` },
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
          {BRANCH_LABELS[branch]} — {MONTHS[month]} {year} ({activeWorkers.length} عامل)
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">جاري التحميل...</div>
        ) : activeWorkers.length === 0 ? (
          <div className="p-8 text-center text-slate-400">{isLmraTab ? 'لا يوجد عمال هيئة' : 'لا يوجد موظفون في هذا الفرع'}</div>
        ) : isLmraTab ? (
          /* ═══ جدول عمال الهيئة (مسار جديد منفصل — بلا أعمدة WPS، الراتب يدوي) ═══ */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">اسم العامل</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">CPR</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">نوع الأجر</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">الراتب (يدوي)</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">ساعات إضافية</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">خصم</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">سلفة</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">الصافي المستحق</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">حفظ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lmraWorkers.map(w => {
                  const { e, pendingAdv, net } = liveRow(w)
                  const paid = paidIds.has(w.id)
                  return (
                    <tr key={w.id} className={`hover:bg-slate-50/50 ${paid ? 'bg-green-50/30' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        <div>{w.name_en || w.name}</div>
                        {w.pay_type === 'daily' && w.daily_rate ? (
                          <div className="text-xs text-slate-400">سعر اليوم: {Number(w.daily_rate).toFixed(3)}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{w.cpr || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{w.pay_type === 'daily' ? 'يومي' : 'شهري'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="number" step="0.001" dir="ltr" placeholder="الراتب" value={e.manualSalary}
                          onChange={ev => setEdit(w.id, 'manualSalary', ev.target.value)}
                          className={numCellClass + ' text-blue-700 font-medium'} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="number" step="0.001" dir="ltr" value={e.overtime}
                          onChange={ev => setEdit(w.id, 'overtime', ev.target.value)}
                          className={numCellClass} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="number" step="0.001" dir="ltr" value={e.deduction}
                          onChange={ev => setEdit(w.id, 'deduction', ev.target.value)}
                          className={numCellClass} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col items-center gap-1">
                          {pendingAdv > 0 && (
                            <span className="text-xs text-red-600 font-medium">معلّق: {pendingAdv.toFixed(3)}</span>
                          )}
                          <input type="number" step="0.001" dir="ltr" placeholder="سلفة جديدة" value={e.newAdvance}
                            onChange={ev => setEdit(w.id, 'newAdvance', ev.target.value)}
                            className={numCellClass} />
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 font-bold ${net < 0 ? 'text-red-600' : 'text-slate-800'}`}>{net.toFixed(3)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col items-center gap-1">
                          <Button size="sm" variant="secondary" icon={<Save size={14} />}
                            loading={savingId === w.id} onClick={() => saveRow(w)}>حفظ</Button>
                          {paid && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">تم الصرف</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                <tr>
                  <td className="px-4 py-2.5" colSpan={3}>الإجمالي</td>
                  <td className="px-4 py-2.5 text-center text-blue-700">{totals.base.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-center text-green-700">{totals.overtime.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-center text-red-600">{totals.deduction.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-center text-red-600">{totals.advances.toFixed(3)}</td>
                  <td className="px-4 py-2.5">{totals.net.toFixed(3)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          /* ═══ جدول عمال الشركة (المسار الأصلي — بلا أي تغيير) ═══ */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">اسم العامل</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">CPR</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">أساسي (WPS)</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">بدل اجتماعي</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">الراتب الفعلي</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">ساعات إضافية</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">خصم</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">سلفة</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">الصافي المستحق</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">حفظ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {branchWorkers.map(w => {
                  const { e, pendingAdv, base, net } = liveRow(w)
                  const paid = paidIds.has(w.id)
                  return (
                    <tr key={w.id} className={`hover:bg-slate-50/50 ${paid ? 'bg-green-50/30' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        <div>{w.name_en || w.name}</div>
                        {w.branch && <div className="text-xs text-slate-400">فرع {w.branch}</div>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{w.cpr || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{Number(w.basic_salary).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{Number(w.social_allowance).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-blue-700">{base.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="number" step="0.001" dir="ltr" value={e.overtime}
                          onChange={ev => setEdit(w.id, 'overtime', ev.target.value)}
                          className={numCellClass} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="number" step="0.001" dir="ltr" value={e.deduction}
                          onChange={ev => setEdit(w.id, 'deduction', ev.target.value)}
                          className={numCellClass} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col items-center gap-1">
                          {pendingAdv > 0 && (
                            <span className="text-xs text-red-600 font-medium">معلّق: {pendingAdv.toFixed(3)}</span>
                          )}
                          <input type="number" step="0.001" dir="ltr" placeholder="سلفة جديدة" value={e.newAdvance}
                            onChange={ev => setEdit(w.id, 'newAdvance', ev.target.value)}
                            className={numCellClass} />
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 font-bold ${net < 0 ? 'text-red-600' : 'text-slate-800'}`}>{net.toFixed(3)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col items-center gap-1">
                          <Button size="sm" variant="secondary" icon={<Save size={14} />}
                            loading={savingId === w.id} onClick={() => saveRow(w)}>حفظ</Button>
                          {paid && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">تم الصرف</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                <tr>
                  <td className="px-4 py-2.5" colSpan={2}>الإجمالي</td>
                  <td className="px-4 py-2.5">{totals.basic.toFixed(3)}</td>
                  <td className="px-4 py-2.5">{totals.social.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-blue-700">{totals.base.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-center text-green-700">{totals.overtime.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-center text-red-600">{totals.deduction.toFixed(3)}</td>
                  <td className="px-4 py-2.5 text-center text-red-600">{totals.advances.toFixed(3)}</td>
                  <td className="px-4 py-2.5">{totals.net.toFixed(3)}</td>
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
