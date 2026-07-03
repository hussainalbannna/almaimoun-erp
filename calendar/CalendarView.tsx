import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Calendar as CalIcon, ChevronRight, ChevronLeft, Banknote, ShieldCheck,
  UserCog, FileText, ListTodo, Briefcase, Calculator, Package, KeyRound,
} from 'lucide-react'
import { safeSelect } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'

// ════════════════════════════════════════════════════════════════════
//  التقويم — كل المواعيد والاستحقاقات في شبكة واحدة
//  الشيكات من مركز الشيكات (جدول cheques — مصدر الحقيقة):
//  المعلّقة فقط تظهر، والمصروف/المرتد/المسترجع لا يظهر كموعد قادم
//  + استحقاقات الإيجارات الدورية وانتهاء المؤقتة
// ════════════════════════════════════════════════════════════════════

type EventType = 'cheque' | 'guarantee' | 'rental' | 'worker_doc' | 'invoice' | 'task' | 'project' | 'quote' | 'asset_doc'

interface CalEvent {
  id: string
  type: EventType
  date: string // YYYY-MM-DD
  title: string
  amount?: number
  link?: string
}

interface RentalRow {
  id: string
  name: string
  rental_type: string
  billing_cycle: string
  cost: number
  due_day: number | null
  start_date: string | null
  end_date: string | null
  status: string
}

// ─── واجهات صفوف الاستعلامات: تحلّ محل unknown/الكاست وتلتقط أخطاء أسماء الحقول وقت البناء ───
interface ChequeRow {
  id: string
  cheque_number: string | null
  cheque_type: string | null
  direction: string | null
  party_name: string | null
  amount: number | null
  due_date: string | null
  status: string | null
}

interface WorkerRow {
  id: string
  name: string
  visa_expiry: string | null
  cpr_expiry: string | null
  passport_expiry: string | null
  status: string | null
}

interface AssetRow {
  id: string
  name: string
  insurance_expiry: string | null
  registration_expiry: string | null
}

interface InvoiceRow {
  id: string
  invoice_number: string
  customer_name: string
  total: number | null
  status: string
  due_date: string | null
}

interface TaskRow {
  id: string
  title: string
  due_date: string | null
  status: string
}

interface ProjectRow {
  id: string
  project_name: string
  start_date: string | null
  end_date: string | null
}

interface QuoteRow {
  id: string
  quote_number: string
  customer_name: string
  valid_until: string | null
  status: string
}

interface CalendarData {
  events: CalEvent[]
  rentals: RentalRow[]
}

const TYPE_META: Record<EventType, { label: string; color: string; icon: typeof CalIcon }> = {
  cheque: { label: 'شيك آجل', color: '#dc2626', icon: Banknote },
  guarantee: { label: 'شيك ضمان', color: '#2563eb', icon: ShieldCheck },
  rental: { label: 'إيجار', color: '#0d9488', icon: KeyRound },
  worker_doc: { label: 'وثيقة عامل', color: '#d97706', icon: UserCog },
  asset_doc: { label: 'وثيقة معدة', color: '#ca8a04', icon: Package },
  invoice: { label: 'فاتورة', color: '#0284c7', icon: FileText },
  task: { label: 'مهمة', color: '#7c3aed', icon: ListTodo },
  project: { label: 'مشروع', color: '#16a34a', icon: Briefcase },
  quote: { label: 'عرض سعر', color: '#c4925a', icon: Calculator },
}

const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const CYCLE_LABELS: Record<string, string> = { monthly: 'شهري', weekly: 'أسبوعي', daily: 'يومي', one_time: 'مرة واحدة' }

// مراجع فارغة ثابتة — تمنع إنشاء مصفوفات جديدة كل رندر وتحافظ على استقرار الـ useMemo
const EMPTY_EVENTS: CalEvent[] = []
const EMPTY_RENTALS: RentalRow[] = []

const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dateKey = (s: string | null | undefined) => (s ? s.slice(0, 10) : '')

