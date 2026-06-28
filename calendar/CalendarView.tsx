import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar as CalIcon, ChevronRight, ChevronLeft, CreditCard, UserCog, FileText, ListTodo, Briefcase, Calculator, Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'

type EventType = 'cheque' | 'worker_doc' | 'invoice' | 'task' | 'project' | 'quote' | 'asset_doc'

interface CalEvent {
  id: string
  type: EventType
  date: string // YYYY-MM-DD
  title: string
  amount?: number
  link?: string
}

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

const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dateKey = (s: string | null) => (s ? s.slice(0, 10) : '')

export default function CalendarView() {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(new Date())
  const [selected, setSelected] = useState(toKey(new Date()))
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const safe = async <T,>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
        try { const { data } = await p; return data ?? [] } catch { return [] }
      }
      const [workers, assets, invoices, purchases, subPay, tasks, projects, quotes] = await Promise.all([
        safe(supabase.from('workers').select('id,name,visa_expiry,cpr_expiry,passport_expiry,status')),
        safe(supabase.from('assets').select('id,name,insurance_expiry,registration_expiry')),
        safe(supabase.from('invoices').select('id,invoice_number,customer_name,total,status,due_date')),
        safe(supabase.from('purchase_invoices').select('id,supplier_name,amount,payment_method,check_due_date')),
        safe(supabase.from('subcontractor_payments').select('id,amount,payment_method,check_due_date')),
        safe(supabase.from('tasks').select('id,title,due_date,status')),
        safe(supabase.from('projects').select('id,project_name,start_date,end_date')),
        safe(supabase.from('quotations').select('id,quote_number,customer_name,valid_until,status')),
      ])

      const ev: CalEvent[] = []

      for (const w of workers as Record<string, unknown>[]) {
        if (w.status === 'inactive') continue
        for (const [label, f] of [['انتهاء إقامة', 'visa_expiry'], ['انتهاء بطاقة', 'cpr_expiry'], ['انتهاء جواز', 'passport_expiry']] as const) {
          if (w[f]) ev.push({ id: `w-${w.id}-${f}`, type: 'worker_doc', date: dateKey(w[f] as string), title: `${label}: ${w.name}`, link: `/workers/${w.id}/edit` })
        }
      }
      for (const a of assets as Record<string, unknown>[]) {
        for (const [label, f] of [['انتهاء تأمين', 'insurance_expiry'], ['انتهاء استمارة', 'registration_expiry']] as const) {
          if (a[f]) ev.push({ id: `a-${a.id}-${f}`, type: 'asset_doc', date: dateKey(a[f] as string), title: `${label}: ${a.name}`, link: '/assets' })
        }
      }
      for (const p of purchases as Record<string, unknown>[]) {
        if (p.payment_method === 'deferred_cheque' && p.check_due_date)
          ev.push({ id: `pc-${p.id}`, type: 'cheque', date: dateKey(p.check_due_date as string), title: `شيك: ${p.supplier_name}`, amount: Number(p.amount) || 0, link: '/purchases' })
      }
      for (const s of subPay as Record<string, unknown>[]) {
        if (s.payment_method === 'cheque' && s.check_due_date)
          ev.push({ id: `sc-${s.id}`, type: 'cheque', date: dateKey(s.check_due_date as string), title: 'شيك مقاول باطن', amount: Number(s.amount) || 0, link: '/subcontractors' })
      }
      for (const inv of invoices as Record<string, unknown>[]) {
        if (inv.status !== 'paid' && inv.due_date)
          ev.push({ id: `inv-${inv.id}`, type: 'invoice', date: dateKey(inv.due_date as string), title: `فاتورة ${inv.invoice_number}`, amount: Number(inv.total) || 0, link: `/invoices/${inv.id}/view` })
      }
      for (const t of tasks as Record<string, unknown>[]) {
        if (t.status !== 'done' && t.due_date)
          ev.push({ id: `t-${t.id}`, type: 'task', date: dateKey(t.due_date as string), title: t.title as string, link: '/tasks' })
      }
      for (const pr of projects as Record<string, unknown>[]) {
        if (pr.start_date) ev.push({ id: `ps-${pr.id}`, type: 'project', date: dateKey(pr.start_date as string), title: `بداية: ${pr.project_name}`, link: `/projects/${pr.id}` })
        if (pr.end_date) ev.push({ id: `pe-${pr.id}`, type: 'project', date: dateKey(pr.end_date as string), title: `تسليم: ${pr.project_name}`, link: `/projects/${pr.id}` })
      }
      for (const q of quotes as Record<string, unknown>[]) {
        if (q.status === 'sent' && q.valid_until)
          ev.push({ id: `q-${q.id}`, type: 'quote', date: dateKey(q.valid_until as string), title: `انتهاء عرض ${q.quote_number}`, link: `/quotations/${q.id}` })
      }

      setEvents(ev)
      setLoading(false)
    }
    load()
  }, [])

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
    const startDay = first.getDay() // 0=أحد
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  const todayKey = toKey(new Date())
  const selectedEvents = eventsByDate[selected] ?? []

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
        <button onClick={goToday} className="text-sm text-slate-600 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100">اليوم</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* التقويم */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          {/* رأس الشهر */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"><ChevronRight size={20} /></button>
            <h2 className="font-bold text-slate-800">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
            <button onClick={nextMonth} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"><ChevronLeft size={20} /></button>
          </div>

          {/* أيام الأسبوع */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>)}
          </div>

          {/* الأيام */}
          {loading ? (
            <div className="text-center text-slate-400 py-12">جاري التحميل...</div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {grid.map((d, i) => {
                if (!d) return <div key={i} />
                const key = toKey(d)
                const dayEvents = eventsByDate[key] ?? []
                const isToday = key === todayKey
                const isSelected = key === selected
                return (
                  <button key={i} onClick={() => setSelected(key)}
                    className={`min-h-[64px] rounded-lg p-1.5 text-right border transition-colors ${
                      isSelected ? 'border-amber-400 bg-amber-50' : isToday ? 'border-slate-300 bg-slate-50' : 'border-transparent hover:bg-slate-50'
                    }`}>
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
          <h2 className="font-semibold text-slate-700 mb-3">
            {(() => { const [y, m, dd] = selected.split('-'); return `${parseInt(dd)} ${MONTHS[parseInt(m) - 1]} ${y}` })()}
          </h2>
          {selectedEvents.length === 0 ? (
            <div className="text-center text-slate-400 py-10 text-sm">لا توجد مواعيد في هذا اليوم</div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map(e => {
                const meta = TYPE_META[e.type]
                const Icon = meta.icon
                return (
                  <button key={e.id} onClick={() => e.link && navigate(e.link)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors text-right">
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
