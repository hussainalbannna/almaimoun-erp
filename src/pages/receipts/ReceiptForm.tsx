import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Receipt, Customer, Invoice } from '../../types'
import { formatCurrency } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'cheque', label: 'شيك' },
  { value: 'card', label: 'بطاقة' },
  { value: 'benefit', label: 'بنفت' },
]

interface InvoiceWithBalance extends Invoice {
  remaining_balance: number
  total_receipts: number
}

export default function ReceiptForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const prefillInvoiceId = searchParams.get('invoice')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [allInvoices, setAllInvoices] = useState<InvoiceWithBalance[]>([])
  const [filteredInvoices, setFilteredInvoices] = useState<InvoiceWithBalance[]>([])
  const [saving, setSaving] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithBalance | null>(null)

  const [form, setForm] = useState<Partial<Receipt>>({
    receipt_number: '',
    receipt_date: new Date().toISOString().slice(0, 10),
    payment_method: 'cash',
    amount: 0,
    original_amount: 0,
    balance: 0,
    memo: '',
    reference_no: '',
    customer_name: '',
    customer_id: null,
    invoice_id: null,
    invoice_number: '',
  })

  // Load master data and compute real balances
  useEffect(() => {
    const load = async () => {
      const [cRes, iRes, rRes, allReceiptsRes] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('invoices').select('*').in('status', ['draft', 'sent', 'overdue', 'paid']).order('created_at', { ascending: false }),
        supabase.from('receipts').select('receipt_number'),
        supabase.from('receipts').select('invoice_id, amount'),
      ])

      setCustomers((cRes.data ?? []) as Customer[])

      // Compute receipts totals per invoice
      const receiptsByInvoice: Record<string, number> = {}
      ;(allReceiptsRes.data ?? []).forEach((r: { invoice_id: string | null; amount: number }) => {
        if (r.invoice_id) {
          receiptsByInvoice[r.invoice_id] = (receiptsByInvoice[r.invoice_id] ?? 0) + Number(r.amount)
        }
      })

      const invoicesWithBalance = ((iRes.data ?? []) as Invoice[]).map(inv => {
        const totalReceipts = receiptsByInvoice[inv.id] ?? 0
        const remaining = Number(inv.total) - totalReceipts
        return { ...inv, total_receipts: totalReceipts, remaining_balance: remaining }
      })

      setAllInvoices(invoicesWithBalance)

      // Generate next receipt number
      const nums = (rRes.data ?? []).map((r: { receipt_number: string }) => parseInt(r.receipt_number) || 0)
      const nextNum = String(Math.max(183, ...nums) + 1)
      setForm(prev => ({ ...prev, receipt_number: nextNum }))

      // Prefill if invoice param
      if (prefillInvoiceId) {
        const inv = invoicesWithBalance.find(i => i.id === prefillInvoiceId)
        if (inv) selectInvoice(inv)
      }
    }
    load()
  }, [])

  // Filter invoices by customer
  useEffect(() => {
    if (form.customer_id) {
      setFilteredInvoices(allInvoices.filter(i => i.customer_id === form.customer_id && i.remaining_balance > 0))
    } else {
      setFilteredInvoices(allInvoices.filter(i => i.remaining_balance > 0))
    }
  }, [form.customer_id, allInvoices])

  const selectInvoice = (inv: InvoiceWithBalance) => {
    setSelectedInvoice(inv)
    setForm(prev => ({
      ...prev,
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.issue_date,
      due_date: inv.due_date ?? undefined,
      original_amount: Number(inv.total),
      balance: inv.remaining_balance,
      amount: inv.remaining_balance,
      customer_name: inv.customer_name,
      customer_id: inv.customer_id,
    }))
  }

  const handleInvoiceChange = (invId: string) => {
    if (!invId) {
      setSelectedInvoice(null)
      setForm(prev => ({ ...prev, invoice_id: null, invoice_number: '', original_amount: 0, balance: 0 }))
      return
    }
    const inv = allInvoices.find(i => i.id === invId)
    if (inv) selectInvoice(inv)
  }

  const handleCustomerChange = (cid: string) => {
    const c = customers.find(x => x.id === cid)
    setForm(prev => ({
      ...prev,
      customer_id: cid || null,
      customer_name: c?.name ?? prev.customer_name,
      invoice_id: null,
      invoice_number: '',
      original_amount: 0,
      balance: 0,
    }))
    setSelectedInvoice(null)
  }

  const handleSave = async () => {
    if (!form.customer_name) { toast.error('يجب اختيار العميل'); return }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('يجب إدخال المبلغ'); return }
    if (selectedInvoice && Number(form.amount) > selectedInvoice.remaining_balance) {
      toast.error(`المبلغ يتجاوز الرصيد المتبقي (${selectedInvoice.remaining_balance.toFixed(3)} د.ب)`)
      return
    }
    setSaving(true)

    const { error } = await supabase.from('receipts').insert({ ...form })
    if (error) { toast.error('حدث خطأ: ' + error.message); setSaving(false); return }

    // Update invoice status based on remaining balance
    if (form.invoice_id && selectedInvoice) {
      const newRemaining = selectedInvoice.remaining_balance - Number(form.amount)
      let newStatus: string
      if (newRemaining <= 0) {
        newStatus = 'paid'
      } else if (selectedInvoice.total_receipts + Number(form.amount) > 0) {
        newStatus = 'sent' // partially paid - keep as 'sent' since there's no 'partial' status
      } else {
        newStatus = selectedInvoice.status
      }
      await supabase.from('invoices').update({ status: newStatus }).eq('id', form.invoice_id)

      // If linked to a milestone and fully paid, update milestone status
      if (newRemaining <= 0 && selectedInvoice.milestone_id) {
        await supabase.from('project_milestones').update({ status: 'paid' }).eq('id', selectedInvoice.milestone_id)
      }
    }

    toast.success('تم إنشاء الإيصال بنجاح')
    // الإيصال يغيّر متبقّي/حالة الفاتورة → تحديث القائمتين
    queryClient.invalidateQueries({ queryKey: ['receipts-list'] })
    queryClient.invalidateQueries({ queryKey: ['invoices-list'] })
    navigate('/receipts')
  }

  const customerOptions = useMemo(() => [
    { value: '', label: 'اختر العميل' },
    ...customers.map(c => ({ value: c.id, label: c.name + (c.company_name ? ` — ${c.company_name}` : '') }))
  ], [customers])

  const invoiceOptions = useMemo(() => [
    { value: '', label: 'ربط بفاتورة صادرة' },
    ...filteredInvoices.map(i => ({
      value: i.id,
      label: `#${i.invoice_number} — ${i.customer_name} — متبقي: ${i.remaining_balance.toFixed(3)} د.ب`
    }))
  ], [filteredInvoices])

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800">إيصال استلام جديد</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="رقم الإيصال" value={form.receipt_number ?? ''} onChange={e => setForm(p => ({ ...p, receipt_number: e.target.value }))} />
          <Input label="تاريخ الإيصال" type="date" value={form.receipt_date ?? ''} onChange={e => setForm(p => ({ ...p, receipt_date: e.target.value }))} />
        </div>

        <Select label="العميل *" value={form.customer_id ?? ''} onChange={e => handleCustomerChange(e.target.value)} options={customerOptions} />
        {!form.customer_id && (
          <Input label="اسم العميل (إدخال يدوي)" value={form.customer_name ?? ''} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} />
        )}

        {/* Invoice linking dropdown */}
        <div>
          <Select
            label="ربط بفاتورة صادرة (Invoice Serial)"
            value={form.invoice_id ?? ''}
            onChange={e => handleInvoiceChange(e.target.value)}
            options={invoiceOptions}
          />
          {filteredInvoices.length === 0 && form.customer_id && (
            <p className="text-xs text-slate-400 mt-1">لا توجد فواتير برصيد مفتوح لهذا العميل</p>
          )}
        </div>

        {/* Invoice balance info card */}
        {selectedInvoice && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-slate-500 text-xs block mb-0.5">رقم الفاتورة</span>
                <div className="font-bold text-slate-800">#{selectedInvoice.invoice_number}</div>
              </div>
              <div>
                <span className="text-slate-500 text-xs block mb-0.5">إجمالي الفاتورة</span>
                <div className="font-bold text-slate-800">{formatCurrency(Number(selectedInvoice.total))}</div>
              </div>
              <div>
                <span className="text-slate-500 text-xs block mb-0.5">المحصّل سابقاً</span>
                <div className="font-bold text-green-700">{formatCurrency(selectedInvoice.total_receipts)}</div>
              </div>
              <div>
                <span className="text-slate-500 text-xs block mb-0.5">المتبقي (د.ب)</span>
                <div className="font-bold text-red-700">{formatCurrency(selectedInvoice.remaining_balance)}</div>
              </div>
            </div>
            <div className="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (selectedInvoice.total_receipts / Number(selectedInvoice.total)) * 100)}%` }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="المبلغ المستلم (د.ب) *"
            type="number"
            value={String(form.amount ?? 0)}
            onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
          />
          <Select
            label="طريقة الدفع"
            value={form.payment_method ?? 'cash'}
            onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
            options={PAYMENT_OPTIONS}
          />
        </div>

        {/* Show what will happen */}
        {selectedInvoice && Number(form.amount) > 0 && (
          <div className={`p-3 rounded-lg border text-sm font-medium ${
            Number(form.amount) >= selectedInvoice.remaining_balance
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {Number(form.amount) >= selectedInvoice.remaining_balance
              ? 'سيتم تحديث حالة الفاتورة إلى: مدفوعة بالكامل'
              : `بعد هذا الإيصال: المتبقي = ${(selectedInvoice.remaining_balance - Number(form.amount)).toFixed(3)} د.ب (مدفوعة جزئياً)`
            }
          </div>
        )}

        <Input label="رقم المرجع / رقم الشيك" value={form.reference_no ?? ''} onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))} />
        <Textarea label="ملاحظات (Memo)" value={form.memo ?? ''} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} rows={2} />
      </div>

      <div className="flex gap-3 mt-4">
        <Button loading={saving} onClick={handleSave}>إنشاء الإيصال</Button>
        <Button variant="secondary" onClick={() => navigate(-1)}>إلغاء</Button>
      </div>
    </div>
  )
}
