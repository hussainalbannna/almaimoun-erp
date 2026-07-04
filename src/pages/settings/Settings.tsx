import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Printer, MessageCircle, Mail } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, openWhatsApp, openEmail } from '../../lib/utils'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

interface Customer { id: string; name: string; phone: string; whatsapp: string; email: string; address: string }
interface Invoice { id: string; invoice_number: string; issue_date: string; due_date: string | null; total: number; status: string; project_id: string | null }
interface Receipt { id: string; receipt_number: string; receipt_date: string; amount: number; invoice_id: string | null; payment_method: string }
interface Project { id: string; project_name: string }

interface StatementLine {
  date: string
  type: 'invoice' | 'receipt'
  ref: string
  description: string
  debit: number
  credit: number
  balance: number
  id: string
  status?: string
}

interface StatementData { customer: Customer | null; invoices: Invoice[]; receipts: Receipt[]; projects: Project[] }
const EMPTY_STATEMENT_DATA: StatementData = { customer: null, invoices: [], receipts: [], projects: [] }

// جلب بيانات كشف حساب العميل (مصدر React Query)
async function fetchClientStatement(customerId: string): Promise<StatementData> {
  const [custRes, invRes, recRes, projRes] = await Promise.all([
    supabase.from('customers').select('*').eq('id', customerId).maybeSingle(),
    supabase.from('invoices').select('*').eq('customer_id', customerId).neq('status', 'cancelled').order('issue_date'),
    supabase.from('receipts').select('*').eq('customer_id', customerId).order('receipt_date'),
    supabase.from('projects').select('id, project_name').eq('client_id', customerId),
  ])
  return {
    customer: (custRes.data as Customer) ?? null,
    invoices: (invRes.data ?? []) as Invoice[],
    receipts: (recRes.data ?? []) as Receipt[],
    projects: (projRes.data ?? []) as Project[],
  }
}

