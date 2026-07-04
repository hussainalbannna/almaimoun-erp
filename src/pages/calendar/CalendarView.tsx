import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Calendar as CalIcon, ChevronRight, ChevronLeft, CreditCard, UserCog, FileText, ListTodo, Briefcase, Calculator, Package, RefreshCw } from 'lucide-react'
import { safeSelect } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'

type EventType = 'cheque' | 'worker_doc' | 'invoice' | 'task' | 'project' | 'quote' | 'asset_doc'

interface CalEvent {
  id: string
  type: EventType
  date: string // YYYY-MM-DD
  title: string
  amount?: number
  link?: string
  overdue?: boolean
}

// ─── واجهات صفوف الاستعلامات (تحلّ محل الكاست وتلتقط أخطاء أسماء الحقول وقت البناء) ───
interface WorkerRow { id: string; name: string; visa_expiry: string | null; cpr_expiry: string | null; passport_expiry: string | null; status: string | null }
interface AssetRow { id: string; name: string; insurance_expiry: string | null; registration_expiry: string | null }
interface InvoiceRow { id: string; invoice_number: string; customer_name: string; total: number | null; status: string; due_date: string | null }
interface PurchaseRow { id: string; supplier_name: string; amount: number | null; payment_method: string | null; check_due_date: string | null }
interface SubPayRow { id: string; subcontractor_name: string | null; amount: number | null; payment_method: string | null; check_due_date: string | null; project_name: string | null }
interface TaskRow { id: string; title: string; due_date: string | null; status: string }
interface ProjectRow { id: string; project_name: string; start_date: string | null; end_date: string | null }
interface QuoteRow { id: string; quote_number: string; customer_name: string; valid_until: string | null; status: string }

const TYPE_META: Record<EventType, { label: string; color: string; icon: typeof CalIcon }> = {
  cheque: { label: 'شيك', color: '#dc2626', icon: CreditCard },
  worker_doc: { label: 'وثيقة عامل', color: '#d97706', icon: UserCog },
  asset_doc: { label: 'وثيقة معدة', color: '#ca8a04', icon: Package },
  invoice: { label: 'فاتورة', color: '#0284c7', icon: FileText },
  task: { label: 'مهمة', color: '#7c3aed', icon: ListTodo },
  project: { label: 'مشروع', color: '#16a34a', icon: Briefcase },
  quote: { label: 'عرض سعر', color: '#c4925a', icon: Calculator },
}

const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

const EMPTY_EVENTS: CalEvent[] = []

const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dateKey = (s: string | null | undefined) => (s ? s.slice(0, 10) : '')
const todayStr = () => toKey(new Date())