const arabicDateLabel = (key: string): string => {
  const [y, m, d] = key.split('-')
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`
}

// حقول الوثائق (التسمية + اسم العمود) — مصدر واحد يمنع تكرار الحلقات
const WORKER_DOC_FIELDS: ReadonlyArray<readonly [string, keyof WorkerRow]> = [
  ['انتهاء إقامة', 'visa_expiry'],
  ['انتهاء بطاقة', 'cpr_expiry'],
  ['انتهاء جواز', 'passport_expiry'],
]
const ASSET_DOC_FIELDS: ReadonlyArray<readonly [string, keyof AssetRow]> = [
  ['انتهاء تأمين', 'insurance_expiry'],
  ['انتهاء استمارة', 'registration_expiry'],
]

// ════════════════════════════════════════════════════════════════════
//  بناء الأحداث الثابتة — دالة نقية (تُبنى مرة واحدة داخل الاستعلام، وتُختبر بسهولة)
// ════════════════════════════════════════════════════════════════════
function buildFixedEvents(src: {
  cheques: ChequeRow[]
  rentals: RentalRow[]
  workers: WorkerRow[]
  assets: AssetRow[]
  invoices: InvoiceRow[]
  tasks: TaskRow[]
  projects: ProjectRow[]
  quotes: QuoteRow[]
}): CalEvent[] {
  const ev: CalEvent[] = []

  // الشيكات: المعلّقة فقط (المصروف والمرتد لا يظهر كموعد قادم)
  for (const c of src.cheques) {
    if (c.status !== 'pending' || !c.due_date) continue
    const isGuarantee = c.cheque_type === 'guarantee'
    const dirLabel = c.direction === 'incoming' ? ' (وارد)' : ''
    const who = c.party_name || (c.cheque_number ? `رقم ${c.cheque_number}` : '')
    ev.push({
      id: `chq-${c.id}`,
      type: isGuarantee ? 'guarantee' : 'cheque',
      date: dateKey(c.due_date),
      title: `${isGuarantee ? 'ضمان' : 'شيك'}: ${who}${dirLabel}`,
      amount: Number(c.amount) || 0,
      link: '/cheques',
    })
  }

  // انتهاء الإيجارات المؤقتة النشطة
  for (const r of src.rentals) {
    if (r.status === 'active' && r.rental_type === 'temporary' && r.end_date) {
      ev.push({ id: `rent-end-${r.id}`, type: 'rental', date: dateKey(r.end_date), title: `انتهاء إيجار: ${r.name}`, link: '/rentals' })
    }
  }

  // وثائق العمّال (إقامة/بطاقة/جواز) — النشطون فقط
  for (const w of src.workers) {
    if (w.status === 'inactive') continue
    for (const [label, field] of WORKER_DOC_FIELDS) {
      const value = w[field]
      if (value) ev.push({ id: `w-${w.id}-${field}`, type: 'worker_doc', date: dateKey(value), title: `${label}: ${w.name}`, link: `/workers/${w.id}/edit` })
    }
  }

  // وثائق الأصول والمعدات (تأمين/استمارة)
  for (const a of src.assets) {
    for (const [label, field] of ASSET_DOC_FIELDS) {
      const value = a[field]
      if (value) ev.push({ id: `a-${a.id}-${field}`, type: 'asset_doc', date: dateKey(value), title: `${label}: ${a.name}`, link: '/assets' })
    }
  }

  // الفواتير غير المدفوعة (تاريخ الاستحقاق)
  for (const inv of src.invoices) {
    if (inv.status !== 'paid' && inv.due_date) {
      ev.push({ id: `inv-${inv.id}`, type: 'invoice', date: dateKey(inv.due_date), title: `فاتورة ${inv.invoice_number}`, amount: Number(inv.total) || 0, link: `/invoices/${inv.id}/view` })
    }
  }

  // المهام غير المنجزة
  for (const t of src.tasks) {
    if (t.status !== 'done' && t.due_date) {
      ev.push({ id: `t-${t.id}`, type: 'task', date: dateKey(t.due_date), title: t.title, link: '/tasks' })
    }
  }

  // بدايات وتسليمات المشاريع
  for (const pr of src.projects) {
    if (pr.start_date) ev.push({ id: `ps-${pr.id}`, type: 'project', date: dateKey(pr.start_date), title: `بداية: ${pr.project_name}`, link: `/projects/${pr.id}` })
    if (pr.end_date) ev.push({ id: `pe-${pr.id}`, type: 'project', date: dateKey(pr.end_date), title: `تسليم: ${pr.project_name}`, link: `/projects/${pr.id}` })
  }

  // انتهاء صلاحية عروض الأسعار المُرسلة
  for (const q of src.quotes) {
    if (q.status === 'sent' && q.valid_until) {
      ev.push({ id: `q-${q.id}`, type: 'quote', date: dateKey(q.valid_until), title: `انتهاء عرض ${q.quote_number}`, link: `/quotations/${q.id}` })
    }
  }

  return ev
}

// ════════════════════════════════════════════════════════════════════
//  جلب كل مصادر التقويم دفعة واحدة عبر safeSelect المشترك
//  كل استعلام يفشل بأمان ويعيد [] دون إسقاط بقية المصادر
// ════════════════════════════════════════════════════════════════════
async function fetchCalendarData(): Promise<CalendarData> {
  const [cheques, rentals, workers, assets, invoices, tasks, projects, quotes] = await Promise.all([
    safeSelect<ChequeRow>('cheques', 'id,cheque_number,cheque_type,direction,party_name,amount,due_date,status'),
    safeSelect<RentalRow>('rentals', 'id,name,rental_type,billing_cycle,cost,due_day,start_date,end_date,status'),
    safeSelect<WorkerRow>('workers', 'id,name,visa_expiry,cpr_expiry,passport_expiry,status'),
    safeSelect<AssetRow>('assets', 'id,name,insurance_expiry,registration_expiry'),
    safeSelect<InvoiceRow>('invoices', 'id,invoice_number,customer_name,total,status,due_date'),
    safeSelect<TaskRow>('tasks', 'id,title,due_date,status'),
    safeSelect<ProjectRow>('projects', 'id,project_name,start_date,end_date'),
    safeSelect<QuoteRow>('quotations', 'id,quote_number,customer_name,valid_until,status'),
  ])

  const events = buildFixedEvents({ cheques, rentals, workers, assets, invoices, tasks, projects, quotes })
  return { events, rentals }
}

// ════════════════════════════════════════════════════════════════════
export default function CalendarView() {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => toKey(new Date()))

  // مصدر واحد للبيانات — يستفيد من التخزين المؤقت العام، ويمكن تحديثه بإبطال ['calendar-events']
  const { data, isLoading } = useQuery<CalendarData>({
    queryKey: ['calendar-events'],
    queryFn: fetchCalendarData,
  })

  const events = data?.events ?? EMPTY_EVENTS
  const rentals = data?.rentals ?? EMPTY_RENTALS

  // استحقاقات الإيجارات الدورية — تُولَّد للشهر المعروض وما حوله
  const rentalDueEvents = useMemo(() => {
    const out: CalEvent[] = []
    const active = rentals.filter(r => r.status === 'active' && r.rental_type === 'recurring' && r.due_day)
    for (let offset = -1; offset <= 1; offset++) {
      const monthDate = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1)
      const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
      for (const r of active) {
        const day = Math.min(Number(r.due_day), daysInMonth)
        const k = toKey(new Date(monthDate.getFullYear(), monthDate.getMonth(), day))
        // لا نعرض استحقاقات قبل بداية العقد أو بعد نهايته (إن حُددت)
        if (r.start_date && k < dateKey(r.start_date)) continue
        if (r.end_date && k > dateKey(r.end_date)) continue
        const cycleSuffix = r.billing_cycle !== 'monthly' ? ` (${CYCLE_LABELS[r.billing_cycle] ?? r.billing_cycle})` : ''
        out.push({
          id: `rent-due-${r.id}-${k}`,
          type: 'rental',
          date: k,
          title: `استحقاق إيجار: ${r.name}${cycleSuffix}`,
          amount: r.billing_cycle === 'monthly' ? Number(r.cost) || 0 : undefined,
          link: '/rentals',
        })
      }
    }
    return out
  }, [rentals, cursor])

  // خريطة: تاريخ → أحداث (الثابتة + استحقاقات الإيجار المولّدة)
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    for (const e of events.concat(rentalDueEvents)) {
      if (!e.date) continue
      (map[e.date] ??= []).push(e)
    }
    return map
  }, [events, rentalDueEvents])

  // بناء شبكة الشهر
  const grid = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const first = new Date(y, m, 1)
    const startDay = first.getDay() // 0=أحد
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  const todayKey = toKey(new Date())
  const selectedEvents = eventsByDate[selected] ?? EMPTY_EVENTS

  // إجمالي التزامات اليوم المختار (شيكات + إيجارات لها مبلغ)
  const selectedMoneyTotal = useMemo(
    () => selectedEvents
      .filter(e => (e.type === 'cheque' || e.type === 'guarantee' || e.type === 'rental') && e.amount)
      .reduce((s, e) => s + (e.amount || 0), 0),
    [selectedEvents],
  )

  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
  const goToday = () => { const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSelected(toKey(t)) }

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <CalIcon size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">التقويم</h1>
            <p className="text-sm text-slate-500">كل المواعيد والاستحقاقات — شيكات، إيجارات، وثائق، مشاريع</p>
          </div>
        </div>
        <button type="button" onClick={goToday} className="text-sm text-slate-600 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100">اليوم</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* التقويم */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          {/* رأس الشهر */}
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={prevMonth} aria-label="الشهر السابق" className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"><ChevronRight size={20} /></button>
            <h2 className="font-bold text-slate-800">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
            <button type="button" onClick={nextMonth} aria-label="الشهر التالي" className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"><ChevronLeft size={20} /></button>
          </div>

          {/* أيام الأسبوع */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>)}
          </div>

          {/* الأيام */}
          {isLoading ? (
            <div className="text-center text-slate-400 py-12">جاري التحميل...</div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {grid.map((d, i) => {
                if (!d) return <div key={i} />
                const key = toKey(d)
                const dayEvents = eventsByDate[key] ?? EMPTY_EVENTS
                const isToday = key === todayKey
                const isSelected = key === selected
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelected(key)}
                    aria-pressed={isSelected}
                    aria-label={`${arabicDateLabel(key)}${dayEvents.length ? ` — ${dayEvents.length} مواعيد` : ''}`}
                    className={`min-h-[64px] rounded-lg p-1.5 text-right border transition-colors ${
                      isSelected ? 'border-amber-400 bg-amber-50' : isToday ? 'border-slate-300 bg-slate-50' : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className={`text-sm font-medium ${isToday ? 'text-amber-700' : 'text-slate-700'}`}>{d.getDate()}</div>
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {dayEvents.slice(0, 4).map(e => (
                        <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: TYPE_META[e.type].color }} />
                      ))}
                      {dayEvents.length > 4 && <span className="text-[9px] text-slate-400">+{dayEvents.length - 4}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* وسيلة الإيضاح */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-slate-100">
            {(Object.keys(TYPE_META) as EventType[]).map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: TYPE_META[t].color }} />
                <span className="text-xs text-slate-500">{TYPE_META[t].label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* أحداث اليوم المختار */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-700 mb-3">{arabicDateLabel(selected)}</h2>
          {selectedMoneyTotal > 0 && (
            <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
              <span className="text-xs text-red-600 font-medium">التزامات هذا اليوم</span>
              <span className="text-sm font-bold text-red-700">{formatCurrency(selectedMoneyTotal)}</span>
            </div>
          )}
          {selectedEvents.length === 0 ? (
            <div className="text-center text-slate-400 py-10 text-sm">لا توجد مواعيد في هذا اليوم</div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map(e => {
                const meta = TYPE_META[e.type]
                const Icon = meta.icon
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => e.link && navigate(e.link)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors text-right"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta.color + '22' }}>
                      <Icon size={15} style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{e.title}</div>
                      <div className="text-xs text-slate-400">{meta.label}</div>
                    </div>
                    {e.amount ? <div className="text-sm font-bold text-slate-700 shrink-0">{formatCurrency(e.amount)}</div> : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
