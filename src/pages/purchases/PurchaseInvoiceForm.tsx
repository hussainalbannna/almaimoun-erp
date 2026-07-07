import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight, Plus, Trash2, X, Sparkles, Loader2, Upload, FileText,
  Building2, User, Calendar, Hash, Wallet, CreditCard, Paperclip, Truck, Receipt
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { PurchaseInvoice, PurchasePaymentMethod } from '../../types'
import { readDocumentText, extractJSON, compressImage, fileToDataUrl, hasApiKey, openStoredFile } from '../../lib/ai'
import { uploadDataUrl, getAttachmentUrl } from '../../lib/storage'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

interface SupplierOption { id: string; name: string }
interface ProjectOption { id: string; project_name: string }
interface LPOOption { id: string; lpo_number: string }

type AttachKind = 'image' | 'file'
type MainSlot = 'invoice_copy' | 'payment_proof' | 'check_image'
interface Preview { url: string; kind: AttachKind }

// صف بيان توصيل في الواجهة: image يحمل مسار Storage أو Data URL جديد؛ preview* للعرض فقط
interface DeliveryRow {
  id?: string
  delivery_note_number: string
  notes: string
  image: string
  previewUrl: string
  previewKind: AttachKind
}

const PAYMENT_METHODS: { value: PurchasePaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'نقداً', icon: <Wallet size={16} /> },
  { value: 'bank_transfer', label: 'تحويل بنكي', icon: <Building2 size={16} /> },
  { value: 'deferred_cheque', label: 'شيك آجل', icon: <CreditCard size={16} /> },
]

const todayISO = () => new Date().toISOString().slice(0, 10)
const isDataUrl = (v?: string): boolean => !!v && v.startsWith('data:')
const isImageData = (v?: string): boolean => !!v && v.startsWith('data:image')
const kindFromPath = (p: string): AttachKind => (/\.(jpe?g|png|webp|gif)$/i.test(p) ? 'image' : 'file')

// يحوّل قيمة مخزّنة (مسار Storage أو Data URL قديم) إلى رابط عرض ونوعه — يدعم النوعين معاً
async function resolveValue(value: string): Promise<Preview | null> {
  if (!value) return null
  if (isDataUrl(value)) return { url: value, kind: isImageData(value) ? 'image' : 'file' }
  const url = await getAttachmentUrl(value) // مسار → رابط موقّع مؤقّت
  return url ? { url, kind: kindFromPath(value) } : null
}

// يرفع Data URL جديداً إلى Storage ويعيد المسار؛ يمرّر المسار الموجود كما هو؛ يعيد '' للفارغ
async function persistToStorage(value: string, folder: string): Promise<string> {
  if (!value) return ''
  if (isDataUrl(value)) return uploadDataUrl(value, folder)
  return value
}

// فتح مرفق غير صورة: Data URL عبر openStoredFile، ورابط Storage الموقّع في تبويب جديد
function openResolvedFile(url: string): void {
  if (isDataUrl(url)) openStoredFile(url, url.startsWith('data:application/pdf') ? 'application/pdf' : '')
  else window.open(url, '_blank', 'noopener')
}

// ── معاينة مرفق: صورة تتكبّر، ملف يُفتح، مع زر حذف ──
function AttachmentPreview({ preview, label, onRemove, onPreviewImage }: {
  preview: Preview | null; label: string; onRemove: () => void; onPreviewImage: (url: string) => void
}) {
  if (!preview) return null
  return (
    <div className="mt-2 relative inline-block">
      {preview.kind === 'image' ? (
        <button type="button" onClick={() => onPreviewImage(preview.url)}
          className="block w-28 h-28 rounded-xl border border-slate-200 overflow-hidden group relative">
          <img src={preview.url} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
            <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100">عرض بالحجم الكامل</span>
          </div>
        </button>
      ) : (
        <button type="button" onClick={() => openResolvedFile(preview.url)}
          className="w-28 h-28 rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1.5 hover:bg-slate-100 transition-colors">
          <FileText size={30} className="text-red-500" />
          <span className="text-[11px] text-slate-600 font-medium">عرض الملف</span>
        </button>
      )}
      <button type="button" onClick={onRemove} className="absolute -top-2 -left-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md transition-colors">
        <X size={13} />
      </button>
    </div>
  )
}

