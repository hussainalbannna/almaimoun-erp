import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Sparkles, Loader2, Copy, Paperclip, FileText, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Customer } from '../../types'
import { readDocumentText, extractJSON, hasApiKey, compressImage, openStoredFile } from '../../lib/ai'
import { uploadAttachment, uploadDataUrl, resolveAttachmentUrl, deleteAttachment } from '../../lib/storage'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

const EMPTY: Omit<Customer, 'id' | 'created_at' | 'updated_at'> = {
  name: '', company_name: '', email: '', phone: '', whatsapp: '',
  address: '', city: '', country: 'البحرين', tax_number: '',
  commercial_reg: '', payment_terms: '', notes: '',
}

interface CustomerDoc {
  id: string
  name: string
  doc_type: string
  file_url: string  // مسار Storage للمستندات الجديدة، أو Data URL قديم (base64) للسجلّات السابقة
  file_type: string
  created_at: string
}

const DOC_FOLDER = 'documents'

export default function CustomerForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [docs, setDocs] = useState<CustomerDoc[]>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)

  // جلب مستندات العميل (بلا محتوى ثقيل — file_url يحمل مساراً قصيراً)
  const loadDocs = async () => {
    const { data } = await supabase.from('documents').select('id,name,doc_type,file_url,file_type,created_at')
      .eq('related_id', id).eq('related_type', 'customer').order('created_at', { ascending: false })
    setDocs((data ?? []) as CustomerDoc[])
  }

  useEffect(() => {
    if (!isEdit) return
    supabase.from('customers').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setForm(data as Customer)
    })
    loadDocs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit])

  const set = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  // ── قراءة بطاقة/عقد العميل بالذكاء ──
  const handleScan = async (file: File) => {
    if (!hasApiKey()) { toast.error('فعّل مفتاح الذكاء الاصطناعي من الإعدادات أولاً'); return }
    setScanning(true)
    toast.loading('جاري قراءة الملف...', { id: 'scan' })
    try {
      const text = await readDocumentText(file, `هذا مستند يخص عميلاً (بطاقة شخصية، سجل تجاري، عقد، أو ورقة بيانات — قد يكون ممسوحاً ضوئياً). استخرج البيانات وأرجع JSON فقط بدون شرح:
{
  "name": "اسم العميل أو الشخص",
  "company_name": "اسم الشركة إن وُجد",
  "phone": "رقم الهاتف",
  "email": "البريد الإلكتروني",
  "address": "العنوان",
  "city": "المدينة",
  "commercial_reg": "رقم السجل التجاري إن وُجد"
}
إذا لم تجد قيمة اتركها فارغة.`)
      const d = extractJSON<{ name?: string; company_name?: string; phone?: string; email?: string; address?: string; city?: string; commercial_reg?: string }>(text)
      if (!d) { toast.error('تعذّرت قراءة الملف', { id: 'scan' }); setScanning(false); return }
      setForm(prev => ({
        ...prev,
        ...(d.name && { name: d.name }),
        ...(d.company_name && { company_name: d.company_name }),
        ...(d.phone && { phone: d.phone, whatsapp: prev.whatsapp || d.phone }),
        ...(d.email && { email: d.email }),
        ...(d.address && { address: d.address }),
        ...(d.city && { city: d.city }),
        ...(d.commercial_reg && { commercial_reg: d.commercial_reg }),
      }))
      toast.success('تم استخراج البيانات تلقائياً', { id: 'scan' })
    } catch (e) {
      toast.error((e as Error)?.message ?? 'تعذّرت القراءة', { id: 'scan' })
    } finally {
      setScanning(false)
    }
  }

  // واتساب = نفس الهاتف
  const copyPhoneToWhatsapp = () => {
    if (!form.phone) { toast.error('أدخل رقم الهاتف أولاً'); return }
    setForm(prev => ({ ...prev, whatsapp: prev.phone }))
  }

  // رفع مستند للعميل → يُرفع إلى Storage ويُخزّن مساره في file_url (الصور تُضغط أولاً)
  const handleDocUpload = async (file: File) => {
    if (!isEdit) { toast.error('احفظ العميل أولاً ثم أرفق المستندات'); return }
    setUploadingDoc(true)
    try {
      const filePath = file.type.startsWith('image/')
        ? await uploadDataUrl(await compressImage(file), DOC_FOLDER)
        : await uploadAttachment(file, DOC_FOLDER)
      const { error } = await supabase.from('documents').insert({
        name: file.name,
        doc_type: 'customer_doc',
        file_url: filePath,
        file_type: file.type,
        related_id: id,
        related_type: 'customer',
      })
      if (error) throw error
      toast.success('تم إرفاق المستند')
      await loadDocs()
    } catch (e) {
      toast.error('تعذّر رفع المستند: ' + ((e as Error)?.message ?? ''))
    } finally {
      setUploadingDoc(false)
    }
  }

  const deleteDoc = async (doc: CustomerDoc) => {
    await supabase.from('documents').delete().eq('id', doc.id)
    // حذف الملف من Storage أيضاً (يتجاهل السجلّات القديمة المخزّنة كـ base64)
    deleteAttachment(doc.file_url).catch(() => {})
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    toast.success('تم حذف المستند')
  }

  // فتح/معاينة المستند: يحلّ مساره إلى رابط موقّع (أو يعرض base64 القديم مباشرة)
  const viewDoc = async (doc: CustomerDoc) => {
    const url = await resolveAttachmentUrl(doc.file_url)
    if (!url) { toast.error('تعذّر فتح المستند'); return }
    if (doc.file_type?.startsWith('image/')) setPreviewImg(url)
    else if (url.startsWith('data:')) openStoredFile(url, doc.file_type) // ملف قديم base64
    else window.open(url, '_blank', 'noopener')                          // ملف في Storage
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('اسم العميل مطلوب'); return }
    setLoading(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    const { error } = isEdit
      ? await supabase.from('customers').update(payload).eq('id', id)
      : await supabase.from('customers').insert(payload)
    setLoading(false)
    if (error) { toast.error('حدث خطأ أثناء الحفظ: ' + error.message); return }
    toast.success(isEdit ? 'تم تحديث العميل' : 'تم إضافة العميل')
    navigate('/customers')
  }

  return (
    <div className="max-w-2xl mx-auto p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/customers')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
            <ArrowRight size={20} />
          </button>
          <h2 className="text-lg font-semibold text-slate-800">{isEdit ? 'تعديل العميل' : 'إضافة عميل جديد'}</h2>
        </div>
        {/* قراءة ذكية */}
        <div>
          <input ref={scanRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f); e.target.value = '' }} />
          <button onClick={() => scanRef.current?.click()} disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            قراءة من ملف بالذكاء
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="الاسم *" value={form.name} onChange={set('name')} placeholder="اسم العميل" />
          <Input label="اسم الشركة" value={form.company_name} onChange={set('company_name')} placeholder="اسم الشركة (اختياري)" />
          <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" dir="ltr" />
          <Input label="رقم الهاتف" value={form.phone} onChange={set('phone')} placeholder="3xxxxxxx" dir="ltr" />
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">رقم الواتساب</label>
            <div className="flex gap-1.5">
              <input value={form.whatsapp} onChange={set('whatsapp')} placeholder="3xxxxxxx" dir="ltr"
                className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm outline-none focus:border-amber-400" />
              <button type="button" onClick={copyPhoneToWhatsapp} title="نفس رقم الهاتف"
                className="px-2.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"><Copy size={14} /></button>
            </div>
          </div>
          <Input label="المدينة / المنطقة" value={form.city} onChange={set('city')} placeholder="المنامة، سترة، الرفاع..." />
          <Input label="الدولة" value={form.country} onChange={set('country')} />
          <Input label="السجل التجاري (إن وُجد)" value={form.commercial_reg} onChange={set('commercial_reg')} />
        </div>
        <Textarea label="العنوان" value={form.address} onChange={set('address')} rows={2} placeholder="المبنى، الطريق، المجمع" />
        <Textarea label="ملاحظات" value={form.notes} onChange={set('notes')} rows={2} placeholder="أي ملاحظات إضافية" />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>{isEdit ? 'حفظ التعديلات' : 'إضافة العميل'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/customers')}>إلغاء</Button>
        </div>
      </form>

      {/* مستندات العميل */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2"><Paperclip size={16} /> مستندات العميل</h3>
          <input ref={docRef} type="file" accept="image/*,application/pdf,.doc,.docx" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); e.target.value = '' }} />
          <Button size="sm" variant="outline" loading={uploadingDoc} icon={<Paperclip size={14} />}
            onClick={() => isEdit ? docRef.current?.click() : toast.error('احفظ العميل أولاً')}>
            إرفاق مستند
          </Button>
        </div>
        {!isEdit ? (
          <p className="text-sm text-slate-400 text-center py-4">احفظ العميل أولاً لتتمكن من إرفاق مستنداته (هوية، سجل تجاري، عقود...)</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">لا توجد مستندات. أرفق هوية العميل، السجل التجاري، العقود، أو أي مستند يخصه.</p>
        ) : (
          <div className="space-y-2">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                <FileText size={18} className="text-amber-600 shrink-0" />
                <button onClick={() => viewDoc(doc)} className="flex-1 text-right text-sm text-slate-700 hover:text-amber-700 truncate">{doc.name}</button>
                <button onClick={() => deleteDoc(doc)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* معاينة الصورة */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-2xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -left-3 bg-white rounded-full p-1.5 shadow-lg text-slate-600 hover:text-red-600"><X size={18} /></button>
            <img src={previewImg} alt="مستند" className="rounded-xl max-h-[90vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
