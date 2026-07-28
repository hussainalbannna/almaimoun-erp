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
  manual_salary: number | null // (قديم) راتب الهيئة اليدوي — استُبدل بشبكة الحضور اليومية
  daily_rate: number | null    // أجر اليوم لعامل الهيئة في هذا الشهر
  present_days: number[] | null // أرقام أيام الحضور (1..عدد أيام الشهر)
  notes: string
  paid: boolean | null         // تم صرف راتب هذا العامل لهذا الشهر
  paid_at: string | null       // وقت الصرف
  net_paid: number | null      // الصافي المدفوع فعليًا وقت الصرف
}

// قرض مقسّط نشط للعامل — قسطه الشهري يُخصم تلقائيًا من راتب الشهر عند الصرف
interface LoanLite { id: string; monthly_installment: number; remaining_balance: number }

// عامل مع تعديلات الشهر المحدّد وسلفه المعلّقة ضمن ذلك الشهر
type PayrollWorker = Worker & {
  advances: WorkerAdvance[] // سلف معلّقة (غير مخصومة) تقع ضمن الشهر المحدّد
  loans: LoanLite[]         // قروض نشطة — يُخصم قسطها الشهري من الصافي ويُنقَص رصيدها عند الصرف
  overtime: number
  deduction: number
  presentDays: number[]      // أيام الحضور المحفوظة لهذا الشهر
  monthDailyRate: number | null // أجر اليوم المحفوظ لهذا الشهر (من payroll_adjustments) — مستقل عن الأجر الحالي
  paid: boolean              // تم صرف راتب هذا الشهر (من القاعدة)
}

// حالة تحرير الحقول لكل عامل في الجدول (نصّية لدعم الإدخال الجزئي)
interface RowEdit {
  dailyRate: string     // أجر اليوم على سجل العامل (يُستخدم فقط لعمال الهيئة)
  presentDays: number[] // أيام الحضور المحدّدة بالنقر في الشبكة
  overtime: string
  deduction: string
  newAdvance: string   // سلفة جديدة تُضاف لهذا الشهر (تُسجَّل في worker_advances)
}

const EMPTY_WORKERS: PayrollWorker[] = []
const EMPTY_EDIT: RowEdit = { dailyRate: '', presentDays: [], overtime: '0', deduction: '0', newAdvance: '' }

// السلفة معلّقة ضمن الفترة إن كان تاريخها في الشهر المحدّد أو أي شهر سابق
// (تُرحَّل السلف غير المخصومة حتى تُخصم فعليًا — month هنا 1..12)
function isOutstandingByPeriod(dateStr: string | null, month: number, year: number): boolean {
  if (!dateStr) return false
  const [y, m] = dateStr.split('-').map(Number)
  return y < year || (y === year && m <= month)
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
  const [wRes, aRes, adjRes, loanRes] = await Promise.all([
    supabase.from('workers').select('*').eq('status', 'active').order('name'),
    supabase.from('worker_advances').select('*').eq('deducted', false),
    // '*' يشمل daily_rate و present_days الجديدين
    supabase.from('payroll_adjustments').select('*').eq('month', month).eq('year', year),
    // القروض النشطة ذات الرصيد المتبقّي — قسطها يُخصم تلقائيًا من راتب الشهر
    supabase.from('worker_loans').select('id,worker_id,monthly_installment,remaining_balance').eq('status', 'active').gt('remaining_balance', 0),
  ])

  const advances = (aRes.data ?? []) as WorkerAdvance[]
  const adjustments = (adjRes.data ?? []) as PayrollAdjustment[]
  const loans = (loanRes.data ?? []) as (LoanLite & { worker_id: string })[]

  return ((wRes.data ?? []) as Worker[]).map(w => {
    const adj = adjustments.find(a => a.worker_id === w.id)
    return {
      ...w,
      advances: advances.filter(a => a.worker_id === w.id && isOutstandingByPeriod(a.advance_date, month, year)),
      loans: loans.filter(l => l.worker_id === w.id).map(l => ({ id: l.id, monthly_installment: Number(l.monthly_installment) || 0, remaining_balance: Number(l.remaining_balance) || 0 })),
      overtime: adj ? Number(adj.overtime) : 0,
      deduction: adj ? Number(adj.deduction) : 0,
      presentDays: adj && Array.isArray(adj.present_days) ? adj.present_days.map(Number) : [],
      monthDailyRate: adj && adj.daily_rate != null ? Number(adj.daily_rate) : null,
      paid: adj ? Boolean(adj.paid) : false,
    }
  })
}

