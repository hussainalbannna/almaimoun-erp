import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { nextSerial, formatCurrency } from '../../lib/utils'
import type { Invoice, InvoiceItem, Customer, Project, ProjectMilestone, ExtractedDocumentData } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import DocumentUpload from '../../components/ui/DocumentUpload'
import toast from 'react-hot-toast'

const EMPTY_ITEM: Omit<InvoiceItem, 'id' | 'invoice_id'> = { description: '', quantity: 1, unit_price: 0, total: 0, sort_order: 0 }

const STATUS_OPTIONS = [
  { value: 'draft', label: 'مسودة' },
  { value: 'sent', label: 'مرسلة' },
  { value: 'paid', label: 'مدفوعة' },
  { value: 'overdue', label: 'متأخرة' },
  { value: 'cancelled', label: 'ملغاة' },
]

export default function InvoiceForm() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(searchParams.get('customer') ?? '')
  const [selectedProjectId, setSelectedProjectId] = useState(searchParams.get('project') ?? '')
  const [selectedMilestoneId, setSelectedMilestoneId] = useState(searchParams.get('milestone') ?? '')
  const [items, setItems] = useState<Array<Omit<InvoiceItem, 'id' | 'invoice_id'>>>([{ ...EMPTY_ITEM }])
  const [form, setForm] = useState({
    invoice_number: '',
    customer_name: '',
    customer_email: '',
    customer_address: '',
    customer_tax_number: '',
    ship_to: '',
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    status: 'draft',
    tax_rate: 5,
    discount: 0,
    notes: '',
    payment_terms: 'صافي 30 يوم',
  })
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  // Load master data
  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('projects').select('*').eq('status', 'active').order('project_name'),
    ]).then(([cRes, pRes]) => {
      setCustomers((cRes.data ?? []) as Customer[])
      setProjects((pRes.data ?? []) as Project[])
    })
  }, [])

  // Load milestones when project changes
  useEffect(() => {
    if (!selectedProjectId) { setMilestones([]); return }
    supabase.from('project_milestones').select('*').eq('project_id', selectedProjectId)
      .in('status', ['pending', 'in_progress', 'completed'])
      .order('sort_order')
      .then(({ data }) => setMilestones((data ?? []) as ProjectMilestone[]))
  }, [selectedProjectId])

  // Auto serial
  useEffect(() => {
    if (isEdit) return
    supabase.from('invoices').select('invoice_number').then(({ data }) => {
      const nums = (data ?? []).map((r: { invoice_number: string }) => r.invoice_number)
      setForm(prev => ({ ...prev, invoice_number: nextSerial(nums, 184) }))
    })
  }, [isEdit])

  // Load existing invoice for edit
  useEffect(() => {
    if (!isEdit) return
    supabase.from('invoices').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return
      const inv = data as Invoice
      setForm({
        invoice_number: inv.invoice_number,
        customer_name: inv.customer_name,
        customer_email: inv.customer_email,
        customer_address: inv.customer_address,
        customer_tax_number: inv.customer_tax_number,
        ship_to: inv.ship_to ?? '',
        issue_date: inv.issue_date,
        due_date: inv.due_date ?? '',
        status: inv.status,
        tax_rate: Number(inv.tax_rate),
        discount: Number(inv.discount),
        notes: inv.notes,
        payment_terms: inv.payment_terms,
      })
      setSelectedCustomerId(inv.customer_id ?? '')
      setSelectedProjectId(inv.project_id ?? '')
      setSelectedMilestoneId(inv.milestone_id ?? '')
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order').then(({ data: rows }) => {
        if (rows?.length) setItems(rows as InvoiceItem[])
      })
    })
  }, [id, isEdit])

  // Auto-fill from selected project
  useEffect(() => {
    if (!selectedProjectId) return
    const p = projects.find(x => x.id === selectedProjectId)
    if (!p) return
    setForm(prev => ({
      ...prev,
      customer_name: p.client_name || prev.customer_name,
      customer_tax_number: p.client_cpr || prev.customer_tax_number,
      customer_address: p.location || prev.customer_address,
      ship_to: p.location || prev.ship_to,
    }))
    // Also try to match to a customer record
    if (p.client_id) setSelectedCustomerId(p.client_id)
  }, [selectedProjectId, projects])

  // Auto-fill from selected customer
  useEffect(() => {
    if (!selectedCustomerId) return
    const c = customers.find(x => x.id === selectedCustomerId)
    if (!c) return
    setForm(prev => ({
      ...prev,
      customer_name: c.name || c.company_name,
      customer_email: c.email,
      customer_address: `${c.address}${c.city ? `, ${c.city}` : ''}`,
      customer_tax_number: c.tax_number,
    }))
  }, [selectedCustomerId, customers])

  // Auto-fill amount from milestone
  useEffect(() => {
    if (!selectedMilestoneId) return
    const m = milestones.find(x => x.id === selectedMilestoneId)
    if (!m) return
    setItems([{ description: m.name || m.description, quantity: 1, unit_price: Number(m.amount), total: Number(m.amount), sort_order: 0 }])
  }, [selectedMilestoneId, milestones])

  const setField = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const updateItem = useCallback((idx: number, field: keyof typeof EMPTY_ITEM, value: string | number) => {
    setItems(prev => {
      const next = [...prev]
      const item = { ...next[idx], [field]: value }
      item.total = Number(item.quantity) * Number(item.unit_price)
      next[idx] = item
      return next
    })
  }, [])

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM, sort_order: prev.length }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const subtotal = items.reduce((s, i) => s + Number(i.total), 0)
  const taxAmount = (subtotal * Number(form.tax_rate)) / 100
  const total = subtotal + taxAmount - Number(form.discount)

  const handleExtracted = (data: ExtractedDocumentData) => {
    if (data.invoice_number) setForm(prev => ({ ...prev, invoice_number: data.invoice_number! }))
    if (data.date) setForm(prev => ({ ...prev, issue_date: data.date! }))
    if (data.due_date) setForm(prev => ({ ...prev, due_date: data.due_date! }))
    if (data.notes) setForm(prev => ({ ...prev, notes: data.notes! }))
    if (data.payment_terms) setForm(prev => ({ ...prev, payment_terms: data.payment_terms! }))
    if (data.name) setForm(prev => ({ ...prev, customer_name: data.name! }))
    if (data.email) setForm(prev => ({ ...prev, customer_email: data.email! }))
    if (data.address) setForm(prev => ({ ...prev, customer_address: data.address! }))
    if (data.tax_number) setForm(prev => ({ ...prev, customer_tax_number: data.tax_number! }))
    if (data.items?.length) {
      setItems(data.items.map((item, i) => ({ ...item, sort_order: i })))
    }
    toast.success('تم استخراج بيانات الفاتورة تلقائياً')
    setShowUpload(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customer_name.trim()) { toast.error('اسم العميل مطلوب'); return }
    if (items.length === 0 || !items.some(i => i.description.trim())) { toast.error('يجب إضافة بند واحد على الأقل'); return }
    setLoading(true)

    const payload = {
      ...form,
      customer_id: selectedCustomerId || null,
      project_id: selectedProjectId || null,
      milestone_id: selectedMilestoneId || null,
      tax_rate: Number(form.tax_rate),
      discount: Number(form.discount),
      subtotal,
      tax_amount: taxAmount,
      total,
      updated_at: new Date().toISOString(),
    }

    let invoiceId = id
    if (isEdit) {
      const { error } = await supabase.from('invoices').update(payload).eq('id', id)
      if (error) { toast.error('حدث خطأ'); setLoading(false); return }
      await supabase.from('invoice_items').delete().eq('invoice_id', id)
      await supabase.from('invoice_items').insert(
        items.filter(i => i.description.trim()).map((item, idx) => ({ ...item, invoice_id: id, sort_order: idx }))
      )
    } else {
      const { data: newInv, error } = await supabase.from('invoices').insert(payload).select().single()
      if (error || !newInv) { toast.error('حدث خطأ'); setLoading(false); return }
      invoiceId = (newInv as Invoice).id
      await supabase.from('invoice_items').insert(
        items.filter(i => i.description.trim()).map((item, idx) => ({ ...item, invoice_id: invoiceId, sort_order: idx }))
      )
    }

    // Update milestone status to 'invoiced' if linked
    if (selectedMilestoneId) {
      await supabase.from('project_milestones').update({ status: 'invoiced', invoice_id: invoiceId }).eq('id', selectedMilestoneId)
    }

    setLoading(false)
    toast.success(isEdit ? 'تم تحديث الفاتورة' : 'تم إنشاء الفاتورة')
    navigate('/invoices')
  }

  // Build options
  const projectOptions = [
    { value: '', label: '-- اختر مشروعاً --' },
    ...projects.map(p => ({ value: p.id, label: `${p.project_name} — ${p.client_name}` }))
  ]

  const milestoneOptions = [
    { value: '', label: '-- اختر مرحلة دفع --' },
    ...milestones.map(m => ({ value: m.id, label: `${m.name} — ${formatCurrency(Number(m.amount))}` }))
  ]

  const customerOptions = [
    { value: '', label: '-- اختر عميلاً --' },
    ...customers.map(c => ({ value: c.id, label: c.name + (c.company_name ? ` (${c.company_name})` : '') }))
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/invoices')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-slate-800">{isEdit ? 'تعديل الفاتورة' : 'فاتورة جديدة'}</h2>
      </div>

      {/* Auto-fill from document */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
        <button
          type="button"
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <Upload size={16} />
          {showUpload ? 'إخفاء رفع الملف' : 'رفع ملف لاستخراج بيانات الفاتورة تلقائياً'}
        </button>
        {showUpload && <div className="mt-4"><DocumentUpload onExtracted={handleExtracted} /></div>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Header info */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">معلومات الفاتورة</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input label="رقم الفاتورة *" value={form.invoice_number} onChange={setField('invoice_number')} />
            <Input label="تاريخ الإصدار *" type="date" value={form.issue_date} onChange={setField('issue_date')} />
            <Input label="تاريخ الاستحقاق" type="date" value={form.due_date} onChange={setField('due_date')} />
            <Select label="الحالة" value={form.status} onChange={setField('status')} options={STATUS_OPTIONS} />
            <Input label="شروط الدفع" value={form.payment_terms} onChange={setField('payment_terms')} />
          </div>
        </div>

        {/* Project & Milestone Linking */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">ربط المشروع والمرحلة</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="المشروع"
              value={selectedProjectId}
              onChange={e => { setSelectedProjectId(e.target.value); setSelectedMilestoneId('') }}
              options={projectOptions}
            />
            <Select
              label="مرحلة الدفع"
              value={selectedMilestoneId}
              onChange={e => setSelectedMilestoneId(e.target.value)}
              options={milestoneOptions}
            />
          </div>
          {selectedMilestoneId && milestones.find(m => m.id === selectedMilestoneId) && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
              <span className="text-green-700 font-medium">
                المرحلة: {milestones.find(m => m.id === selectedMilestoneId)?.name} —
                المبلغ: {formatCurrency(Number(milestones.find(m => m.id === selectedMilestoneId)?.amount ?? 0))}
              </span>
            </div>
          )}
        </div>

        {/* Customer info */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">بيانات العميل</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="اختر عميل موجود"
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              options={customerOptions}
            />
            <Input label="اسم العميل *" value={form.customer_name} onChange={setField('customer_name')} placeholder="أو اكتب اسم العميل مباشرة" />
            <Input label="البريد الإلكتروني" type="email" value={form.customer_email} onChange={setField('customer_email')} />
            <Input label="رقم الضريبة / السجل المدني" value={form.customer_tax_number} onChange={setField('customer_tax_number')} />
            <div className="sm:col-span-2">
              <Textarea label="عنوان العميل" value={form.customer_address} onChange={setField('customer_address')} rows={2} />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-700 text-sm">البنود</h3>
            <button type="button" onClick={addItem} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700">
              <Plus size={15} /> إضافة بند
            </button>
          </div>

          <div className="space-y-3">
            <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 pb-1 border-b border-slate-100">
              <div className="col-span-5">الوصف</div>
              <div className="col-span-2 text-center">الكمية</div>
              <div className="col-span-2 text-center">سعر الوحدة</div>
              <div className="col-span-2 text-center">المجموع</div>
              <div className="col-span-1" />
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-12 sm:col-span-5">
                  <input type="text" placeholder="وصف الخدمة / المنتج" value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none" />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input type="number" placeholder="الكمية" value={item.quantity} min={0} step="0.01"
                    onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-center" />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input type="number" placeholder="السعر" value={item.unit_price} min={0} step="0.01"
                    onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-center" />
                </div>
                <div className="col-span-3 sm:col-span-2 text-center text-sm font-medium text-slate-700">
                  {formatCurrency(Number(item.total)).split(' ')[0]}
                </div>
                <div className="col-span-1 flex justify-center">
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full sm:w-72 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">المجموع الجزئي</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500">الضريبة</span>
                <div className="flex items-center gap-1">
                  <input type="number" value={form.tax_rate} min={0} max={100} step="0.1" onChange={setField('tax_rate')}
                    className="w-16 h-7 px-2 rounded border border-slate-300 text-xs text-center" />
                  <span className="text-slate-500">%</span>
                  <span className="font-medium w-24 text-left">{formatCurrency(taxAmount)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500">خصم</span>
                <input type="number" value={form.discount} min={0} step="0.01" onChange={setField('discount')}
                  className="w-28 h-7 px-2 rounded border border-slate-300 text-xs text-center" />
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="font-bold text-slate-800">الإجمالي</span>
                <span className="font-bold text-primary-700 text-base">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <Textarea label="ملاحظات" value={form.notes} onChange={setField('notes')} rows={3} placeholder="شروط، ملاحظات، تعليمات الدفع..." />
        </div>

        <div className="flex gap-3">
          <Button type="submit" loading={loading}>{isEdit ? 'حفظ التعديلات' : 'إنشاء الفاتورة'}</Button>
          {isEdit && (
            <Button type="button" variant="outline" onClick={() => navigate(`/invoices/${id}/view`)}>عرض الفاتورة</Button>
          )}
          <Button type="button" variant="secondary" onClick={() => navigate('/invoices')}>إلغاء</Button>
        </div>
      </form>
    </div>
  )
}
