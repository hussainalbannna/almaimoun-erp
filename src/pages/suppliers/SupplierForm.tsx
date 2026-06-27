import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Supplier, ExtractedDocumentData } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import DocumentUpload from '../../components/ui/DocumentUpload'
import toast from 'react-hot-toast'

const EMPTY: Omit<Supplier, 'id' | 'created_at' | 'updated_at'> = {
  name: '', company_name: '', email: '', phone: '', whatsapp: '',
  address: '', city: '', country: 'الإمارات', tax_number: '',
  commercial_reg: '', payment_terms: 'صافي 30 يوم', notes: '',
}

export default function SupplierForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    supabase.from('suppliers').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setForm(data as Supplier)
    })
  }, [id, isEdit])

  const set = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleExtracted = (data: ExtractedDocumentData) => {
    setForm(prev => ({
      ...prev,
      ...(data.name && { name: data.name }),
      ...(data.company_name && { company_name: data.company_name }),
      ...(data.email && { email: data.email }),
      ...(data.phone && { phone: data.phone }),
      ...(data.whatsapp && { whatsapp: data.whatsapp }),
      ...(data.address && { address: data.address }),
      ...(data.city && { city: data.city }),
      ...(data.tax_number && { tax_number: data.tax_number }),
      ...(data.commercial_reg && { commercial_reg: data.commercial_reg }),
    }))
    toast.success('تم استخراج البيانات من الملف تلقائياً')
    setShowUpload(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('اسم المورد مطلوب'); return }
    setLoading(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    const { error } = isEdit
      ? await supabase.from('suppliers').update(payload).eq('id', id)
      : await supabase.from('suppliers').insert(payload)
    setLoading(false)
    if (error) { toast.error('حدث خطأ أثناء الحفظ'); return }
    toast.success(isEdit ? 'تم تحديث المورد' : 'تم إضافة المورد')
    navigate('/suppliers')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/suppliers')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-slate-800">{isEdit ? 'تعديل المورد' : 'إضافة مورد جديد'}</h2>
      </div>

      {/* Document upload for auto-fill */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <button
          type="button"
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <Upload size={16} />
          {showUpload ? 'إخفاء رفع الملف' : 'رفع ملف لملء البيانات تلقائياً (PDF, Excel, صورة)'}
        </button>
        {showUpload && (
          <div className="mt-4">
            <DocumentUpload onExtracted={handleExtracted} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="الاسم *" value={form.name} onChange={set('name')} placeholder="اسم المورد" />
          <Input label="اسم الشركة" value={form.company_name} onChange={set('company_name')} placeholder="اسم الشركة" />
          <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" />
          <Input label="رقم الهاتف" value={form.phone} onChange={set('phone')} placeholder="+971 50 000 0000" />
          <Input label="رقم الواتساب" value={form.whatsapp} onChange={set('whatsapp')} placeholder="+971 50 000 0000" />
          <Input label="المدينة" value={form.city} onChange={set('city')} placeholder="دبي" />
          <Input label="الدولة" value={form.country} onChange={set('country')} />
          <Input label="رقم الضريبة (TRN)" value={form.tax_number} onChange={set('tax_number')} />
          <Input label="السجل التجاري" value={form.commercial_reg} onChange={set('commercial_reg')} />
          <Input label="شروط الدفع" value={form.payment_terms} onChange={set('payment_terms')} />
        </div>
        <Textarea label="العنوان" value={form.address} onChange={set('address')} rows={2} placeholder="عنوان الشركة" />
        <Textarea label="ملاحظات" value={form.notes} onChange={set('notes')} rows={2} placeholder="أي ملاحظات إضافية" />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>{isEdit ? 'حفظ التعديلات' : 'إضافة المورد'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/suppliers')}>إلغاء</Button>
        </div>
      </form>
    </div>
  )
}