export default function ClientStatement() {
  const { customerId } = useParams<{ customerId: string }>()
  const navigate = useNavigate()

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))

  const { data = EMPTY_STATEMENT_DATA, isLoading } = useQuery({
    queryKey: ['client-statement', customerId],
    queryFn: () => fetchClientStatement(customerId!),
    enabled: !!customerId,
  })
  const { customer, invoices, receipts, projects } = data

  // بناء كشف الحساب (يُعاد فقط عند تغيّر البيانات أو الفترة)
  const statement = useMemo<StatementLine[]>(() => {
    const lines: StatementLine[] = []
    invoices.forEach(inv => {
      if (dateFrom && inv.issue_date < dateFrom) return
      if (dateTo && inv.issue_date > dateTo) return
      const proj = projects.find(p => p.id === inv.project_id)
      lines.push({
        date: inv.issue_date, type: 'invoice', ref: inv.invoice_number,
        description: proj ? `فاتورة — ${proj.project_name}` : 'فاتورة',
        debit: Number(inv.total), credit: 0, balance: 0, id: inv.id, status: inv.status,
      })
    })
    receipts.forEach(rec => {
      if (dateFrom && rec.receipt_date < dateFrom) return
      if (dateTo && rec.receipt_date > dateTo) return
      lines.push({
        date: rec.receipt_date, type: 'receipt', ref: rec.receipt_number,
        description: `إيصال استلام${rec.payment_method === 'cash' ? ' (نقداً)' : rec.payment_method === 'bank_transfer' ? ' (تحويل)' : ' (شيك)'}`,
        debit: 0, credit: Number(rec.amount), balance: 0, id: rec.id,
      })
    })
    lines.sort((a, b) => a.date.localeCompare(b.date))
    let running = 0
    lines.forEach(l => { running += l.debit - l.credit; l.balance = running })
    return lines
  }, [invoices, receipts, projects, dateFrom, dateTo])

  const totalDebit = statement.reduce((s, l) => s + l.debit, 0)
  const totalCredit = statement.reduce((s, l) => s + l.credit, 0)
  const balance = totalDebit - totalCredit

  const overdueInvoices = useMemo(() => invoices.filter(inv =>
    inv.status === 'overdue' || (inv.status === 'sent' && inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10))
  ), [invoices])

  const sendWhatsApp = () => {
    if (!customer) return
    const phone = customer.whatsapp || customer.phone
    if (!phone) { toast.error('لا يوجد رقم واتساب للعميل'); return }
    const lines = [
      `السلام عليكم ${customer.name}،`, ``,
      `إليكم كشف حسابكم لدى مؤسسة الميمون للمقاولات:`, ``,
      `• إجمالي الفواتير: ${formatCurrency(totalDebit)}`,
      `• إجمالي المدفوع: ${formatCurrency(totalCredit)}`,
      `• الرصيد المستحق: ${formatCurrency(balance)}`, ``,
      balance > 0 ? `نرجو سداد المبلغ المستحق في أقرب وقت. شكراً لثقتكم.` : `تم سداد جميع المستحقات. شكراً لكم.`,
    ]
    openWhatsApp(phone, lines.join('\n'))
  }

  const sendEmail = () => {
    if (!customer?.email) { toast.error('لا يوجد إيميل للعميل'); return }
    const body = [
      `السلام عليكم ${customer.name}،`, ``,
      `كشف حسابكم لدى مؤسسة الميمون للمقاولات:`,
      `إجمالي الفواتير: ${formatCurrency(totalDebit)}`,
      `إجمالي المدفوع: ${formatCurrency(totalCredit)}`,
      `الرصيد المستحق: ${formatCurrency(balance)}`,
    ].join('\n')
    openEmail(customer.email, 'كشف حساب — مؤسسة الميمون للمقاولات', body)
  }

  if (isLoading) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
  if (!customer) return <div className="p-12 text-center text-slate-400">العميل غير موجود</div>

  return (
    <div className="p-6 print:p-2" dir="rtl">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/customers')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">كشف حساب</h1>
            <p className="text-slate-500 text-sm">{customer.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<MessageCircle size={16} />} onClick={sendWhatsApp}>واتساب</Button>
          <Button variant="secondary" icon={<Mail size={16} />} onClick={sendEmail}>إيميل</Button>
          <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>طباعة</Button>
        </div>
      </div>

      <div className="hidden print:block mb-6 text-center">
        <h1 className="text-2xl font-bold">مؤسسة الميمون للمقاولات</h1>
        <h2 className="text-lg mt-1">كشف حساب</h2>
        <p className="text-slate-600">العميل: {customer.name}</p>
        <p className="text-slate-500 text-sm">تاريخ الإصدار: {formatDate(new Date().toISOString().slice(0, 10))}</p>
      </div>

      {overdueInvoices.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-800">
          ⚠️ يوجد {overdueInvoices.length} فاتورة متأخرة — إجمالي: {formatCurrency(overdueInvoices.reduce((s, i) => s + Number(i.total), 0))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">إجمالي الفواتير</div>
          <div className="text-xl font-bold" style={{ color: '#7b4a2d' }}>{formatCurrency(totalDebit)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{invoices.length} فاتورة</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">إجمالي المدفوع</div>
          <div className="text-xl font-bold text-green-600">{formatCurrency(totalCredit)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{receipts.length} إيصال</div>
        </div>
        <div className={`rounded-xl border p-4 ${balance > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div className="text-xs text-slate-500 mb-1">{balance > 0 ? 'الرصيد المستحق' : 'رصيد صافي'}</div>
          <div className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(Math.abs(balance))}</div>
          {balance === 0 && <div className="text-xs text-green-700 mt-0.5">✓ الحساب صافي</div>}
        </div>
      </div>

      <div className="flex gap-3 mb-4 print:hidden">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">من:</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">إلى:</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">التاريخ</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">المرجع</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">البيان</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">مديونية</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">دائنية</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">الرصيد</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {statement.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد حركات</td></tr>
            ) : (
              statement.map((line, i) => (
                <tr key={i} className={`hover:bg-slate-50/50 ${line.type === 'receipt' ? 'bg-green-50/30' : ''}`}>
                  <td className="px-4 py-3 text-slate-600">{formatDate(line.date)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{line.ref}</td>
                  <td className="px-4 py-3 text-slate-800">{line.description}
                    {line.status === 'overdue' && <span className="mr-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">متأخرة</span>}
                  </td>
                  <td className="px-4 py-3 font-medium text-red-600">{line.debit > 0 ? formatCurrency(line.debit) : '—'}</td>
                  <td className="px-4 py-3 font-medium text-green-600">{line.credit > 0 ? formatCurrency(line.credit) : '—'}</td>
                  <td className={`px-4 py-3 font-bold ${line.balance > 0 ? 'text-red-600' : line.balance < 0 ? 'text-green-600' : 'text-slate-400'}`}>
                    {formatCurrency(Math.abs(line.balance))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-200">
            <tr>
              <td colSpan={3} className="px-4 py-3 font-bold text-slate-800">الإجمالي</td>
              <td className="px-4 py-3 font-bold text-red-600">{formatCurrency(totalDebit)}</td>
              <td className="px-4 py-3 font-bold text-green-600">{formatCurrency(totalCredit)}</td>
              <td className={`px-4 py-3 font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(Math.abs(balance))} {balance > 0 ? '(مستحق)' : '(صافي)'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {projects.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-600 mb-3">المشاريع</div>
          <div className="flex flex-wrap gap-2">
            {projects.map(p => (
              <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className="text-xs bg-amber-50 text-amber-800 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors">
                {p.project_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}