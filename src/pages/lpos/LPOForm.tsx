import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, Upload, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { nextSerial, formatCurrency } from '../../lib/utils'
import type { LPO, LPOItem, Supplier, ExtractedDocumentData } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import DocumentUpload from '../../components/ui/DocumentUpload'
import toast from 'react-hot-toast'

const EMPTY_ITEM: Omit<LPOItem, 'id' | 'lpo_id'> = { description: '', quantity: 1, unit: 'قطعة', unit_price: 0, total: 0, sort_order: 0 }

const STATUS_OPTIONS = [
  { value: 'draft', label: 'مسودة' },
  { value: 'sent', label: 'مرسل' },
  { value: 'approved', label: 'موافق عليه' },
  { value: 'received', label: 'مستلم' },
  { value: 'cancelled', label: 'ملغى' },
]

const PAYMENT_TYPE_OPTIONS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'cheque', label: 'شيك' },
  { value: 'benefit', label: 'بنفت' },
  { value: 'deferred_cheque', label: 'شيك آجل الدفع' },
  { value: 'credit', label: 'آجل / دين' },
]

export default function LPOForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const isEdit = !!id
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [projects, setProjects] = useState<{ id: string; project_name: string }[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [items, setItems] = useState<Array<Omit<LPOItem, 'id' | 'lpo_id'>>>([{ ...EMPTY_ITEM }])
  const [form, setForm] = useState({
    lpo_number: '',
    supplier_name: '',
    supplier_email: '',
    supplier_address: '',
    supplier_tax_number: '',
    project_id: '',
    issue_date: new Date().toISOString().slice(0, 10),
    delivery_date: '',
    status: 'draft',
    tax_rate: 0, // بلا ضريبة تلقائية — بناء الفلل معفى؛ تُعدّل يدوياً للحالات الاستثنائية (صيانة)
    discount: 0,
    notes: '',
    payment_terms: 'صافي 30 يوم',
    payment_type: 'bank_transfer',
    check_due_date: '',
    delivery_address: '',
  })
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [fromLogId, setFromLogId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data }) => setSuppliers((data ?? []) as Supplier[]))
    supabase.from('projects').select('id, project_name').eq('status', 'active').order('project_name').then(({ data }) => setProjects((data ?? []) as { id: string; project_name: string }[]))
    if (!isEdit) {
      supabase.from('lpos').select('lpo_number').then(({ data }) => {
        const nums = (data ?? []).map((r: { lpo_number: string }) => r.lpo_number)
        setForm(prev => ({ ...prev, lpo_number: nextSerial(nums, 1036) }))
      })
      // استقبال البيانات القادمة من التقرير اليومي (تحويل طلب مواد → أمر شراء)
      const projectParam = searchParams.get('project')
      const materialsParam = searchParams.get('materials')
      const fromLog = searchParams.get('from_log')
      if (projectParam) setForm(prev => ({ ...prev, project_id: projectParam }))
      if (fromLog) setFromLogId(fromLog)
      if (materialsParam) {
        // تحويل كل سطر من طلبات المواد إلى بند منفصل
        const lines = materialsParam.split('\n').map(l => l.trim()).filter(Boolean)
        if (lines.length > 0) {
          const newItems = lines.map((line, i) => {
            // محاولة فصل "المادة - الكمية" إن وجدت
            const parts = line.split(/[-–:]/).map(p => p.trim())
            const desc = parts[0] || line
            const qtyMatch = line.match(/(\d+(?:\.\d+)?)/)
            return {
              description: desc,
              quantity: qtyMatch ? parseFloat(qtyMatch[1]) : 1,
              unit: 'قطعة',
              unit_price: 0,
              total: 0,
              sort_order: i,
            }
          })
          setItems(newItems)
          toast.success(`تم تحويل ${newItems.length} مادة من التقرير اليومي`)
        }
      }
    }
  }, [isEdit, searchParams])

  useEffect(() => {
    if (!isEdit) return
    supabase.from('lpos').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return
      const lpo = data as LPO
      setForm({
        lpo_number: lpo.lpo_number,
        supplier_name: lpo.supplier_name,
        supplier_email: lpo.supplier_email,
        supplier_address: lpo.supplier_address,
        supplier_tax_number: lpo.supplier_tax_number,
        project_id: (lpo as LPO & { project_id?: string }).project_id ?? '',
        issue_date: lpo.issue_date,
        delivery_date: lpo.delivery_date ?? '',
        status: lpo.status,
        tax_rate: Number(lpo.tax_rate),
        discount: Number(lpo.discount),
        notes: lpo.notes,
        payment_terms: lpo.payment_terms,
        payment_type: lpo.payment_type ?? 'bank_transfer',
        check_due_date: lpo.check_due_date ?? '',
        delivery_address: lpo.delivery_address,
      })
      setSelectedSupplierId(lpo.supplier_id ?? '')
      supabase.from('lpo_items').select('*').eq('lpo_id', id).order('sort_order').then(({ data: rows }) => {
        if (rows?.length) setItems(rows as LPOItem[])
      })
    })
  }, [id, isEdit])

  useEffect(() => {
    if (!selectedSupplierId) return
    const s = suppliers.find(s => s.id === selectedSupplierId)
    if (!s) return
    setForm(prev => ({
      ...prev,
      supplier_name: s.name || s.company_name,
      supplier_email: s.email,
      supplier_address: `${s.address}${s.city ? `, ${s.city}` : ''}`,
      supplier_tax_number: s.tax_number,
    }))
  }, [selectedSupplierId, suppliers])

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

  // الحسابات المالية — تُعاد فقط عند تغيّر البنود أو نسبة الضريبة أو الخصم
  const { subtotal, taxAmount, total } = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + Number(i.total), 0)
    const taxAmount = (subtotal * Number(form.tax_rate)) / 100
    const total = subtotal + taxAmount - Number(form.discount)
    return { subtotal, taxAmount, total }
  }, [items, form.tax_rate, form.discount])

  const handleExtracted = (data: ExtractedDocumentData) => {
    if (data.lpo_number) setForm(prev => ({ ...prev, lpo_number: data.lpo_number! }))
    if (data.date) setForm(prev => ({ ...prev, issue_date: data.date! }))
    if (data.notes) setForm(prev => ({ ...prev, notes: data.notes! }))
    if (data.payment_terms) setForm(prev => ({ ...prev, payment_terms: data.payment_terms! }))
    if (data.name) setForm(prev => ({ ...prev, supplier_name: data.name! }))
    if (data.email) setForm(prev => ({ ...prev, supplier_email: data.email! }))
    if (data.address) setForm(prev => ({ ...prev, supplier_address: data.address! }))
    if (data.tax_number) setForm(prev => ({ ...prev, supplier_tax_number: data.tax_number! }))
    if (data.items?.length) setItems(data.items.map((item, i) => ({ ...item, unit: 'قطعة', sort_order: i })))
    toast.success('تم استخراج بيانات أمر الشراء تلقائياً')
    setShowUpload(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.supplier_name.trim()) { toast.error('اسم المورد مطلوب'); return }
    setLoading(true)

    const payload = {
      ...form,
      supplier_id: selectedSupplierId || null,
      project_id: form.project_id || null,
      tax_rate: Number(form.tax_rate),
      discount: Number(form.discount),
      subtotal,
      tax_amount: taxAmount,
      total,
      updated_at: new Date().toISOString(),
    }

    if (isEdit) {
      const { error } = await supabase.from('lpos').update(payload).eq('id', id)
      if (error) { toast.error('حدث خطأ'); setLoading(false); return }
      await supabase.from('lpo_items').delete().eq('lpo_id', id)
      await supabase.from('lpo_items').insert(
        items.filter(i => i.description.trim()).map((item, idx) => ({ ...item, lpo_id: id, sort_order: idx }))
      )
    } else {
      const { data: newLpo, error } = await supabase.from('lpos').insert(payload).select().single()
      if (error || !newLpo) { toast.error('حدث خطأ'); setLoading(false); return }
      await supabase.from('lpo_items').insert(
        items.filter(i => i.description.trim()).map((item, idx) => ({ ...item, lpo_id: (newLpo as LPO).id, sort_order: idx }))
      )
      // تعليم التقرير اليومي المصدر بأنه تم تحويله لأمر شراء
      if (fromLogId) {
        await supabase.from('daily_logs').update({ converted_to_lpo: true }).eq('id', fromLogId)
      }
    }

    setLoading(false)
    queryClient.invalidateQueries({ queryKey: ['lpos-list'] })
    toast.success(isEdit ? 'تم تحديث أمر الشراء' : 'تم إنشاء أمر الشراء')
    navigate('/lpos')
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/lpos')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-slate-800">{isEdit ? 'تعديل أمر الشراء' : 'أمر شراء جديد (LPO)'}</h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
        <button type="button" onClick={() => setShowUpload(!showUpload)} className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
          <Upload size={16} />
          {showUpload ? 'إخفاء رفع الملف' : 'رفع ملف لاستخراج بيانات أمر الشراء تلقائياً'}
        </button>
        {showUpload && <div className="mt-4"><DocumentUpload onExtracted={handleExtracted} /></div>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {fromLogId && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-800">
            <ClipboardList size={16} />
            تم إنشاء هذا الأمر من طلبات مواد في تقرير يومي — راجع البنود وأضف الأسعار والمورد
          </div>
        )}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">معلومات أمر الشراء</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input label="رقم أمر الشراء *" value={form.lpo_number} onChange={setField('lpo_number')} />
            <Input label="تاريخ الإصدار *" type="date" value={form.issue_date} onChange={setField('issue_date')} />
            <Input label="تاريخ التسليم المتوقع" type="date" value={form.delivery_date} onChange={setField('delivery_date')} />
            <Select label="المشروع" value={form.project_id} onChange={setField('project_id')}
              options={[{ value: '', label: '— غير مرتبط بمشروع —' }, ...projects.map(p => ({ value: p.id, label: p.project_name }))]} />
            <Select label="الحالة" value={form.status} onChange={setField('status')} options={STATUS_OPTIONS} />
            <Input label="شروط الدفع" value={form.payment_terms} onChange={setField('payment_terms')} />
            <Select label="طريقة الدفع" value={form.payment_type} onChange={setField('payment_type')} options={PAYMENT_TYPE_OPTIONS} />
            {form.payment_type === 'deferred_cheque' && (
              <Input label="تاريخ استحقاق الشيك *" type="date" value={form.check_due_date} onChange={setField('check_due_date')} />
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">بيانات المورد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">اختر مورداً موجوداً</label>
              <select
                value={selectedSupplierId}
                onChange={e => setSelectedSupplierId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
              >
                <option value="">-- اختر موردًا --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.company_name ? ` (${s.company_name})` : ''}</option>
                ))}
              </select>
            </div>
            <Input label="اسم المورد *" value={form.supplier_name} onChange={setField('supplier_name')} placeholder="أو اكتب اسم المورد مباشرة" />
            <Input label="البريد الإلكتروني" type="email" value={form.supplier_email} onChange={setField('supplier_email')} />
            <Input label="رقم الضريبة" value={form.supplier_tax_number} onChange={setField('supplier_tax_number')} />
            <div className="sm:col-span-2">
              <Textarea label="عنوان المورد" value={form.supplier_address} onChange={setField('supplier_address')} rows={2} />
            </div>
            <div className="sm:col-span-2">
              <Textarea label="عنوان التسليم" value={form.delivery_address} onChange={setField('delivery_address')} rows={2} />
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
              <div className="col-span-4">الوصف</div>
              <div className="col-span-2 text-center">الكمية</div>
              <div className="col-span-2 text-center">الوحدة</div>
              <div className="col-span-2 text-center">سعر الوحدة</div>
              <div className="col-span-1 text-center">المجموع</div>
              <div className="col-span-1" />
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-12 sm:col-span-4">
                  <input type="text" placeholder="وصف المادة / الخدمة" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none" />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <input type="number" placeholder="الكمية" value={item.quantity} min={0} step="0.01" onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-full h-9 px-2 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-center" />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <input type="text" placeholder="الوحدة" value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-center" />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <input type="number" placeholder="السعر" value={item.unit_price} min={0} step="0.001" inputMode="decimal" onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="w-full h-9 px-2 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-center" />
                </div>
                <div className="col-span-2 sm:col-span-1 text-center text-xs font-medium text-slate-700">
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
                <input type="number" value={form.discount} min={0} step="0.001" inputMode="decimal" onChange={setField('discount')}
                  className="w-28 h-7 px-2 rounded border border-slate-300 text-xs text-center" />
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="font-bold text-slate-800">الإجمالي</span>
                <span className="font-bold text-primary-700 text-base">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <Textarea label="ملاحظات وشروط" value={form.notes} onChange={setField('notes')} rows={3} placeholder="شروط التوريد، متطلبات خاصة..." />
        </div>

        <div className="flex gap-3">
          <Button type="submit" loading={loading}>{isEdit ? 'حفظ التعديلات' : 'إنشاء أمر الشراء'}</Button>
          {isEdit && (
            <Button type="button" variant="outline" onClick={() => navigate(`/lpos/${id}/view`)}>عرض أمر الشراء</Button>
          )}
          <Button type="button" variant="secondary" onClick={() => navigate('/lpos')}>إلغاء</Button>
        </div>
      </form>
    </div>
  )
}