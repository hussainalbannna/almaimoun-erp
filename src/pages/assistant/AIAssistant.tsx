import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bot, Send, Loader2, Sparkles, User, Trash2, AlertCircle, RefreshCw } from 'lucide-react'
import { safeSelect } from '../../lib/supabase'
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

const n = (v: unknown): number => Number(v) || 0
const fmt = (v: number): string => v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

// أسئلة مقترحة جاهزة
const SUGGESTIONS = [
  'ما ربح أو خسارة كل مشروع لدي؟',
  'لخّص لي وضع الشركة المالي بالكامل',
  'أي عامل قاربت إقامته أو بطاقته على الانتهاء؟',
  'كم إجمالي الشيكات الآجلة المستحقة قريباً؟',
  'كم ضريبة المشتريات القابلة للاسترداد تقريباً؟',
  'ما المشروع الأكثر ربحية والأقل ربحية؟',
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
  cashEntries: Record<string, unknown>[]
  quotations: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
  vos: Record<string, unknown>[]
}

// جلب بيانات الشركة للسياق (مصدر React Query) — كل استعلام يفشل بأمان عبر safeSelect
async function fetchBusinessData(): Promise<BusinessData> {
  const [projects, workers, invoices, receipts, suppliers, milestones, purchaseInvoices, subPayments, cashEntries, quotations, tasks, vos] = await Promise.all([
    safeSelect('projects', 'id,project_number,project_name,client_name,location,contract_value,status,start_date,end_date'),
    safeSelect('workers', 'name,profession,nationality,worker_type,status,visa_expiry,cpr_expiry,passport_expiry,basic_salary,actual_salary,daily_rate'),
    safeSelect('invoices', 'invoice_number,customer_name,issue_date,due_date,status,total,project_id'),
    safeSelect('receipts', 'receipt_number,customer_name,amount,receipt_date,project_id'),
    safeSelect('suppliers', 'name,company_name,phone'),
    safeSelect('project_milestones', 'name,percentage,amount,status,project_id'),
    safeSelect('purchase_invoices', 'supplier_name,project_id,project_name,amount,payment_method,check_due_date,vendor_invoice_number'),
    safeSelect('subcontractor_payments', 'amount,payment_method,check_due_date,payment_date,project_id'),
    safeSelect('accounts_payable', 'amount,category,expense_type,project_id,entry_date'),
    safeSelect('quotations', 'quote_number,customer_name,project_name,total,status,valid_until'),
    safeSelect('tasks', 'title,status,priority,due_date'),
    safeSelect('variation_orders', 'project_id,description,amount,status'),
  ])
  return { projects, workers, invoices, receipts, suppliers, milestones, purchaseInvoices, subPayments, cashEntries, quotations, tasks, vos }
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const keyOk = hasApiKey()

  // بيانات الشركة عبر React Query — تُخزَّن مؤقتاً فلا تُعاد الاستعلامات الـ12 عند كل دخول للصفحة
  const { data: bizData, isFetching, refetch } = useQuery({ queryKey: ['ai-business-data'], queryFn: fetchBusinessData })
  const dataReady = !isFetching && !!bizData

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  // بناء ملخّص نصّي ذكي للبيانات — مع حساب ربحية كل مشروع
  const buildContext = (): string => {
    const d = bizData
    if (!d) return 'لا توجد بيانات محمّلة.'

    const today = new Date().toISOString().slice(0, 10)
    const lines: string[] = []
    lines.push(`التاريخ اليوم: ${today}`)
    lines.push(`العملة: دينار بحريني (د.ب) بثلاث خانات عشرية`)
    lines.push(`النشاط: بناء فلل جديدة في البحرين (معفى من ضريبة المبيعات، لكن ضريبة المشتريات 10% قابلة للاسترداد ربع سنوياً)`)

    // ── ربحية كل مشروع (الأهم) ──
    lines.push(`\n## تحليل ربحية المشاريع (${d.projects.length} مشروع):`)
    lines.push(`[ملاحظة للحساب: ربح المشروع = (قيمة العقد + أوامر التغيير) − (مصروفات الصندوق + فواتير الموردين + مدفوعات المقاولين) المرتبطة بالمشروع]`)

    let totalContracts = 0, totalAllCosts = 0, totalReceivedAll = 0

    d.projects.forEach((p, i) => {
      const pid = (p as { id?: string }).id
      const contract = n(p.contract_value)

      const projVOs = d.vos.filter(v => v.project_id === pid && (v.status === 'approved' || v.status === 'معتمد'))
      const voTotal = projVOs.reduce((s, v) => s + n(v.amount), 0)

      const cashCost = d.cashEntries.filter(c => c.project_id === pid).reduce((s, c) => s + n(c.amount), 0)
      const supplierCost = d.purchaseInvoices.filter(pi => pi.project_id === pid).reduce((s, pi) => s + n(pi.amount), 0)
      const subCost = d.subPayments.filter(sp => sp.project_id === pid).reduce((s, sp) => s + n(sp.amount), 0)
      const totalCost = cashCost + supplierCost + subCost

      const received = d.receipts.filter(r => r.project_id === pid).reduce((s, r) => s + n(r.amount), 0)

      const revenue = contract + voTotal
      const profit = revenue - totalCost
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0
      const outstanding = revenue - received

      totalContracts += revenue
      totalAllCosts += totalCost
      totalReceivedAll += received

      lines.push(`\n${i + 1}. ${p.project_name} — ${p.client_name} (${p.location || 'بدون موقع'}) [${p.status}]`)
      lines.push(`   الإيراد: ${fmt(revenue)} (عقد ${fmt(contract)}${voTotal ? ' + أوامر تغيير ' + fmt(voTotal) : ''})`)
      lines.push(`   التكاليف: ${fmt(totalCost)} (صندوق ${fmt(cashCost)} + موردين ${fmt(supplierCost)} + مقاولين ${fmt(subCost)})`)
      lines.push(`   ${profit >= 0 ? 'الربح' : 'الخسارة'}: ${fmt(profit)} (هامش ${margin.toFixed(1)}%)`)
      lines.push(`   المقبوض: ${fmt(received)} | المتبقي على العميل: ${fmt(outstanding)}`)
    })

    const netProfit = totalContracts - totalAllCosts
    lines.push(`\n## الإجمالي العام:`)
    lines.push(`إجمالي قيمة العقود: ${fmt(totalContracts)} | إجمالي التكاليف: ${fmt(totalAllCosts)} | صافي الربح: ${fmt(netProfit)} | إجمالي المقبوض: ${fmt(totalReceivedAll)} | إجمالي المتبقي: ${fmt(totalContracts - totalReceivedAll)}`)

    // ── العمال + الوثائق المنتهية ──
    const activeWorkers = d.workers.filter(w => w.status !== 'inactive')
    lines.push(`\n## العمال (${activeWorkers.length} نشط):`)
    activeWorkers.forEach((w, i) => {
      const expiries: string[] = []
      for (const [label, field] of [['الإقامة', 'visa_expiry'], ['البطاقة', 'cpr_expiry'], ['الجواز', 'passport_expiry']] as const) {
        const v = w[field] as string | null
        if (v) {
          const dleft = daysUntil(v)
          if (dleft !== null && dleft <= 60) expiries.push(`${label} ${dleft < 0 ? 'منتهية منذ ' + Math.abs(dleft) + ' يوم' : 'بعد ' + dleft + ' يوم'}`)
        }
      }
      lines.push(`${i + 1}. ${w.name} | ${w.profession || ''} | ${w.nationality || ''}${expiries.length ? ' | ⚠️ ' + expiries.join('، ') : ''}`)
    })

    // ── الفواتير ──
    const unpaid = d.invoices.filter(inv => inv.status !== 'paid')
    const totalUnpaid = unpaid.reduce((s, inv) => s + n(inv.total), 0)
    lines.push(`\n## الفواتير: ${d.invoices.length} إجمالاً، غير مدفوعة ${unpaid.length} بقيمة ${fmt(totalUnpaid)}`)
    unpaid.forEach((inv) => lines.push(`- ${inv.invoice_number} | ${inv.customer_name} | ${fmt(n(inv.total))} | ${inv.status} | استحقاق: ${inv.due_date || '-'}`))

    // ── الشيكات الآجلة + ضريبة المشتريات ──
    const cheques = [
      ...d.purchaseInvoices.filter(p => p.payment_method === 'deferred_cheque' && p.check_due_date).map(p => ({ amount: n(p.amount), due: p.check_due_date, who: p.supplier_name })),
      ...d.subPayments.filter(s => s.payment_method === 'cheque' && s.check_due_date).map(s => ({ amount: n(s.amount), due: s.check_due_date, who: 'مقاول باطن' })),
    ]
    const totalCheques = cheques.reduce((s, c) => s + c.amount, 0)
    lines.push(`\n## الشيكات الآجلة (${cheques.length} بقيمة ${fmt(totalCheques)}):`)
    cheques.forEach(c => lines.push(`- ${fmt(c.amount)} | استحقاق: ${c.due} | ${c.who}`))

    const totalPurchases = d.purchaseInvoices.reduce((s, p) => s + n(p.amount), 0)
    const recoverableVAT = totalPurchases - (totalPurchases / 1.1)
    lines.push(`\n## ضريبة المشتريات القابلة للاسترداد: ~${fmt(Math.round(recoverableVAT * 1000) / 1000)} (من إجمالي مشتريات ${fmt(totalPurchases)})`)

    // ── عروض الأسعار ──
    if (d.quotations.length) {
      const pending = d.quotations.filter(q => q.status === 'sent')
      lines.push(`\n## عروض الأسعار: ${d.quotations.length} إجمالاً، بانتظار الرد ${pending.length}`)
      pending.forEach(q => lines.push(`- ${q.quote_number} | ${q.customer_name} | ${fmt(n(q.total))} | ينتهي: ${q.valid_until || '-'}`))
    }

    // ── المهام ──
    if (d.tasks.length) {
      const openTasks = d.tasks.filter(t => t.status !== 'done')
      lines.push(`\n## المهام المفتوحة (${openTasks.length}):`)
      openTasks.forEach(t => lines.push(`- ${t.title} | ${t.priority} | استحقاق: ${t.due_date || '-'}`))
    }

    lines.push(`\n## الموردون: ${d.suppliers.length} مورد`)

    return lines.join('\n')
  }

  const SYSTEM_PROMPT = `أنت مساعد ذكي ومحاسب خبير لشركة "مؤسسة الميمون للمقاولات" المتخصصة في بناء الفلل الجديدة في البحرين. مهمتك مساعدة صاحب الشركة في إدارة أعماله وحساباته بدقة.

قواعد مهمة:
- أجب دائماً باللهجة الخليجية/العربية الواضحة والمختصرة والعملية.
- استند فقط إلى البيانات المرفقة أدناه. إذا لم تكن المعلومة موجودة، قل بوضوح "هذه المعلومة غير متوفرة في النظام حالياً".
- عند ذكر المبالغ استخدم الدينار البحريني (د.ب) بثلاث خانات عشرية.
- كن دقيقاً جداً في الأرقام والحسابات. اعرض النتائج بشكل منظّم وسهل القراءة (جداول أو نقاط).
- بيانات ربحية المشاريع محسوبة مسبقاً في السياق — استخدمها مباشرة عند السؤال عن ربح/خسارة أي مشروع.
- ملاحظة ضريبية: المبيعات (البناء الجديد) معفاة من الضريبة، لكن ضريبة المشتريات من الموردين (10%) قابلة للاسترداد عبر إقرار ربع سنوي.
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
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} title="تحديث البيانات" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50">
            <RefreshCw size={15} className={!dataReady ? 'animate-spin' : ''} /> تحديث
          </button>
          {messages.length > 0 && (
            <button onClick={clearChat} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50">
              <Trash2 size={15} /> محادثة جديدة
            </button>
          )}
        </div>
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
            <p className="text-slate-500 text-sm mb-6">اسألني عن ربحية مشاريعك، وضعك المالي، عمالك، فواتيرك، أو اطلب صياغة رسالة لعميل.</p>
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
