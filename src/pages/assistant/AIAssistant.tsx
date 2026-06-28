import { useEffect, useRef, useState } from 'react'
import { Bot, Send, Loader2, Sparkles, User, Trash2, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { askAI, hasApiKey, type ChatMessage } from '../../lib/ai'

// عدد الأيام حتى تاريخ معيّن (سالب = منتهي)
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  if (isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

// أسئلة مقترحة جاهزة
const SUGGESTIONS = [
  'ما هو إجمالي الأرباح والمستحقات على العملاء؟',
  'أي عامل قاربت إقامته أو بطاقته على الانتهاء؟',
  'ما حالة مشاريعي الحالية وكم نسبة إنجاز كل مشروع؟',
  'كم إجمالي الشيكات الآجلة المستحقة هذا الشهر؟',
  'لخّص لي وضع الشركة المالي بشكل عام',
  'ما الفواتير غير المدفوعة وكم قيمتها؟',
]

interface BusinessData {
  projects: Record<string, unknown>[]
  workers: Record<string, unknown>[]
  invoices: Record<string, unknown>[]
  receipts: Record<string, unknown>[]
  suppliers: Record<string, unknown>[]
  milestones: Record<string, unknown>[]
  purchaseInvoices: Record<string, unknown>[]
  subPayments: Record<string, unknown>[]
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const bizData = useRef<BusinessData | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const keyOk = hasApiKey()

  // تحميل بيانات الشركة في الخلفية لتزويد المساعد بالسياق
  useEffect(() => {
    const load = async () => {
      try {
        const [projects, workers, invoices, receipts, suppliers, milestones, purchaseInvoices, subPayments] = await Promise.all([
          supabase.from('projects').select('project_number,project_name,client_name,location,contract_value,status,start_date,end_date'),
          supabase.from('workers').select('name,profession,nationality,worker_type,status,visa_expiry,cpr_expiry,passport_expiry,basic_salary,actual_salary,daily_rate'),
          supabase.from('invoices').select('invoice_number,customer_name,issue_date,due_date,status,total'),
          supabase.from('receipts').select('receipt_number,customer_name,amount,receipt_date'),
          supabase.from('suppliers').select('name,company_name,phone'),
          supabase.from('project_milestones').select('name,percentage,amount,status,project_id'),
          supabase.from('purchase_invoices').select('supplier_name,project_name,amount,payment_method,check_due_date,vendor_invoice_number').then(r => r).catch(() => ({ data: [] })),
          supabase.from('subcontractor_payments').select('amount,payment_method,check_due_date,payment_date').then(r => r).catch(() => ({ data: [] })),
        ])
        bizData.current = {
          projects: projects.data ?? [],
          workers: workers.data ?? [],
          invoices: invoices.data ?? [],
          receipts: receipts.data ?? [],
          suppliers: suppliers.data ?? [],
          milestones: milestones.data ?? [],
          purchaseInvoices: (purchaseInvoices as { data?: Record<string, unknown>[] }).data ?? [],
          subPayments: (subPayments as { data?: Record<string, unknown>[] }).data ?? [],
        }
        setDataReady(true)
      } catch {
        setDataReady(true) // نسمح بالمحاولة حتى لو فشل بعض التحميل
      }
    }
    load()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  // بناء ملخّص نصّي مختصر للبيانات (سياق للمساعد)
  const buildContext = (): string => {
    const d = bizData.current
    if (!d) return 'لا توجد بيانات محمّلة.'

    const today = new Date().toISOString().slice(0, 10)
    const lines: string[] = []
    lines.push(`التاريخ اليوم: ${today}`)
    lines.push(`العملة: دينار بحريني (د.ب)`)

    // المشاريع
    lines.push(`\n## المشاريع (${d.projects.length}):`)
    d.projects.forEach((p, i) => {
      const ms = d.milestones.filter(m => m.project_id === (p as { id?: string }).id)
      const done = ms.filter(m => m.status === 'invoiced' || m.status === 'paid').reduce((s, m) => s + Number(m.percentage || 0), 0)
      lines.push(`${i + 1}. ${p.project_name} | العميل: ${p.client_name} | الموقع: ${p.location} | قيمة العقد: ${p.contract_value} | الحالة: ${p.status} | نسبة الإنجاز المفوتر: ${done}%`)
    })

    // العمال + الوثائق المنتهية
    lines.push(`\n## العمال (${d.workers.length}):`)
    d.workers.forEach((w, i) => {
      const expiries: string[] = []
      for (const [label, field] of [['الإقامة', 'visa_expiry'], ['البطاقة', 'cpr_expiry'], ['الجواز', 'passport_expiry']] as const) {
        const v = w[field] as string | null
        if (v) {
          const dleft = daysUntil(v)
          if (dleft !== null && dleft <= 60) expiries.push(`${label} ${dleft < 0 ? 'منتهية منذ ' + Math.abs(dleft) + ' يوم' : 'بعد ' + dleft + ' يوم'}`)
        }
      }
      lines.push(`${i + 1}. ${w.name} | ${w.profession || ''} | ${w.nationality || ''} | ${w.status}${expiries.length ? ' | ⚠️ ' + expiries.join('، ') : ''}`)
    })

    // الفواتير
    const unpaid = d.invoices.filter(inv => inv.status !== 'paid')
    const totalUnpaid = unpaid.reduce((s, inv) => s + Number(inv.total || 0), 0)
    lines.push(`\n## الفواتير (${d.invoices.length}، غير مدفوعة: ${unpaid.length} بقيمة ${totalUnpaid.toFixed(3)}):`)
    d.invoices.forEach((inv) => {
      lines.push(`- ${inv.invoice_number} | ${inv.customer_name} | ${inv.total} | ${inv.status} | استحقاق: ${inv.due_date || '-'}`)
    })

    // الإيصالات (المقبوضات)
    const totalReceived = d.receipts.reduce((s, r) => s + Number(r.amount || 0), 0)
    lines.push(`\n## المقبوضات: إجمالي ${totalReceived.toFixed(3)} من ${d.receipts.length} إيصال`)

    // الشيكات الآجلة
    const cheques = [
      ...d.purchaseInvoices.filter(p => p.payment_method === 'deferred_cheque' && p.check_due_date).map(p => ({ amount: p.amount, due: p.check_due_date, who: p.supplier_name })),
      ...d.subPayments.filter(s => s.payment_method === 'cheque' && s.check_due_date).map(s => ({ amount: s.amount, due: s.check_due_date, who: 'مقاول باطن' })),
    ]
    const totalCheques = cheques.reduce((s, c) => s + Number(c.amount || 0), 0)
    lines.push(`\n## الشيكات الآجلة (${cheques.length} بقيمة ${totalCheques.toFixed(3)}):`)
    cheques.forEach(c => lines.push(`- ${c.amount} | استحقاق: ${c.due} | ${c.who}`))

    // الموردون
    lines.push(`\n## الموردون: ${d.suppliers.length} مورد`)

    return lines.join('\n')
  }

  const SYSTEM_PROMPT = `أنت مساعد ذكي لشركة "مؤسسة الميمون للمقاولات" المتخصصة في بناء الفلل في البحرين. مهمتك مساعدة صاحب الشركة في إدارة أعماله.

قواعد مهمة:
- أجب دائماً باللهجة الخليجية/العربية الواضحة والمختصرة.
- استند فقط إلى البيانات المرفقة أدناه. إذا لم تكن المعلومة موجودة، قل بوضوح "هذه المعلومة غير متوفرة في النظام حالياً".
- عند ذكر المبالغ استخدم الدينار البحريني (د.ب) بثلاث خانات عشرية.
- كن دقيقاً في الأرقام والحسابات. اعرض النتائج بشكل منظّم وسهل القراءة.
- إذا طُلب منك صياغة رسالة (واتساب/إيميل) اكتبها جاهزة للإرسال.
- لا تخترع أسماء أو أرقاماً غير موجودة في البيانات.

=== بيانات الشركة الحالية ===
{{CONTEXT}}`

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    if (!keyOk) return

    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const context = buildContext()
      const system = SYSTEM_PROMPT.replace('{{CONTEXT}}', context)
      const reply = await askAI(newMessages, system)
      setMessages([...newMessages, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: '⚠️ ' + ((e as Error)?.message ?? 'حدث خطأ، حاول مرة أخرى') }])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => setMessages([])

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">المساعد الذكي</h1>
            <p className="text-xs text-slate-500">
              {dataReady ? 'جاهز — اسأل عن أي شيء في نظامك' : 'جاري تحميل بياناتك...'}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50">
            <Trash2 size={15} /> محادثة جديدة
          </button>
        )}
      </div>

      {/* تنبيه عدم وجود مفتاح */}
      {!keyOk && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={18} />
          لتفعيل المساعد، أضف مفتاح الذكاء الاصطناعي من صفحة الإعدادات ← تبويب الذكاء الاصطناعي.
        </div>
      )}

      {/* منطقة المحادثة */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto text-center pt-8">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a22 0%, #7b4a2d22 100%)' }}>
              <Sparkles size={28} style={{ color: '#c4925a' }} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">كيف أقدر أساعدك اليوم؟</h2>
            <p className="text-slate-500 text-sm mb-6">اسألني عن مشاريعك، أرباحك، عمالك، فواتيرك، أو اطلب صياغة رسالة لعميل.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)} disabled={!keyOk || !dataReady}
                  className="text-right text-sm bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-amber-300 hover:bg-amber-50/40 transition-colors disabled:opacity-50 text-slate-700">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-slate-200' : ''}`}
                style={m.role === 'assistant' ? { background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' } : {}}>
                {m.role === 'user' ? <User size={16} className="text-slate-600" /> : <Bot size={16} className="text-white" />}
              </div>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-700'
              }`}>
                {m.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
              <Bot size={16} className="text-white" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
              <Loader2 size={18} className="animate-spin text-slate-400" />
            </div>
          </div>
        )}
      </div>

      {/* صندوق الإدخال */}
      <div className="border-t border-slate-200 bg-white px-6 py-4">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder={keyOk ? 'اكتب سؤالك هنا...' : 'فعّل المفتاح من الإعدادات أولاً'}
            disabled={!keyOk || loading}
            rows={1}
            className="flex-1 resize-none border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 max-h-32 disabled:bg-slate-50"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={() => send(input)}
            disabled={!keyOk || loading || !input.trim()}
            className="h-11 w-11 rounded-xl flex items-center justify-center text-white shrink-0 transition-opacity disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">قد يخطئ المساعد أحياناً — تحقّق من الأرقام المهمة</p>
      </div>
    </div>
  )
}