export default function PayrollDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [branch, setBranch] = useState('all')
  const [payingAll, setPayingAll] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  // حالة "تم الصرف" تُقرأ من القاعدة (payroll_adjustments.paid) فتصمد بعد تحديث الصفحة
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set())
  // قيم الحقول القابلة للتعديل لكل عامل (تُهيّأ من بيانات الخادم عند كل تحميل/تغيير شهر)
  const [edits, setEdits] = useState<Record<string, RowEdit>>({})
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())

  const [addingTemp, setAddingTemp] = useState(false)

  const isLmraTab = branch === 'lmra'

  // عدد أيام الشهر المختار — يحدّد أعمدة شبكة الحضور
  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [month, year])

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
        // الأجر اليومي: أجر هذا الشهر المحفوظ إن وُجد، وإلا الأجر الحالي من سجل العامل (كافتراضي لشهر جديد)
        dailyRate: w.worker_type === 'lmra' ? String((w.monthDailyRate ?? Number(w.daily_rate)) || '') : '',
        presentDays: w.presentDays,
        overtime: String(w.overtime || 0),
        deduction: String(w.deduction || 0),
        newAdvance: '',
      }
    }
    setEdits(next)
  }, [workers])

  // مزامنة حالة "تم الصرف" من القاعدة عند كل تحميل/تغيير شهر
  useEffect(() => {
    setPaidIds(new Set(workers.filter(w => w.paid).map(w => w.id)))
  }, [workers])

  const setEdit = (id: string, field: 'dailyRate' | 'overtime' | 'deduction' | 'newAdvance', value: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_EDIT), [field]: value } }))

  // نقر خلية يوم: يبدّل وجود اليوم ضمن أيام الحضور (الشبكة تبدأ فارغة تمامًا)
  const toggleDay = (workerId: string, day: number) =>
    setEdits(prev => {
      const cur = prev[workerId] ?? EMPTY_EDIT
      const has = cur.presentDays.includes(day)
      const presentDays = has ? cur.presentDays.filter(d => d !== day) : [...cur.presentDays, day].sort((a, b) => a - b)
      return { ...prev, [workerId]: { ...cur, presentDays } }
    })

  // إضافة عامل مؤقت = إنشاء سجل عامل حقيقي خفيف (يظهر في التقارير اليومية ويُربط بالمشاريع)
  const addTemporaryWorker = async () => {
    const name = window.prompt('اسم العامل المؤقت:')?.trim()
    if (!name) return
    const rateInput = window.prompt('الأجر اليومي (اختياري):')?.trim()
    const daily_rate = rateInput ? (parseFloat(rateInput) || 0) : 0
    setAddingTemp(true)
    try {
      const { error } = await supabase.from('workers').insert({
        name,
        name_en: name,
        worker_type: 'lmra',
        pay_type: 'daily',
        daily_rate,
        status: 'active',
        is_temporary: true,
        branch: null,
      })
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['payroll-data', month, year] })
      toast.success(`تمت إضافة ${name}`)
    } catch (err) {
      toast.error('تعذّرت الإضافة: ' + ((err as Error)?.message ?? ''))
    } finally {
      setAddingTemp(false)
    }
  }

  // أرشفة عامل هيئة: ينتقل إلى "سابق" فيختفي من القوائم النشطة مع بقاء سجله وتاريخه
  const archiveWorker = async (w: PayrollWorker) => {
    if (!window.confirm(`أرشفة ${w.name_en || w.name}؟ سينتقل إلى العمال السابقين ويختفي من كشف الرواتب.`)) return
    setSavingId(w.id)
    try {
      const { error } = await supabase.from('workers').update({ status: 'former' }).eq('id', w.id)
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['payroll-data', month, year] })
      toast.success('تمت الأرشفة')
    } catch (err) {
      toast.error('تعذّرت الأرشفة: ' + ((err as Error)?.message ?? ''))
    } finally {
      setSavingId(null)
    }
  }

  // القيم الحيّة لعامل واحد (تشمل ما يكتبه المستخدم قبل الحفظ) — مصدر واحد للحساب والعرض
  // الأساس: عامل الشركة = actual_salary الثابت · عامل الهيئة = الأجر اليومي × عدد أيام الحضور
  const liveRow = (w: PayrollWorker) => {
    const e = edits[w.id] ?? EMPTY_EDIT
    const isLmra = w.worker_type === 'lmra'
    const overtime = parseFloat(e.overtime) || 0
    const deduction = parseFloat(e.deduction) || 0
    const newAdvance = parseFloat(e.newAdvance) || 0
    const pendingAdv = w.advances.reduce((s, a) => s + Number(a.amount), 0)
    // الأجر اليومي مصدره سجل العامل — نفس القيمة التي يستخدمها workerDayCost لتكلفة المشروع
    // عامل الشركة: الراتب الفعلي إن سُجّل، وإلا الأساسي + البدل الاجتماعي (نفس احتياطي finance.ts، يمنع صافيًا صفرًا/سالبًا)
    const companySalary = Number(w.actual_salary) || (Number(w.basic_salary) + Number(w.social_allowance))
    const base = isLmra ? (parseFloat(e.dailyRate) || Number(w.daily_rate) || 0) * e.presentDays.length : companySalary
    // قسط القروض المستحقّ هذا الشهر = مجموع أقساط القروض النشطة (كل قسط مسقوف بالمتبقّي كي لا يتجاوزه)
    const loanDue = w.loans.reduce((s, l) => s + Math.min(l.monthly_installment, l.remaining_balance), 0)
    const net = base + overtime - deduction - pendingAdv - newAdvance - loanDue
    return { e, isLmra, overtime, deduction, newAdvance, pendingAdv, loanDue, base, net }
  }

  // الإجماليات الحيّة للمجموعة النشطة (تعتمد على قيم التحرير الحالية)
  const totals = useMemo(() => {
    const t = { basic: 0, social: 0, wps: 0, base: 0, overtime: 0, deduction: 0, advances: 0, loans: 0, net: 0 }
    for (const w of activeWorkers) {
      const { overtime, deduction, pendingAdv, newAdvance, loanDue, base, net } = liveRow(w)
      t.basic += Number(w.basic_salary)
      t.social += Number(w.social_allowance)
      t.wps += Number(w.basic_salary) + Number(w.social_allowance)
      t.base += base
      t.overtime += overtime
      t.deduction += deduction
      t.advances += pendingAdv + newAdvance
      t.loans += loanDue
      t.net += net
    }
    return t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkers, edits])

  const paidCount = useMemo(() => activeWorkers.filter(w => paidIds.has(w.id)).length, [activeWorkers, paidIds])

  const branchTag = isLmraTab ? 'LMRA' : (branch === 'all' ? 'AllBranches' : 'Branch' + branch)

  // منطق موحّد لحفظ صف عامل — يستخدمه زر "حفظ" الفردي و"صرف الكل" لمنع أي تباعد.
  // pay=false: حفظ تعديلات الشهر فقط. pay=true: يحفظها + يعلّم "مدفوع" بالصافي ووقته + يخصم السلف المعلّقة.
  const persistWorkerRow = async (w: PayrollWorker, pay: boolean) => {
    const { e, overtime, deduction, newAdvance, isLmra, net } = liveRow(w)
    const payload: Record<string, unknown> = {
      worker_id: w.id, month: month + 1, year, overtime, deduction, updated_at: new Date().toISOString(),
    }
    const rate = parseFloat(e.dailyRate) || 0
    if (isLmra) {
      payload.present_days = e.presentDays
      payload.daily_rate = rate // أجر هذا الشهر يُخزَّن مع صف الشهر — لا يتأثر بتغيير الأجر لاحقًا
    } else {
      payload.manual_salary = null
    }
    if (pay) {
      payload.paid = true
      payload.paid_at = new Date().toISOString()
      payload.net_paid = Number(net.toFixed(3))
    }
    // نحدّث "الأجر الحالي" على سجل العامل فقط عند الشهر الجاري (كي لا يغيّر تعديل شهر ماضٍ الأجر الحالي وتكلفة المشاريع)
    const isCurrentMonth = month === new Date().getMonth() && year === new Date().getFullYear()
    if (isLmra && isCurrentMonth) {
      const { error: rateError } = await supabase.from('workers').update({ daily_rate: rate }).eq('id', w.id)
      if (rateError) throw rateError
    }
    const { error: adjError } = await supabase
      .from('payroll_adjustments')
      .upsert(payload, { onConflict: 'worker_id,month,year' })
    if (adjError) throw adjError

    if (newAdvance > 0) {
      // عند الصرف: السلفة الجديدة خُصمت فعليًا من صافي هذا الشهر ⇐ تُسجَّل «مخصومة» فورًا
      // كي لا تُرحَّل وتُخصم مرّة ثانية الشهر القادم. عند الحفظ فقط: تبقى معلّقة حتى الصرف.
      const { error: advError } = await supabase.from('worker_advances').insert({
        worker_id: w.id,
        amount: newAdvance,
        advance_date: advanceDateForPeriod(month, year),
        notes: `سلفة كشف ${MONTHS[month]} ${year}`,
        deducted: pay,
      })
      if (advError) throw advError
    }
    // عند الصرف فقط: خصم السلف المعلّقة التي احتُسبت في صافي هذا الشهر
    if (pay) {
      for (const adv of w.advances) {
        const { error: dedErr } = await supabase.from('worker_advances').update({ deducted: true }).eq('id', adv.id)
        if (dedErr) throw dedErr
      }
      // خصم قسط كل قرض نشط + إنقاص رصيده المتبقّي (يُغلق تلقائيًا عند بلوغ الصفر) — نفس القسط المحتسب في الصافي
      for (const l of w.loans) {
        const inst = Math.min(l.monthly_installment, l.remaining_balance)
        if (inst <= 0) continue
        const newBal = Number(Math.max(0, l.remaining_balance - inst).toFixed(3))
        const { error: loanErr } = await supabase.from('worker_loans')
          .update({ remaining_balance: newBal, status: newBal <= 0 ? 'completed' : 'active' }).eq('id', l.id)
        if (loanErr) throw loanErr
      }
    }
  }

  const saveRow = async (w: PayrollWorker) => {
    setSavingId(w.id)
    try {
      await persistWorkerRow(w, false)
      await queryClient.invalidateQueries({ queryKey: ['payroll-data', month, year] })
      toast.success(`تم حفظ تعديلات ${w.name_en || w.name}`)
    } catch (err) {
      toast.error('تعذّر الحفظ: ' + ((err as Error)?.message ?? ''))
    } finally {
      setSavingId(null)
    }
  }

  // حفظ الكل: يحفظ الأرقام المُدخلة لكل عمال التبويب الحالي دفعة واحدة (بلا صرف) — نفس زرّ الحفظ الفردي للجميع
  const handleSaveAll = async () => {
    if (activeWorkers.length === 0) { toast.error('لا يوجد موظفون للحفظ'); return }
    setSavingAll(true)
    try {
      for (const w of activeWorkers) await persistWorkerRow(w, false)
      await queryClient.invalidateQueries({ queryKey: ['payroll-data', month, year] })
      toast.success(`تم حفظ كشف ${activeWorkers.length} عامل`)
    } catch (err) {
      toast.error('تعذّر حفظ الكشف: ' + ((err as Error)?.message ?? ''))
    } finally {
      setSavingAll(false)
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

  // تصدير 3: شبكة حضور عمال الهيئة (timesheet شهري — عمود لكل يوم، ثم المجموع والصافي)
  const exportLmra = () => {
    if (lmraWorkers.length === 0) { toast.error('لا يوجد عمال هيئة للتصدير'); return }
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    const rows: (string | number)[][] = [
      ['اسم العامل', 'الأجر اليومي', ...days, 'المجموع', 'ساعات إضافية', 'خصم', 'الصافي'],
      ...lmraWorkers.map(w => {
        const { e, overtime, deduction, base, net } = liveRow(w)
        const rate = Number(w.daily_rate || 0)
        return [
          w.name_en || w.name,
          rate.toFixed(3),
          ...days.map(d => (e.presentDays.includes(d) ? rate.toFixed(3) : 0)),
          base.toFixed(3),
          overtime.toFixed(3),
          deduction.toFixed(3),
          net.toFixed(3),
        ]
      }),
      [
        'المجموع الكلي',
        '',
        ...days.map(() => ''),
        totals.base.toFixed(3),
        totals.overtime.toFixed(3),
        totals.deduction.toFixed(3),
        totals.net.toFixed(3),
      ],
    ]
    downloadCsv(rows, `LMRA_Timesheet_${MONTHS[month]}_${year}.csv`)
    toast.success('تم تصدير شبكة حضور عمال الهيئة')
  }

  // صرف الكل: يحفظ كامل كشف كل عامل لم يُصرف له بعد (تعديلات + سلف + صافٍ مدفوع + خصم السلف).
  // يُصرف فقط لغير المدفوعين (لا صرف مزدوج)، وإن فشل في المنتصف يُكمل الباقي عند إعادة المحاولة.
  const handlePayAll = async () => {
    const toPay = activeWorkers.filter(w => !w.paid)
    if (toPay.length === 0) { toast.error('لا يوجد موظفون بحاجة للصرف'); return }
    if (!window.confirm(`هل تريد تسجيل صرف الرواتب لـ ${toPay.length} عامل؟ سيُحفظ الكشف كاملًا وتُخصم السلف.`)) return
    setPayingAll(true)
    try {
      for (const w of toPay) await persistWorkerRow(w, true)
      await queryClient.invalidateQueries({ queryKey: ['payroll-data', month, year] })
      toast.success(`تم تسجيل صرف الرواتب لـ ${toPay.length} عامل`)
    } catch (err) {
      toast.error('تعذّر صرف الرواتب: ' + ((err as Error)?.message ?? ''))
    } finally {
      setPayingAll(false)
    }
  }

  const numCellClass = 'w-24 border border-slate-200 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30'
  const rateCellClass = 'w-20 border border-slate-200 rounded-md px-2 py-1 text-sm text-center text-blue-700 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/30'
  // خلية اليوم: فارغة تمامًا افتراضيًا · خضراء وتُظهر الأجر عند تحديد الحضور
  const dayCellClass = (on: boolean) =>
    `w-8 h-8 rounded text-[10px] font-semibold border transition-colors ${
      on ? 'bg-green-500 border-green-600 text-white' : 'bg-white border-slate-200 text-transparent hover:bg-slate-100'
    }`
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)

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
          <Button variant="secondary" icon={<Save size={16} />} loading={savingAll} onClick={handleSaveAll}>حفظ الكل</Button>
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
          عمال <strong>الهيئة</strong> ليسوا على حماية الأجور. أدخل <strong>الأجر اليومي</strong> لكل عامل، ثم انقر أيام حضوره في الشبكة (تبدأ فارغة — لا أيام مفترضة). المجموع = الأجر اليومي × عدد أيام الحضور. أضف الساعات الإضافية والخصم والسلفة ثم احفظ صفّه. زر <strong>إضافة عامل مؤقت</strong> يُنشئ سجل عامل حقيقي (هيئة/يومي) فيظهر في التقارير اليومية وتُربط تكلفته بالمشاريع. وعند انتهاء عمله استخدم <strong>أرشفة</strong>.
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
          { label: 'السلف المعلقة', value: formatCurrency(totals.advances), color: '#dc2626', sub: `أقساط قروض: ${totals.loans.toFixed(3)} — زيادة: ${totals.overtime.toFixed(3)} — خصم: ${totals.deduction.toFixed(3)}` },
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
        ) : activeWorkers.length === 0 && !isLmraTab ? (
          <div className="p-8 text-center text-slate-400">لا يوجد موظفون في هذا الفرع</div>
        ) : isLmraTab ? (
          /* ═══ شبكة حضور عمال الهيئة (timesheet شهري — عمود لكل يوم) ═══ */
          <div className="overflow-x-auto">
            <table className="text-sm min-w-max">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 sticky right-0 bg-slate-50 z-10 min-w-[9rem]">اسم العامل</th>
                  <th className="px-2 py-2.5 text-center font-semibold text-slate-600">الأجر اليومي</th>
                  {dayNumbers.map(d => (
                    <th key={d} className="px-0 py-2.5 text-center font-semibold text-slate-500 w-9 text-[11px]">{d}</th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-semibold text-slate-600">المجموع</th>
                  <th className="px-2 py-2.5 text-center font-semibold text-slate-600">ساعات إضافية</th>
                  <th className="px-2 py-2.5 text-center font-semibold text-slate-600">خصم</th>
                  <th className="px-2 py-2.5 text-center font-semibold text-slate-600">سلفة</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600">الصافي المستحق</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-slate-600">حفظ</th>
                </tr>
              </thead>

              {/* عمال الهيئة المسجّلون */}
              <tbody className="divide-y divide-slate-50">
                {lmraWorkers.map(w => {
                  const { e, pendingAdv, base, net } = liveRow(w)
                  const rate = parseFloat(e.dailyRate) || 0
                  const paid = paidIds.has(w.id)
                  return (
                    <tr key={w.id} className={`hover:bg-slate-50/50 ${paid ? 'bg-green-50/30' : ''}`}>
                      <td className={`px-3 py-2 font-medium text-slate-800 sticky right-0 z-10 ${paid ? 'bg-green-50' : 'bg-white'}`}>
                        <div>{w.name_en || w.name}</div>
                        <div className="text-xs text-slate-400">{e.presentDays.length} يوم حضور</div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="number" step="0.001" dir="ltr" placeholder="الأجر" value={e.dailyRate}
                          onChange={ev => setEdit(w.id, 'dailyRate', ev.target.value)}
                          className={rateCellClass} />
                      </td>
                      {dayNumbers.map(d => {
                        const on = e.presentDays.includes(d)
                        return (
                          <td key={d} className="p-0.5 text-center">
                            <button type="button" onClick={() => toggleDay(w.id, d)}
                              title={`يوم ${d}`}
                              className={dayCellClass(on)}>
                              {on ? (rate > 0 ? rate.toFixed(1) : '✓') : ''}
                            </button>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-center font-bold text-blue-700">{base.toFixed(3)}</td>
                      <td className="px-2 py-2 text-center">
                        <input type="number" step="0.001" dir="ltr" value={e.overtime}
                          onChange={ev => setEdit(w.id, 'overtime', ev.target.value)}
                          className={numCellClass} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="number" step="0.001" dir="ltr" value={e.deduction}
                          onChange={ev => setEdit(w.id, 'deduction', ev.target.value)}
                          className={numCellClass} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col items-center gap-1">
                          {pendingAdv > 0 && (
                            <span className="text-xs text-red-600 font-medium">معلّق: {pendingAdv.toFixed(3)}</span>
                          )}
                          <input type="number" step="0.001" dir="ltr" placeholder="سلفة جديدة" value={e.newAdvance}
                            onChange={ev => setEdit(w.id, 'newAdvance', ev.target.value)}
                            className={numCellClass} />
                        </div>
                      </td>
                      <td className={`px-3 py-2 font-bold ${net < 0 ? 'text-red-600' : 'text-slate-800'}`}>{net.toFixed(3)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-center gap-1">
                          <Button size="sm" variant="secondary" icon={<Save size={14} />}
                            loading={savingId === w.id} onClick={() => saveRow(w)}>حفظ</Button>
                          <button type="button" onClick={() => archiveWorker(w)}
                            className="text-xs text-slate-500 hover:text-red-600 hover:underline">أرشفة</button>
                          {paid && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">تم الصرف</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {lmraWorkers.length === 0 && (
                  <tr>
                    <td colSpan={daysInMonth + 8} className="px-4 py-4 text-center text-slate-400">لا يوجد عمال هيئة</td>
                  </tr>
                )}
                {/* إضافة عامل مؤقت = سجل عامل حقيقي يظهر فورًا في الشبكة أعلاه */}
                <tr className="bg-amber-50/40">
                  <td colSpan={daysInMonth + 8} className="px-3 py-2">
                    <button type="button" onClick={addTemporaryWorker} disabled={addingTemp}
                      className="text-xs font-semibold text-amber-800 border border-amber-300 bg-white rounded-lg px-2.5 py-1 hover:bg-amber-100 disabled:opacity-50">
                      {addingTemp ? 'جارٍ الإضافة...' : '＋ إضافة عامل مؤقت'}
                    </button>
                  </td>
                </tr>
              </tbody>

              <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                <tr>
                  <td className="px-3 py-2.5 sticky right-0 bg-slate-50 z-10" colSpan={2}>المجموع الكلي</td>
                  <td colSpan={daysInMonth}></td>
                  <td className="px-3 py-2.5 text-center text-blue-700">{totals.base.toFixed(3)}</td>
                  <td className="px-2 py-2.5 text-center text-green-700">{totals.overtime.toFixed(3)}</td>
                  <td className="px-2 py-2.5 text-center text-red-600">{totals.deduction.toFixed(3)}</td>
                  <td className="px-2 py-2.5 text-center text-red-600">{totals.advances.toFixed(3)}</td>
                  <td className="px-3 py-2.5">{totals.net.toFixed(3)}</td>
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