// ── حقل رفع موحّد ──
function UploadField({ label, accept, onFile, children }: {
  label: string; accept: string; onFile: (f: File) => void; children?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>
      <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-amber-400 hover:bg-amber-50/40 transition-colors">
        <Upload size={15} className="text-slate-400" />
        <span>اختر ملفاً (صورة أو PDF)</span>
        <input type="file" accept={accept} className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      </label>
      {children}
    </div>
  )
}

export default function PurchaseInvoiceForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
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
    entry_date: todayISO(),
    amount: '',
    tax_rate: '10',
    payment_method: 'cash' as PurchasePaymentMethod,
    check_due_date: '',
    // القيمة = مسار Storage (سجل موجود) أو Data URL جديد لم يُرفع بعد أو '' — تُحفظ في أعمدة *_path
    invoice_copy: '',
    payment_proof: '',
    check_image: '',
    notes: '',
  })

  // روابط عرض المرفقات الرئيسية (منفصلة عن قيمة الحفظ، تُحلّ من المسارات أو Data URL)
  const [mainPreviews, setMainPreviews] = useState<Record<MainSlot, Preview | null>>({
    invoice_copy: null, payment_proof: null, check_image: null,
  })

  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])

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
          const inv = data as PurchaseInvoice & {
            entry_date?: string | null; created_at?: string; tax_rate?: number; subtotal?: number
            invoice_copy_path?: string; payment_proof_path?: string; check_image_path?: string
            invoice_copy_data?: string; payment_proof_data?: string; check_image_data?: string
          }
          // amount مخزّن شامل الضريبة. نعرض المبلغ قبل الضريبة في الإدخال
          const taxRate = inv.tax_rate != null ? Number(inv.tax_rate) : 10
          const total = Number(inv.amount ?? 0)
          const sub = inv.subtotal && Number(inv.subtotal) > 0 ? Number(inv.subtotal) : (taxRate > 0 ? total / (1 + taxRate / 100) : total)

          // المسار أولاً، ثم توافق خلفي مع سجلّات base64 القديمة إن بقيت
          const icVal = inv.invoice_copy_path || inv.invoice_copy_data || ''
          const ppVal = inv.payment_proof_path || inv.payment_proof_data || ''
          const chVal = inv.check_image_path || inv.check_image_data || ''

          setForm({
            supplier_id: inv.supplier_id ?? '',
            supplier_name: inv.supplier_name ?? '',
            project_id: inv.project_id ?? '',
            project_name: inv.project_name ?? '',
            lpo_id: inv.lpo_id ?? '',
            lpo_number: inv.lpo_number ?? '',
            vendor_invoice_number: inv.vendor_invoice_number ?? '',
            entry_date: (inv.entry_date || inv.created_at || new Date().toISOString()).slice(0, 10),
            amount: sub > 0 ? String(Number(sub.toFixed(3))) : '',
            tax_rate: String(taxRate),
            payment_method: inv.payment_method,
            check_due_date: inv.check_due_date ?? '',
            invoice_copy: icVal,
            payment_proof: ppVal,
            check_image: chVal,
            notes: inv.notes ?? '',
          })

          const [icP, ppP, chP] = await Promise.all([resolveValue(icVal), resolveValue(ppVal), resolveValue(chVal)])
          setMainPreviews({ invoice_copy: icP, payment_proof: ppP, check_image: chP })
        }

        const { data: delData } = await supabase.from('purchase_invoice_deliveries').select('*').eq('purchase_invoice_id', id).order('created_at')
        const raw = (delData ?? []) as Array<{
          id?: string; delivery_note_number?: string; notes?: string
          delivery_image_path?: string; delivery_image_data?: string
        }>
        const resolved = await Promise.all(raw.map(async d => {
          const value = d.delivery_image_path || d.delivery_image_data || ''
          const r = await resolveValue(value)
          return {
            id: d.id,
            delivery_note_number: d.delivery_note_number ?? '',
            notes: d.notes ?? '',
            image: value,
            previewUrl: r?.url ?? '',
            previewKind: (r?.kind ?? 'file') as AttachKind,
          }
        }))
        setDeliveries(resolved)
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

  // ── قراءة الفاتورة بالذكاء الاصطناعي ──
  const handleScanInvoice = async (file: File) => {
    if (!hasApiKey()) {
      toast.error('فعّل مفتاح الذكاء الاصطناعي من الإعدادات أولاً')
      return
    }
    setScanning(true)
    toast.loading('جاري قراءة الفاتورة...', { id: 'inv-scan' })
    try {
      const text = await readDocumentText(file, `اقرأ فاتورة المورد هذه بدقة تامة حتى لو كانت ممسوحة ضوئياً أو صورة غير واضحة. افهم محتواها واستخرج البيانات. أرجع JSON فقط بدون أي شرح:
{
  "supplier_name": "اسم المورد أو الشركة",
  "vendor_invoice_number": "رقم الفاتورة",
  "amount": المبلغ الإجمالي النهائي بالدينار رقم فقط بدون عملة,
  "date": "YYYY-MM-DD"
}
أي حقل غير موجود اتركه فارغاً "" أو 0.`)
      const parsed = extractJSON<{ supplier_name?: string; vendor_invoice_number?: string; amount?: number; date?: string }>(text)
      if (!parsed) { toast.error('تعذّر فهم الفاتورة', { id: 'inv-scan' }); return }

      let matchedSupplierId = ''
      let matchedSupplierName = ''
      if (parsed.supplier_name) {
        const match = suppliers.find(s =>
          s.name && (s.name.includes(parsed.supplier_name!) || parsed.supplier_name!.includes(s.name))
        )
        if (match) { matchedSupplierId = match.id; matchedSupplierName = match.name }
      }

      const isImg = file.type.startsWith('image/')
      const dataUrl = isImg ? await compressImage(file) : await fileToDataUrl(file)
      const validDate = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : ''

      // المبلغ المستخرج من الفاتورة شامل الضريبة → نحوّله لقبل الضريبة حسب النسبة الحالية
      const extractedTotal = parsed.amount ? Number(parsed.amount) : 0
      const curRate = Number(form.tax_rate) || 0
      const extractedSubtotal = extractedTotal > 0 && curRate > 0 ? extractedTotal / (1 + curRate / 100) : extractedTotal

      setForm(f => ({
        ...f,
        supplier_id: matchedSupplierId || f.supplier_id,
        supplier_name: matchedSupplierName || f.supplier_name,
        vendor_invoice_number: parsed.vendor_invoice_number || f.vendor_invoice_number,
        amount: extractedSubtotal > 0 ? String(Number(extractedSubtotal.toFixed(3))) : f.amount,
        entry_date: validDate || f.entry_date,
        invoice_copy: dataUrl,
      }))
      setMainPreviews(p => ({ ...p, invoice_copy: { url: dataUrl, kind: isImg ? 'image' : 'file' } }))

      if (parsed.supplier_name && !matchedSupplierId) {
        toast.success(`تم استخراج البيانات. المورد "${parsed.supplier_name}" غير مسجّل — اختره يدوياً`, { id: 'inv-scan', duration: 5000 })
      } else {
        toast.success('تم قراءة الفاتورة وتعبئة البيانات', { id: 'inv-scan' })
      }
    } catch (e) {
      toast.error((e as Error)?.message ?? 'تعذّرت القراءة', { id: 'inv-scan' })
    } finally {
      setScanning(false)
    }
  }

  // رفع مرفق رئيسي (يضغط الصور، يحفظ PDF كما هو) — يبقى Data URL في الذاكرة حتى الحفظ
  const handleFileUpload = async (slot: MainSlot, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الملف يجب أن يكون أقل من 10 ميجابايت')
      return
    }
    try {
      const isImg = file.type.startsWith('image/')
      const data = isImg ? await compressImage(file) : await fileToDataUrl(file)
      setForm(f => ({ ...f, [slot]: data }))
      setMainPreviews(p => ({ ...p, [slot]: { url: data, kind: isImg ? 'image' : 'file' } }))
    } catch (e) {
      toast.error('تعذّر رفع الملف: ' + ((e as Error)?.message ?? ''))
    }
  }

  const removeMain = (slot: MainSlot) => {
    setForm(f => ({ ...f, [slot]: '' }))
    setMainPreviews(p => ({ ...p, [slot]: null }))
  }

  const handleDeliveryImageUpload = async (idx: number, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الملف يجب أن يكون أقل من 10 ميجابايت')
      return
    }
    try {
      const isImg = file.type.startsWith('image/')
      const data = isImg ? await compressImage(file) : await fileToDataUrl(file)
      setDeliveries(prev => prev.map((d, i) => i === idx
        ? { ...d, image: data, previewUrl: data, previewKind: isImg ? 'image' : 'file' }
        : d))
    } catch (e) {
      toast.error('تعذّر رفع الملف: ' + ((e as Error)?.message ?? ''))
    }
  }

  const removeDeliveryImage = (idx: number) =>
    setDeliveries(prev => prev.map((d, i) => i === idx ? { ...d, image: '', previewUrl: '', previewKind: 'file' } : d))

  const addDelivery = () => setDeliveries(prev => [...prev, { delivery_note_number: '', notes: '', image: '', previewUrl: '', previewKind: 'file' }])
  const removeDelivery = (idx: number) => setDeliveries(prev => prev.filter((_, i) => i !== idx))

  // ── حساب الضريبة الحي (المُدخل = المبلغ قبل الضريبة) ──
  const subtotalNum = Number(form.amount) || 0
  const taxRateNum = Number(form.tax_rate) || 0
  const taxAmount = subtotalNum * (taxRateNum / 100)
  const totalWithTax = subtotalNum + taxAmount

  const handleSave = async () => {
    if (!form.supplier_id) { toast.error('يرجى اختيار المورد'); return }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('يرجى إدخال المبلغ'); return }
    if (!form.entry_date) { toast.error('يرجى إدخال تاريخ الفاتورة'); return }
    if (form.payment_method === 'deferred_cheque' && !form.check_due_date) { toast.error('يرجى إدخال تاريخ استحقاق الشيك'); return }

    setSaving(true)

    // رفع المرفقات إلى Storage والحصول على المسارات (يبقى القديم المرفوع كما هو، والجديد يُرفع الآن)
    let invoiceCopyPath = ''
    let paymentProofPath = ''
    let checkImagePath = ''
    const deliveryPaths: string[] = []
    try {
      const FOLDER = 'purchase-invoices'
      invoiceCopyPath = await persistToStorage(form.invoice_copy, FOLDER)
      paymentProofPath = await persistToStorage(form.payment_proof, FOLDER)
      checkImagePath = form.payment_method === 'deferred_cheque' ? await persistToStorage(form.check_image, FOLDER) : ''
      for (const d of deliveries) {
        deliveryPaths.push(await persistToStorage(d.image, `${FOLDER}/deliveries`))
      }
    } catch (e) {
      toast.error('تعذّر رفع المرفقات: ' + ((e as Error)?.message ?? ''))
      setSaving(false)
      return
    }

    // الحمولة مطابقة لأعمدة الجدول الفعلية: مسارات *_path فقط، وبلا أعمدة has_* المحسوبة
    const payload = {
      supplier_id: form.supplier_id || null,
      supplier_name: form.supplier_name,
      project_id: form.project_id || null,
      project_name: form.project_name,
      lpo_id: form.lpo_id || null,
      lpo_number: form.lpo_number,
      vendor_invoice_number: form.vendor_invoice_number,
      entry_date: form.entry_date,
      subtotal: Number(subtotalNum.toFixed(3)),       // المبلغ قبل الضريبة
      tax_rate: taxRateNum,                            // نسبة الضريبة
      amount: Number(totalWithTax.toFixed(3)),         // المجموع الشامل (يبقى amount)
      payment_method: form.payment_method,
      check_due_date: form.payment_method === 'deferred_cheque' && form.check_due_date ? form.check_due_date : null,
      invoice_copy_path: invoiceCopyPath,
      payment_proof_path: paymentProofPath,
      check_image_path: checkImagePath,
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }

    let invoiceId = id
    if (isEdit) {
      const { error } = await supabase.from('purchase_invoices').update(payload).eq('id', id)
      if (error) { toast.error('فشل في الحفظ: ' + error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('purchase_invoices').insert(payload).select('id').single()
      if (error || !data) { toast.error('فشل في الحفظ: ' + (error?.message ?? '')); setSaving(false); return }
      invoiceId = (data as { id: string }).id
    }

    // إعادة بناء بيانات التوصيل (نحذف القديمة ثم ندرج الصالحة بمساراتها)
    if (isEdit) {
      await supabase.from('purchase_invoice_deliveries').delete().eq('purchase_invoice_id', id)
    }
    const deliveryPayload = deliveries
      .map((d, i) => ({ d, path: deliveryPaths[i] ?? '' }))
      .filter(({ d, path }) => d.delivery_note_number.trim() || path || d.notes.trim())
      .map(({ d, path }) => ({
        purchase_invoice_id: invoiceId,
        delivery_note_number: d.delivery_note_number,
        delivery_image_path: path,
        notes: d.notes,
      }))
    if (deliveryPayload.length > 0) {
      const { error: delErr } = await supabase.from('purchase_invoice_deliveries').insert(deliveryPayload)
      if (delErr) { toast.error('حُفظت الفاتورة، لكن تعذّر حفظ بيانات التوصيل: ' + delErr.message); setSaving(false); navigate('/purchases'); return }
    }

    toast.success(isEdit ? 'تم تحديث الفاتورة بنجاح' : 'تم تسجيل فاتورة الشراء بنجاح')
    setSaving(false)
    navigate('/purchases')
  }

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-300"

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/purchases')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
          <ArrowRight size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <Receipt size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{isEdit ? 'تعديل فاتورة شراء' : 'تسجيل فاتورة شراء جديدة'}</h1>
            <p className="text-slate-500 text-sm mt-0.5">إدخال بيانات المشتريات والمدفوعات والمرفقات</p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* ═══ قراءة الفاتورة بالذكاء الاصطناعي ═══ */}
        <div className="rounded-xl border-2 border-dashed p-4" style={{ borderColor: '#c4925a55', background: '#fdf9f4' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <div className="font-semibold text-slate-800 text-sm">قراءة الفاتورة تلقائياً بالذكاء الاصطناعي</div>
                <div className="text-xs text-slate-500">ارفع صورة أو PDF لفاتورة المورد (حتى الممسوحة) ليملأ المبلغ ورقم الفاتورة والمورد والتاريخ</div>
              </div>
            </div>
            <label className="cursor-pointer">
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleScanInvoice(f); e.target.value = '' }} />
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity"
                style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)', opacity: scanning ? 0.6 : 1 }}>
                {scanning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {scanning ? 'جاري القراءة...' : 'رفع وقراءة'}
              </span>
            </label>
          </div>
        </div>

        {/* ═══ البيانات الأساسية ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><FileText size={17} className="text-amber-600" /> بيانات الفاتورة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* المورد */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><User size={14} className="text-slate-400" /> المورد *</label>
              <select value={form.supplier_id} onChange={e => handleSupplierChange(e.target.value)} className={inputCls}>
                <option value="">— اختر المورد —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* المشروع */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><Building2 size={14} className="text-slate-400" /> المشروع</label>
              <select value={form.project_id} onChange={e => handleProjectChange(e.target.value)} className={inputCls}>
                <option value="">— اختر المشروع —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
              </select>
            </div>

            {/* تاريخ الفاتورة */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><Calendar size={14} className="text-slate-400" /> تاريخ الفاتورة *</label>
              <input type="date" value={form.entry_date} max={todayISO()}
                onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} className={inputCls} />
              <p className="text-xs text-slate-400 mt-1">تاريخ الفاتورة الفعلي — يمكن اختيار تاريخ سابق للفواتير القديمة</p>
            </div>

            {/* LPO */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><Hash size={14} className="text-slate-400" /> LPO المرتبط</label>
              <select value={form.lpo_id} onChange={e => handleLpoChange(e.target.value)} className={inputCls}>
                <option value="">— اختياري —</option>
                {lpos.map(l => <option key={l.id} value={l.id}>{l.lpo_number}</option>)}
              </select>
            </div>

            {/* رقم فاتورة البائع */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><Hash size={14} className="text-slate-400" /> رقم فاتورة البائع</label>
              <input type="text" value={form.vendor_invoice_number}
                onChange={e => setForm(f => ({ ...f, vendor_invoice_number: e.target.value }))} className={inputCls}
                placeholder="أدخل رقم فاتورة المورد" />
            </div>

            {/* المبلغ قبل الضريبة */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><Wallet size={14} className="text-slate-400" /> المبلغ قبل الضريبة (د.ب) *</label>
              <input type="number" step="0.001" min="0" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} dir="ltr"
                placeholder="0.000" />
            </div>

            {/* نسبة الضريبة */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><Receipt size={14} className="text-slate-400" /> ضريبة القيمة المضافة</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, tax_rate: '10' }))}
                  className={`py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${form.tax_rate === '10' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                  10% (قياسي)
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, tax_rate: '0' }))}
                  className={`py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${form.tax_rate === '0' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                  معفى (0%)
                </button>
              </div>
            </div>
          </div>

          {/* بطاقة تفصيل الضريبة الحي */}
          {subtotalNum > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-x-reverse divide-amber-100">
                <div className="p-3 text-center bg-slate-50">
                  <div className="text-[11px] text-slate-400 mb-0.5">المبلغ قبل الضريبة</div>
                  <div className="text-sm font-bold text-slate-700" dir="ltr">{subtotalNum.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</div>
                </div>
                <div className="p-3 text-center bg-amber-50/50">
                  <div className="text-[11px] text-amber-600 mb-0.5">الضريبة ({taxRateNum}%)</div>
                  <div className="text-sm font-bold text-amber-700" dir="ltr">{taxAmount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</div>
                </div>
                <div className="p-3 text-center text-white" style={{ background: 'linear-gradient(135deg, #7b4a2d 0%, #9a6440 100%)' }}>
                  <div className="text-[11px] text-white/80 mb-0.5">المجموع الشامل</div>
                  <div className="text-sm font-black" dir="ltr">{totalWithTax.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══ طريقة الدفع ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Wallet size={17} className="text-amber-600" /> طريقة الدفع</h2>
          <div className="grid grid-cols-3 gap-3">
            {PAYMENT_METHODS.map(pm => (
              <button key={pm.value} type="button" onClick={() => setForm(f => ({ ...f, payment_method: pm.value }))}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${form.payment_method === pm.value ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                <div className={form.payment_method === pm.value ? 'text-amber-600' : 'text-slate-400'}>{pm.icon}</div>
                <span className={`text-sm font-medium ${form.payment_method === pm.value ? 'text-amber-700' : 'text-slate-600'}`}>{pm.label}</span>
              </button>
            ))}
          </div>

          {/* الشيك الآجل */}
          {form.payment_method === 'deferred_cheque' && (
            <div className="mt-4 border border-orange-200 bg-orange-50/50 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-orange-800 flex items-center gap-1.5"><CreditCard size={15} /> بيانات الشيك الآجل</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">تاريخ استحقاق الشيك *</label>
                  <input type="date" value={form.check_due_date}
                    onChange={e => setForm(f => ({ ...f, check_due_date: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                  <p className="text-xs text-orange-600/70 mt-1">لا يُحتسب مصروفاً فعلياً حتى يحين تاريخ الاستحقاق</p>
                </div>
                <UploadField label="صورة الشيك" accept="image/*,.pdf" onFile={f => handleFileUpload('check_image', f)}>
                  <AttachmentPreview preview={mainPreviews.check_image} label="Check"
                    onRemove={() => removeMain('check_image')} onPreviewImage={setPreviewImage} />
                </UploadField>
              </div>
            </div>
          )}
        </div>

        {/* ═══ المرفقات ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Paperclip size={17} className="text-amber-600" /> المرفقات</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <UploadField label="نسخة الفاتورة" accept="image/*,.pdf" onFile={f => handleFileUpload('invoice_copy', f)}>
              <AttachmentPreview preview={mainPreviews.invoice_copy} label="Invoice"
                onRemove={() => removeMain('invoice_copy')} onPreviewImage={setPreviewImage} />
            </UploadField>
            <UploadField label="إثبات الدفع" accept="image/*,.pdf" onFile={f => handleFileUpload('payment_proof', f)}>
              <AttachmentPreview preview={mainPreviews.payment_proof} label="Proof"
                onRemove={() => removeMain('payment_proof')} onPreviewImage={setPreviewImage} />
            </UploadField>
          </div>
        </div>

        {/* ═══ بيانات التوصيل ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-700 flex items-center gap-2"><Truck size={17} className="text-amber-600" /> بيانات التوصيل (Delivery Notes)</h2>
            <button onClick={addDelivery}
              className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
              <Plus size={14} /> إضافة
            </button>
          </div>

          {deliveries.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6 bg-slate-50 rounded-lg">لا يوجد بيانات توصيل — اضغط "إضافة" لتسجيل دفعة توصيل</p>
          ) : (
            <div className="space-y-3">
              {deliveries.map((d, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-slate-50 rounded-lg p-4 border border-slate-100">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">رقم الديلفري نوت</label>
                      <input type="text" value={d.delivery_note_number}
                        onChange={e => setDeliveries(prev => prev.map((x, i) => i === idx ? { ...x, delivery_note_number: e.target.value } : x))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" placeholder="DN-001" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">ملاحظات</label>
                      <input type="text" value={d.notes}
                        onChange={e => setDeliveries(prev => prev.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" placeholder="تفاصيل الدفعة" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">صورة / PDF الديلفري</label>
                      <label className="flex items-center gap-1.5 px-2 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 cursor-pointer hover:border-amber-400 transition-colors">
                        <Upload size={13} /> اختر ملفاً
                        <input type="file" accept="image/*,.pdf" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleDeliveryImageUpload(idx, f); e.target.value = '' }} />
                      </label>
                      <AttachmentPreview
                        preview={d.previewUrl ? { url: d.previewUrl, kind: d.previewKind } : null}
                        label="DN"
                        onRemove={() => removeDeliveryImage(idx)}
                        onPreviewImage={setPreviewImage} />
                    </div>
                  </div>
                  <button onClick={() => removeDelivery(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg mt-5">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ ملاحظات ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="font-bold text-slate-700 mb-3 flex items-center gap-2"><FileText size={17} className="text-amber-600" /> ملاحظات</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
            placeholder="ملاحظات إضافية..." />
        </div>

        {/* ═══ الأزرار ═══ */}
        <div className="flex gap-3 pt-1">
          <Button onClick={handleSave} loading={saving}>{isEdit ? 'تحديث الفاتورة' : 'حفظ فاتورة الشراء'}</Button>
          <Button variant="secondary" onClick={() => navigate('/purchases')}>إلغاء</Button>
        </div>
      </div>

      {/* معاينة الصورة بملء الشاشة */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
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
