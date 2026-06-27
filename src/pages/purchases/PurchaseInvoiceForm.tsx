import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Plus, Trash2, ZoomIn, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { PurchaseInvoice, PurchaseInvoiceDelivery, PurchasePaymentMethod } from '../../types'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

interface SupplierOption { id: string; name: string }
interface ProjectOption { id: string; project_name: string }
interface LPOOption { id: string; lpo_number: string }

const PAYMENT_METHODS: { value: PurchasePaymentMethod; label: string }[] = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'deferred_cheque', label: 'شيك آجل' },
]

export default function PurchaseInvoiceForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [saving, setSaving] = useState(false)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [lpos, setLpos] = useState<LPOOption[]>([])
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const [form, setForm] = useState({
    supplier_id: '',
    supplier_name: '',
    project_id: '',
    project_name: '',
    lpo_id: '',
    lpo_number: '',
    vendor_invoice_number: '',
    amount: '',
    payment_method: 'cash' as PurchasePaymentMethod,
    check_due_date: '',
    check_image_data: '',
    invoice_copy_data: '',
    payment_proof_data: '',
    notes: '',
  })

  const [deliveries, setDeliveries] = useState<PurchaseInvoiceDelivery[]>([])

  useEffect(() => {
    const loadOptions = async () => {
      const [sRes, pRes, lRes] = await Promise.all([
        supabase.from('suppliers').select('id, name').order('name'),
        supabase.from('projects').select('id, project_name').order('project_name'),
        supabase.from('lpos').select('id, lpo_number').order('lpo_number', { ascending: false }),
      ])
      setSuppliers((sRes.data ?? []) as SupplierOption[])
      setProjects((pRes.data ?? []) as ProjectOption[])
      setLpos((lRes.data ?? []) as LPOOption[])
    }
    loadOptions()

    if (isEdit) {
      const loadInvoice = async () => {
        const { data } = await supabase.from('purchase_invoices').select('*').eq('id', id).single()
        if (data) {
          const inv = data as PurchaseInvoice
          setForm({
            supplier_id: inv.supplier_id ?? '',
            supplier_name: inv.supplier_name,
            project_id: inv.project_id ?? '',
            project_name: inv.project_name,
            lpo_id: inv.lpo_id ?? '',
            lpo_number: inv.lpo_number,
            vendor_invoice_number: inv.vendor_invoice_number,
            amount: String(inv.amount),
            payment_method: inv.payment_method,
            check_due_date: inv.check_due_date ?? '',
            check_image_data: inv.check_image_data,
            invoice_copy_data: inv.invoice_copy_data,
            payment_proof_data: inv.payment_proof_data,
            notes: inv.notes,
          })
        }
        const { data: delData } = await supabase.from('purchase_invoice_deliveries').select('*').eq('purchase_invoice_id', id).order('created_at')
        if (delData) setDeliveries(delData as PurchaseInvoiceDelivery[])
      }
      loadInvoice()
    }
  }, [id, isEdit])

  const handleSupplierChange = (supplierId: string) => {
    const s = suppliers.find(x => x.id === supplierId)
    setForm(f => ({ ...f, supplier_id: supplierId, supplier_name: s?.name ?? '' }))
  }

  const handleProjectChange = (projectId: string) => {
    const p = projects.find(x => x.id === projectId)
    setForm(f => ({ ...f, project_id: projectId, project_name: p?.project_name ?? '' }))
  }

  const handleLpoChange = (lpoId: string) => {
    const l = lpos.find(x => x.id === lpoId)
    setForm(f => ({ ...f, lpo_id: lpoId, lpo_number: l?.lpo_number ?? '' }))
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleFileUpload = async (field: 'invoice_copy_data' | 'payment_proof_data' | 'check_image_data', file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الملف يجب أن يكون أقل من 5 ميجابايت')
      return
    }
    const base64 = await fileToBase64(file)
    setForm(f => ({ ...f, [field]: base64 }))
  }

  const handleDeliveryImageUpload = async (idx: number, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الملف يجب أن يكون أقل من 5 ميجابايت')
      return
    }
    const base64 = await fileToBase64(file)
    setDeliveries(prev => prev.map((d, i) => i === idx ? { ...d, delivery_image_data: base64 } : d))
  }

  const addDelivery = () => {
    setDeliveries(prev => [...prev, { delivery_note_number: '', delivery_image_data: '', notes: '' }])
  }

  const removeDelivery = (idx: number) => {
    setDeliveries(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!form.supplier_id) { toast.error('يرجى اختيار المورد'); return }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('يرجى إدخال المبلغ'); return }

    setSaving(true)
    const payload = {
      supplier_id: form.supplier_id || null,
      supplier_name: form.supplier_name,
      project_id: form.project_id || null,
      project_name: form.project_name,
      lpo_id: form.lpo_id || null,
      lpo_number: form.lpo_number,
      vendor_invoice_number: form.vendor_invoice_number,
      amount: Number(form.amount),
      payment_method: form.payment_method,
      check_due_date: form.payment_method === 'deferred_cheque' && form.check_due_date ? form.check_due_date : null,
      check_image_data: form.payment_method === 'deferred_cheque' ? form.check_image_data : '',
      invoice_copy_data: form.invoice_copy_data,
      payment_proof_data: form.payment_proof_data,
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }

    let invoiceId = id
    if (isEdit) {
      const { error } = await supabase.from('purchase_invoices').update(payload).eq('id', id)
      if (error) { toast.error('فشل في الحفظ'); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('purchase_invoices').insert(payload).select('id').single()
      if (error || !data) { toast.error('فشل في الحفظ'); setSaving(false); return }
      invoiceId = data.id
    }

    // Save deliveries
    if (isEdit) {
      await supabase.from('purchase_invoice_deliveries').delete().eq('purchase_invoice_id', id)
    }
    if (deliveries.length > 0) {
      const deliveryPayload = deliveries.map(d => ({
        purchase_invoice_id: invoiceId,
        delivery_note_number: d.delivery_note_number,
        delivery_image_data: d.delivery_image_data,
        notes: d.notes,
      }))
      await supabase.from('purchase_invoice_deliveries').insert(deliveryPayload)
    }

    toast.success(isEdit ? 'تم تحديث الفاتورة بنجاح' : 'تم تسجيل فاتورة الشراء بنجاح')
    setSaving(false)
    navigate('/purchases')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/purchases')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
          <ArrowRight size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isEdit ? 'تعديل فاتورة شراء' : 'تسجيل فاتورة شراء جديدة'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">إدخال بيانات المشتريات والمدفوعات</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        {/* Main Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Supplier */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">اختر المورد *</label>
            <select
              value={form.supplier_id}
              onChange={e => handleSupplierChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            >
              <option value="">— اختر المورد —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">اختر المشروع</label>
            <select
              value={form.project_id}
              onChange={e => handleProjectChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            >
              <option value="">— اختر المشروع —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>

          {/* Linked LPO */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">LPO المرتبط</label>
            <select
              value={form.lpo_id}
              onChange={e => handleLpoChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            >
              <option value="">— اختياري —</option>
              {lpos.map(l => <option key={l.id} value={l.id}>{l.lpo_number}</option>)}
            </select>
          </div>

          {/* Vendor Invoice Number */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">رقم فاتورة البائع</label>
            <input
              type="text"
              value={form.vendor_invoice_number}
              onChange={e => setForm(f => ({ ...f, vendor_invoice_number: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              placeholder="أدخل رقم فاتورة المورد"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">المبلغ (د.ب) *</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              placeholder="0.000"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">طريقة الدفع *</label>
            <select
              value={form.payment_method}
              onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PurchasePaymentMethod }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            >
              {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
            </select>
          </div>
        </div>

        {/* Conditional: Post-Dated Check Fields */}
        {form.payment_method === 'deferred_cheque' && (
          <div className="border border-orange-200 bg-orange-50/50 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-orange-800">بيانات الشيك الآجل</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">تاريخ استحقاق الشيك *</label>
                <input
                  type="date"
                  value={form.check_due_date}
                  onChange={e => setForm(f => ({ ...f, check_due_date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">صورة الشيك</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => e.target.files?.[0] && handleFileUpload('check_image_data', e.target.files[0])}
                  className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200"
                />
                {form.check_image_data && (
                  <div className="mt-2 relative inline-block">
                    <img src={form.check_image_data} alt="Check" className="w-24 h-24 object-cover rounded-lg border border-slate-200 cursor-pointer" onClick={() => setPreviewImage(form.check_image_data)} />
                    <button onClick={() => setForm(f => ({ ...f, check_image_data: '' }))} className="absolute -top-1 -left-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* File Attachments */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-700">المرفقات</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Invoice Copy */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">نسخة الفاتورة</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={e => e.target.files?.[0] && handleFileUpload('invoice_copy_data', e.target.files[0])}
                className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
              />
              {form.invoice_copy_data && (
                <div className="mt-2 relative inline-block">
                  <img src={form.invoice_copy_data} alt="Invoice" className="w-24 h-24 object-cover rounded-lg border border-slate-200 cursor-pointer" onClick={() => setPreviewImage(form.invoice_copy_data)} />
                  <button onClick={() => setForm(f => ({ ...f, invoice_copy_data: '' }))} className="absolute -top-1 -left-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Payment Proof */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">إثبات الدفع</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={e => e.target.files?.[0] && handleFileUpload('payment_proof_data', e.target.files[0])}
                className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
              />
              {form.payment_proof_data && (
                <div className="mt-2 relative inline-block">
                  <img src={form.payment_proof_data} alt="Proof" className="w-24 h-24 object-cover rounded-lg border border-slate-200 cursor-pointer" onClick={() => setPreviewImage(form.payment_proof_data)} />
                  <button onClick={() => setForm(f => ({ ...f, payment_proof_data: '' }))} className="absolute -top-1 -left-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Delivery Notes */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">بيانات التوصيل (Delivery Notes)</h3>
            <button
              onClick={addDelivery}
              className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={14} /> إضافة ديلفري نوت
            </button>
          </div>

          {deliveries.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">لا يوجد بيانات توصيل — اضغط "إضافة" لتسجيل دفعة توصيل</p>
          )}

          <div className="space-y-3">
            {deliveries.map((d, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-slate-50 rounded-lg p-4 border border-slate-100">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">رقم الديلفري نوت</label>
                    <input
                      type="text"
                      value={d.delivery_note_number}
                      onChange={e => setDeliveries(prev => prev.map((x, i) => i === idx ? { ...x, delivery_note_number: e.target.value } : x))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      placeholder="DN-001"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">ملاحظات</label>
                    <input
                      type="text"
                      value={d.notes}
                      onChange={e => setDeliveries(prev => prev.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      placeholder="تفاصيل الدفعة"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">صورة الديلفري نوت</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => e.target.files?.[0] && handleDeliveryImageUpload(idx, e.target.files[0])}
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-slate-200 file:text-slate-700"
                    />
                    {d.delivery_image_data && (
                      <div className="mt-2 relative inline-block">
                        <img src={d.delivery_image_data} alt="DN" className="w-16 h-16 object-cover rounded border border-slate-200 cursor-pointer" onClick={() => setPreviewImage(d.delivery_image_data)} />
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => removeDelivery(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg mt-5">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">ملاحظات</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
            placeholder="ملاحظات إضافية..."
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} loading={saving}>
            {isEdit ? 'تحديث الفاتورة' : 'حفظ فاتورة الشراء'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/purchases')}>إلغاء</Button>
        </div>
      </div>

      {/* Fullscreen Image Preview */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh]">
            <button onClick={() => setPreviewImage(null)} className="absolute -top-3 -right-3 bg-white text-slate-700 rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-slate-100">
              <X size={18} />
            </button>
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )
}
