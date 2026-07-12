import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'
import type { Invoice, InvoiceItem, Customer, Project, ProjectMilestone, ExtractedDocumentData } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import MoneyInput from '../../components/ui/MoneyInput'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import DocumentUpload from '../../components/ui/DocumentUpload'
import toast from 'react-hot-toast'

// مُعرّف واجهة فريد وثابت لكل صف بند — مفتاح React عند الإضافة/الحذف، لا يُحفظ في قاعدة البيانات
const makeUid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`

// أعمدة DATE في قاعدة البيانات ترفض السلسلة الفارغة "" — نحوّل التاريخ الفارغ إلى null
const sanitizeDate = (v: string): string | null => (v && v.trim() ? v : null)

const today = () => new Date().toISOString().slice(0, 10)

type ItemRow = Omit<InvoiceItem, 'id' | 'invoice_id'> & { _uid: string }

const EMPTY_ITEM: Omit<InvoiceItem, 'id' | 'invoice_id'> = { description: '', quantity: 1, unit_price: 0, total: 0, sort_order: 0 }
const newItemRow = (sort_order = 0): ItemRow => ({ _uid: makeUid(), ...EMPTY_ITEM, sort_order })

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
  const [items, setItems] = useState<ItemRow[]>([newItemRow(0)])
  const [form, setForm] = useState({
    invoice_number: '',
    customer_name: '',
    customer_email: '',
    customer_address: '',
    customer_tax_number: '',
    ship_to: '',
    issue_date: today(),
    due_date: '',
    status: 'draft',
    // فلل البناء الجديد → ضريبة 0% افتراضياً (تبقى قابلة للتعديل يدوياً لأعمال الصيانة 10%)
    tax_rate: 0,
    discount: 0,
    notes: '',
    payment_terms: 'صافي 30 يوم',
  })
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  // ─── تحميل البيانات الرئيسية ─────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('projects').select('*').eq('status', 'active').order('project_name'),
    ]).then(([cRes, pRes]) => {
      setCustomers((cRes.data ?? []) as Customer[])
      setProjects((pRes.data ?? []) as Project[])
    })
  }, [])

  // تحميل مراحل الدفع عند تغيّر المشروع
  useEffect(() => {
    if (!selectedProjectId) { setMilestones([]); return }
    supabase.from('project_milestones').select('*').eq('project_id', selectedProjectId)
      .in('status', ['pending', 'in_progress', 'completed'])
      .order('sort_order')
      .then(({ data }) => setMilestones((data ?? []) as ProjectMilestone[]))
  }, [selectedProjectId])

  const [invoicePrefix, setInvoicePrefix] = useState('INV')

  // بادئة ترقيم الفواتير من الإعدادات — تُستخدم عند توليد الرقم آلياً وقت الحفظ
  useEffect(() => {
    if (isEdit) return
    supabase.from('company_settings').select('invoice_prefix').maybeSingle().then(({ data }) => {
      const prefix = (data as { invoice_prefix?: string } | null)?.invoice_prefix?.trim()
      if (prefix) setInvoicePrefix(prefix)
    })
  }, [isEdit])

  // تحميل الفاتورة عند التعديل
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
        if (rows?.length) setItems((rows as InvoiceItem[]).map((r, i) => ({
          _uid: makeUid(),
          description: r.description,
          quantity: Number(r.quantity),
          unit_price: Number(r.unit_price),
          total: Number(r.total),
          sort_order: r.sort_order ?? i,
        })))
      })
    })
  }, [id, isEdit])

  // تعبئة تلقائية من المشروع المختار
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
    if (p.client_id) setSelectedCustomerId(p.client_id)
  }, [selectedProjectId, projects])

  // تعبئة تلقائية من العميل المختار
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

  // تعبئة المبلغ تلقائياً من مرحلة الدفع
  useEffect(() => {
    if (!selectedMilestoneId) return
    const m = milestones.find(x => x.id === selectedMilestoneId)
    if (!m) return
    setItems([{ _uid: makeUid(), description: m.name || m.description, quantity: 1, unit_price: Number(m.amount), total: Number(m.amount), sort_order: 0 }])
  }, [selectedMilestoneId, milestones])

  const setField = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const updateItem = useCallback((idx: number, field: 'description' | 'quantity' | 'unit_price', value: string | number) => {
    setItems(prev => {
      const next = [...prev]
      const item = { ...next[idx], [field]: value }
      item.total = Number(item.quantity) * Number(item.unit_price)
      next[idx] = item
      return next
    })
  }, [])

  const addItem = () => setItems(prev => [...prev, newItemRow(prev.length)])
  const removeItem = (idx: number) => setItems(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))

  // ─── الحسابات المشتقة ─────────────────────────────────────────────────
  const subtotal = useMemo(() => items.reduce((s, i) => s + Number(i.total), 0), [items])
  const taxAmount = useMemo(() => (subtotal * Number(form.tax_rate)) / 100, [subtotal, form.tax_rate])
  const total = useMemo(() => subtotal + taxAmount - Number(form.discount), [subtotal, taxAmount, form.discount])

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
      setItems(data.items.map((item, i) => ({
        _uid: makeUid(),
        description: item.description ?? '',
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        total: Number(item.total) || (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
        sort_order: i,
      })))
    }
    toast.success('تم استخراج بيانات الفاتورة تلقائياً')
    setShowUpload(false)
  }

  // ─── الحفظ ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customer_name.trim()) { toast.error('اسم العميل مطلوب'); return }
    const validItems = items.filter(i => i.description.trim())
    if (validItems.length === 0) { toast.error('يجب إضافة بند واحد على الأقل'); return }
    if (isEdit && !form.invoice_number.trim()) { toast.error('رقم الفاتورة مطلوب'); return }

    setLoading(true)
    try {
      // رقم الفاتورة: يدوي إن أُدخل، وإلا يُولَّد ذرّياً من قاعدة البيانات (INV-YYYY-0001) وقت الحفظ فقط
      let invoiceNumber = form.invoice_number.trim()
      if (!isEdit && !invoiceNumber) {
        const { data: gen, error: genErr } = await supabase.rpc('next_invoice_number', { p_prefix: invoicePrefix })
        if (genErr || !gen) throw genErr ?? new Error('تعذّر توليد رقم الفاتورة')
        invoiceNumber = String(gen)
      }

      // بناء الحمولة بشكل صريح لتفادي إرسال حقول غير موجودة، وتحويل التواريخ الفارغة إلى null
      const payload = {
        invoice_number: invoiceNumber,
        customer_id: selectedCustomerId || null,
        customer_name: form.customer_name.trim(),
        customer_email: form.customer_email,
        customer_address: form.customer_address,
        customer_tax_number: form.customer_tax_number,
        ship_to: form.ship_to,
        project_id: selectedProjectId || null,
        milestone_id: selectedMilestoneId || null,
        issue_date: sanitizeDate(form.issue_date) ?? today(), // عمود NOT NULL — نضمن قيمة صالحة
        due_date: sanitizeDate(form.due_date),                 // عمود DATE قابل للفراغ — null بدل ""
        status: form.status,
        subtotal,
        tax_rate: Number(form.tax_rate) || 0,
        tax_amount: taxAmount,
        discount: Number(form.discount) || 0,
        total,
        notes: form.notes,
        payment_terms: form.payment_terms,
        updated_at: new Date().toISOString(),
      }

      let invoiceId = id
      if (isEdit) {
        const { error } = await supabase.from('invoices').update(payload).eq('id', id)
        if (error) throw error
        const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', id)
        if (delErr) throw delErr
      } else {
        const { data: newInv, error } = await supabase.from('invoices').insert(payload).select('id').single()
        if (error) throw error
        invoiceId = (newInv as { id: string }).id
      }

      // إدراج البنود بعد تجريد مُعرّفات الواجهة وإعادة ترقيمها
      const itemsPayload = validItems.map((it, idx) => ({
        invoice_id: invoiceId,
        description: it.description.trim(),
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        total: Number(it.total) || 0,
        sort_order: idx,
      }))
      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsPayload)
      if (itemsErr) throw itemsErr

      // ربط المرحلة: تحديث حالتها إلى "مفوترة"
      if (selectedMilestoneId) {
        await supabase.from('project_milestones').update({ status: 'invoiced', invoice_id: invoiceId }).eq('id', selectedMilestoneId)
      }

      toast.success(isEdit ? 'تم تحديث الفاتورة' : 'تم إنشاء الفاتورة')
      navigate('/invoices')
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'تعذّر حفظ الفاتورة'
      toast.error('حدث خطأ: ' + msg)
    } finally {
      setLoading(false)
    }
  }

  // ─── قوائم الاختيار ───────────────────────────────────────────────────
  const projectOptions = useMemo(
    () => [
      { value: '', label: '-- اختر مشروعاً --' },
      ...projects.map(p => ({ value: p.id, label: `${p.project_name} — ${p.client_name}` })),
    ],
    [projects]
  )

  const milestoneOptions = useMemo(
    () => [
      { value: '', label: '-- اختر مرحلة دفع --' },
      ...milestones.map(m => ({ value: m.id, label: `${m.name} — ${formatCurrency(Number(m.amount))}` })),
    ],
    [milestones]
  )

  const customerOptions = useMemo(
    () => [
      { value: '', label: '-- اختر عميلاً --' },
      ...customers.map(c => ({ value: c.id, label: c.name + (c.company_name ? ` (${c.company_name})` : '') })),
    ],
    [customers]
  )

  const selectedMilestone = useMemo(
    () => milestones.find(m => m.id === selectedMilestoneId),
    [milestones, selectedMilestoneId]
  )

  return (
    <div className="max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/invoices')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-slate-800">{isEdit ? 'تعديل الفاتورة' : 'فاتورة جديدة'}</h2>
      </div>

      {/* استخراج البيانات من ملف */}
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
        {/* معلومات الفاتورة */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">معلومات الفاتورة</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input label="رقم الفاتورة" value={form.invoice_number} onChange={setField('invoice_number')} placeholder={isEdit ? undefined : `${invoicePrefix}-${new Date().getFullYear()}-•••• (تلقائي عند الحفظ)`} />
            <Input label="تاريخ الإصدار *" type="date" value={form.issue_date} onChange={setField('issue_date')} />
            <Input label="تاريخ الاستحقاق" type="date" value={form.due_date} onChange={setField('due_date')} />
            <Select label="الحالة" value={form.status} onChange={setField('status')} options={STATUS_OPTIONS} />
            <Input label="شروط الدفع" value={form.payment_terms} onChange={setField('payment_terms')} />
          </div>
        </div>

        {/* ربط المشروع والمرحلة */}
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
          {selectedMilestone && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
              <span className="text-green-700 font-medium">
                المرحلة: {selectedMilestone.name} —
                المبلغ: {formatCurrency(Number(selectedMilestone.amount ?? 0))}
              </span>
            </div>
          )}
        </div>

        {/* بيانات العميل */}
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

        {/* البنود */}
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
              <div key={item._uid} className="grid grid-cols-12 gap-2 items-center">
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
                  <MoneyInput placeholder="السعر" value={Number(item.unit_price) || 0}
                    onValueChange={v => updateItem(idx, 'unit_price', v)}
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

          {/* الإجماليات */}
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
                <MoneyInput value={Number(form.discount) || 0} onValueChange={v => setForm(prev => ({ ...prev, discount: v }))}
                  className="w-28 h-7 px-2 rounded border border-slate-300 text-xs text-center" />
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="font-bold text-slate-800">الإجمالي</span>
                <span className="font-bold text-primary-700 text-base">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ملاحظات */}
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