const arabicDateLabel = (key: string): string => {
  const [y, m, d] = key.split('-')
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`
}

// ════════════════════════════════════════════════════════════════════
//  بناء الأحداث — دالة نقية (تُبنى مرة واحدة داخل الاستعلام، وتُختبر بسهولة)
//  overdue = تاريخ الحدث قبل اليوم (يُبرَز بالأحمر في الشبكة والقائمة)
// ════════════════════════════════════════════════════════════════════
function buildEvents(src: {
  workers: WorkerRow[]
  assets: AssetRow[]
  invoices: InvoiceRow[]
  purchases: PurchaseRow[]
  subPay: SubPayRow[]
  tasks: TaskRow[]
  projects: ProjectRow[]
  quotes: QuoteRow[]
}, today: string): CalEvent[] {
  const ev: CalEvent[] = []
  const isOverdue = (d: string) => d < today

  // وثائق العمّال
  for (const w of src.workers) {
    if (w.status === 'inactive') continue
    for (const [label, value, field] of [
      ['انتهاء إقامة', w.visa_expiry, 'visa_expiry'],
      ['انتهاء بطاقة', w.cpr_expiry, 'cpr_expiry'],
      ['انتهاء جواز', w.passport_expiry, 'passport_expiry'],
    ] as const) {
      if (value) {
        const dk = dateKey(value)
        ev.push({ id: `w-${w.id}-${field}`, type: 'worker_doc', date: dk, title: `${label}: ${w.name}`, link: `/workers/${w.id}/edit`, overdue: isOverdue(dk) })
      }
    }
  }

  // وثائق المعدات
  for (const a of src.assets) {
    for (const [label, value, field] of [
      ['انتهاء تأمين', a.insurance_expiry, 'insurance_expiry'],
      ['انتهاء استمارة', a.registration_expiry, 'registration_expiry'],
    ] as const) {
      if (value) {
        const dk = dateKey(value)
        ev.push({ id: `a-${a.id}-${field}`, type: 'asset_doc', date: dk, title: `${label}: ${a.name}`, link: '/assets', overdue: isOverdue(dk) })
      }
    }
  }

  // شيكات المشتريات الآجلة
  for (const p of src.purchases) {
    if (p.payment_method === 'deferred_cheque' && p.check_due_date) {
      const dk = dateKey(p.check_due_date)
      ev.push({ id: `pc-${p.id}`, type: 'cheque', date: dk, title: `شيك: ${p.supplier_name}`, amount: Number(p.amount) || 0, link: '/purchases', overdue: isOverdue(dk) })
    }
  }

  // شيكات مقاولي الباطن
  for (const s of src.subPay) {
    if (s.payment_method === 'cheque' && s.check_due_date) {
      const dk = dateKey(s.check_due_date)
      ev.push({ id: `sc-${s.id}`, type: 'cheque', date: dk, title: `شيك مقاول: ${s.subcontractor_name || 'باطن'}${s.project_name ? ' — ' + s.project_name : ''}`, amount: Number(s.amount) || 0, link: '/subcontractors', overdue: isOverdue(dk) })
    }
  }

  // الفواتير غير المدفوعة
  for (const inv of src.invoices) {
    if (inv.status !== 'paid' && inv.due_date) {
      const dk = dateKey(inv.due_date)
      ev.push({ id: `inv-${inv.id}`, type: 'invoice', date: dk, title: `فاتورة ${inv.invoice_number}`, amount: Number(inv.total) || 0, link: `/invoices/${inv.id}/view`, overdue: isOverdue(dk) })
    }
  }

  // المهام غير المنجزة
  for (const t of src.tasks) {
    if (t.status !== 'done' && t.due_date) {
      const dk = dateKey(t.due_date)
      ev.push({ id: `t-${t.id}`, type: 'task', date: dk, title: t.title, link: '/tasks', overdue: isOverdue(dk) })
    }
  }

  // بدايات وتسليمات المشاريع
  for (const pr of src.projects) {
    if (pr.start_date) ev.push({ id: `ps-${pr.id}`, type: 'project', date: dateKey(pr.start_date), title: `بداية: ${pr.project_name}`, link: `/projects/${pr.id}` })
    if (pr.end_date) {
      const dk = dateKey(pr.end_date)
      ev.push({ id: `pe-${pr.id}`, type: 'project', date: dk, title: `تسليم: ${pr.project_name}`, link: `/projects/${pr.id}`, overdue: isOverdue(dk) })
    }
  }

  // انتهاء صلاحية عروض الأسعار المُرسلة
  for (const q of src.quotes) {
    if (q.status === 'sent' && q.valid_until) {
      const dk = dateKey(q.valid_until)
      ev.push({ id: `q-${q.id}`, type: 'quote', date: dk, title: `انتهاء عرض ${q.quote_number}`, link: `/quotations/${q.id}`, overdue: isOverdue(dk) })
    }
  }

  return ev
}

// جلب كل المصادر عبر safeSelect ثم بناء الأحداث
async function fetchCalendarEvents(): Promise<CalEvent[]> {
  const today = todayStr()
  const [workers, assets, invoices, purchases, subPay, tasks, projects, quotes] = await Promise.all([
    safeSelect<WorkerRow>('workers', 'id,name,visa_expiry,cpr_expiry,passport_expiry,status'),
    safeSelect<AssetRow>('assets', 'id,name,insurance_expiry,registration_expiry'),
    safeSelect<InvoiceRow>('invoices', 'id,invoice_number,customer_name,total,status,due_date'),
    safeSelect<PurchaseRow>('purchase_invoices', 'id,supplier_name,amount,payment_method,check_due_date'),
    safeSelect<SubPayRow>('subcontractor_payments', 'id,subcontractor_name,amount,payment_method,check_due_date,project_name'),
    safeSelect<TaskRow>('tasks', 'id,title,due_date,status'),
    safeSelect<ProjectRow>('projects', 'id,project_name,start_date,end_date'),
    safeSelect<QuoteRow>('quotations', 'id,quote_number,customer_name,valid_until,status'),
  ])
  return buildEvents({ workers, assets, invoices, purchases, subPay, tasks, projects, quotes }, today)
}

// ════════════════════════════════════════════════════════════════════
export default function CalendarView() {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => toKey(new Date()))

  const { data: events = EMPTY_EVENTS, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['calendar-events'],
    queryFn: fetchCalendarEvents,
  })

  // خريطة: تاريخ → أحداث
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    for (const e of events) {
      if (!e.date) continue
      (map[e.date] ??= []).push(e)
    }
    return map
  }, [events])

  // بناء شبكة الشهر
  const grid = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const first = new Date(y, m, 1)
    const startDay = first.getDay()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  const todayKey = todayStr()
  const selectedEvents = eventsByDate[selected] ?? EMPTY_EVENTS

  // عدد أحداث الشهر المعروض
  const monthEventCount = useMemo(() => {
    const prefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    return events.filter(e => e.date.startsWith(prefix)).length
  }, [events, cursor])

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
            <p className="text-sm text-slate-500">كل المواعيد والاستحقاقات</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => refetch()} title="تحديث" aria-label="تحديث المواعيد" className="p-2 text-slate-500 hover:text-amber-700 rounded-lg hover:bg-amber-50">
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={goToday} className="text-sm text-slate-600 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100">اليوم</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* التقويم */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          {/* رأس الشهر */}
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={prevMonth} aria-label="الشهر السابق" className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"><ChevronRight size={20} /></button>
            <div className="text-center">
              <h2 className="font-bold text-slate-800">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
              {monthEventCount > 0 && <span className="text-xs text-slate-400">{monthEventCount} موعد هذا الشهر</span>}
            </div>
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
                const hasOverdue = dayEvents.some(e => e.overdue)
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
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${isToday ? 'text-amber-700' : 'text-slate-700'}`}>{d.getDate()}</span>
                      {isToday && <span className="text-[9px] text-amber-600 font-medium">اليوم</span>}
                    </div>
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {dayEvents.slice(0, 4).map(e => (
                        <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: e.overdue ? '#dc2626' : TYPE_META[e.type].color }} />
                      ))}
                      {dayEvents.length > 4 && <span className="text-[9px] text-slate-400">+{dayEvents.length - 4}</span>}
                    </div>
                    {hasOverdue && <div className="w-full h-0.5 bg-red-400 rounded-full mt-0.5" />}
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">{arabicDateLabel(selected)}</h2>
            {selectedEvents.length > 0 && <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{selectedEvents.length}</span>}
          </div>
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
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors text-right ${e.overdue ? 'border-red-200 bg-red-50/40' : 'border-slate-100'}`}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta.color + '22' }}>
                      <Icon size={15} style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{e.title}</div>
                      <div className="text-xs flex items-center gap-1.5">
                        <span className="text-slate-400">{meta.label}</span>
                        {e.overdue && <span className="text-red-600 font-medium">· متأخر</span>}
                      </div>
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
