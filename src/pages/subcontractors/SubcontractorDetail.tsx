import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Plus, DollarSign, MessageCircle, Paperclip, Eye, X, FileText, Image as ImageIcon, Upload, Loader2, Edit, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, subcontractorSpecialtyLabel, openWhatsApp } from '../../lib/utils'
import { compressImage, fileToDataUrl, openStoredFile } from '../../lib/ai'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

interface Subcontractor {
  id: string
  name: string
  specialty: string
  phone: string
  whatsapp: string
  cr_number: string
  bank_iban: string
  notes: string
  status: string
}

interface Assignment {
  id: string
  project_id: string | null
  project_name: string
  scope: string
  agreed_amount: number
  paid_amount: number
  start_date: string | null
  end_date: string | null
  status: string
  notes: string
  contract_data?: string
  contract_name?: string
  work_images?: string  // مصفوفة JSON من صور العمل
}

interface Payment {
  id: string
  assignment_id: string
  amount: number
  payment_date: string
  payment_method: string
  check_due_date: string | null
  check_number: string
  notes: string
  project_id?: string | null
  payment_proof_data?: string
  invoice_copy_data?: string
}

interface Project { id: string; project_name: string }

const SPECIALTY_OPTIONS = [
  { value: 'excavation', label: 'حفر وترسية' },
  { value: 'electrical', label: 'كهرباء' },
  { value: 'plumbing', label: 'سباكة' },
  { value: 'finishing', label: 'تشطيبات (صبغ / جبس)' },
  { value: 'tiles', label: 'بلاط وسيراميك' },
  { value: 'other', label: 'أخرى' },
]

const PAY_METHODS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'cheque', label: 'شيك آجل' },
]

const PAY_LABELS: Record<string, string> = { cash: 'نقداً', bank_transfer: 'تحويل بنكي', cheque: 'شيك' }

const emptyForm: Omit<Subcontractor, 'id'> = {
  name: '', specialty: 'electrical', phone: '', whatsapp: '',
  cr_number: '', bank_iban: '', notes: '', status: 'active',
}

const isImageData = (d?: string) => !!d && d.startsWith('data:image')
const isPdfData = (d?: string) => !!d && d.startsWith('data:application/pdf')
const hasFile = (d?: string) => isImageData(d) || isPdfData(d)
const fileToData = async (file: File) => file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)

// قراءة/كتابة مصفوفة صور العمل (مخزّنة كـ JSON)
const parseImages = (raw?: string): string[] => {
  if (!raw) return []
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : [] } catch { return raw.startsWith('data:') ? [raw] : [] }
}

// مكوّن رفع + معاينة موحّد
function AttachField({ label, data, onUpload, onPreview, compact }: {
  label: string; data?: string; onUpload: (f: File) => void; onPreview: (d: string) => void; compact?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const handle = async (f: File) => { setBusy(true); try { await onUpload(f) } finally { setBusy(false) } }
  return (
    <div>
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = '' }} />
      {hasFile(data) ? (
        <div className={`flex items-center gap-2 ${compact ? '' : 'bg-slate-50 rounded-lg p-2 border border-slate-200'}`}>
          <button onClick={() => onPreview(data!)}
            className="flex items-center gap-1.5 text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 hover:border-amber-300 hover:bg-amber-50 transition-colors">
            {isImageData(data) ? <ImageIcon size={13} className="text-blue-500" /> : <FileText size={13} className="text-red-500" />}
            <Eye size={12} /> عرض {label}
          </button>
          <button onClick={() => ref.current?.click()} disabled={busy} className="text-xs text-slate-400 hover:text-amber-600">
            {busy ? <Loader2 size={13} className="animate-spin" /> : 'تغيير'}
          </button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} disabled={busy}
          className="w-full flex items-center justify-center gap-2 text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg py-2 hover:border-amber-400 hover:text-amber-600 transition-colors">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} إرفاق {label}
        </button>
      )}
    </div>
  )
}

// مكوّن صور متعددة لعمل المقاول (رفع + معاينة + حذف)
function WorkImagesField({ images, onChange, onPreview }: {
  images: string[]; onChange: (imgs: string[]) => void; onPreview: (d: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const handleAdd = async (files: FileList) => {
    setBusy(true)
    try {
      const newImgs: string[] = []
      for (const f of Array.from(files)) {
        const d = await fileToData(f)
        if (d) newImgs.push(d)
      }
      onChange([...images, ...newImgs])
    } finally { setBusy(false) }
  }
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { if (e.target.files?.length) handleAdd(e.target.files); e.target.value = '' }} />
      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => (
          <div key={i} className="relative group">
            <img src={img} alt={`عمل ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-slate-200 cursor-pointer"
              onClick={() => onPreview(img)} />
            <button type="button" onClick={() => onChange(images.filter((_, idx) => idx !== i))}
              className="absolute -top-1.5 -left-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X size={11} />
            </button>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
              <Eye size={16} className="text-white" />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => ref.current?.click()} disabled={busy}
          className="w-20 h-20 flex flex-col items-center justify-center gap-1 text-xs text-slate-400 border-2 border-dashed border-slate-300 rounded-lg hover:border-amber-400 hover:text-amber-600 transition-colors">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <><Plus size={18} /><span>صورة</span></>}
        </button>
      </div>
    </div>
  )
}

export default function SubcontractorDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // محصّن: "جديد" إذا لم يكن id معرّفاً حقيقياً
  const isNew = !id || id === 'new' || id === 'undefined'

  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [activeTab, setActiveTab] = useState<'info' | 'assignments' | 'payments'>('info')
  const [previewImg, setPreviewImg] = useState<string | null>(null)

  // حوارات الحذف
  const [deleteAssignId, setDeleteAssignId] = useState<string | null>(null)
  const [deletePayId, setDeletePayId] = useState<{ id: string; amount: number; assignmentId: string } | null>(null)

  const [showAssignForm, setShowAssignForm] = useState(false)
  const [editAssignId, setEditAssignId] = useState<string | null>(null)
  const [assignForm, setAssignForm] = useState({
    project_id: '', scope: '', agreed_amount: '', start_date: '', end_date: '', notes: '', contract_data: '', contract_name: '', work_images: [] as string[],
  })

  const [showPayForm, setShowPayForm] = useState(false)
  const [editPayId, setEditPayId] = useState<string | null>(null)
  const [payForm, setPayForm] = useState({
    assignment_id: '', amount: '', payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'cash', check_due_date: '', check_number: '', notes: '', payment_proof_data: '', invoice_copy_data: '',
  })

  const load = async () => {
    setLoading(true)
    const projRes = await supabase.from('projects').select('id, project_name').eq('status', 'active').order('project_name')
    setProjects((projRes.data ?? []) as Project[])

    if (!isNew && id) {
      const [subRes, assignRes, payRes] = await Promise.all([
        supabase.from('subcontractors').select('*').eq('id', id).single(),
        supabase.from('subcontractor_assignments').select('*').eq('subcontractor_id', id).order('created_at', { ascending: false }),
        supabase.from('subcontractor_payments').select('*').eq('subcontractor_id', id).order('payment_date', { ascending: false }),
      ])
      if (subRes.data) setForm(subRes.data as Subcontractor)
      setAssignments((assignRes.data ?? []) as Assignment[])
      setPayments((payRes.data ?? []) as Payment[])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> | string) => {
    const val = typeof e === 'string' ? e : e.target.value
    setForm(f => ({ ...f, [k]: val }))
  }

  const openDoc = (data: string) => { if (isImageData(data)) setPreviewImg(data); else openStoredFile(data) }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم المقاول'); return }
    setSaving(true)
    try {
      const validId = id && id !== 'new' && id !== 'undefined'
      if (!validId) {
        const { data, error } = await supabase.from('subcontractors').insert(form).select().single()
        if (error) throw error
        toast.success('تم إضافة المقاول')
        navigate(`/subcontractors/${(data as Subcontractor).id}`)
      } else {
        const { error } = await supabase.from('subcontractors').update({ ...form, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
        toast.success('تم الحفظ')
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message
      toast.error(msg ? `خطأ: ${msg}` : 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const sendWhatsApp = () => {
    const phone = form.whatsapp || form.phone
    if (!phone) { toast.error('لا يوجد رقم واتساب للمقاول'); return }
    const msg = `السلام عليكم ${form.name}، `
    openWhatsApp(phone, msg)
  }

  // فتح نموذج التكليف للإضافة أو التعديل
  const openAssignForm = (a?: Assignment) => {
    if (a) {
      setEditAssignId(a.id)
      setAssignForm({
        project_id: a.project_id ?? '', scope: a.scope, agreed_amount: String(a.agreed_amount),
        start_date: a.start_date ?? '', end_date: a.end_date ?? '', notes: a.notes ?? '',
        contract_data: a.contract_data ?? '', contract_name: a.contract_name ?? '',
        work_images: parseImages(a.work_images),
      })
    } else {
      setEditAssignId(null)
      setAssignForm({ project_id: '', scope: '', agreed_amount: '', start_date: '', end_date: '', notes: '', contract_data: '', contract_name: '', work_images: [] })
    }
    setShowAssignForm(true)
  }

  const handleSaveAssignment = async () => {
    if (!assignForm.scope.trim()) { toast.error('أدخل وصف العمل'); return }
    if (!id || id === 'new') { toast.error('احفظ بيانات المقاول أولاً'); return }
    try {
      const proj = projects.find(p => p.id === assignForm.project_id)
      const payload = {
        subcontractor_id: id,
        project_id: assignForm.project_id || null,
        project_name: proj?.project_name ?? '',
        scope: assignForm.scope,
        agreed_amount: Number(assignForm.agreed_amount) || 0,
        start_date: assignForm.start_date || null,
        end_date: assignForm.end_date || null,
        notes: assignForm.notes || '',
        contract_data: assignForm.contract_data || '',
        contract_name: assignForm.contract_name || '',
        work_images: JSON.stringify(assignForm.work_images || []),
      }
      if (editAssignId) {
        const { error } = await supabase.from('subcontractor_assignments').update(payload).eq('id', editAssignId)
        if (error) throw error
        toast.success('تم تحديث التكليف')
      } else {
        const { error } = await supabase.from('subcontractor_assignments').insert({ ...payload, status: 'active' })
        if (error) throw error
        toast.success('تم إضافة التكليف')
      }
      setShowAssignForm(false)
      setEditAssignId(null)
      load()
    } catch (e) {
      const m = (e as { message?: string })?.message
      toast.error(m ? `خطأ: ${m}` : 'حدث خطأ')
    }
  }

  const handleDeleteAssignment = async () => {
    if (!deleteAssignId) return
    try {
      await supabase.from('subcontractor_assignments').delete().eq('id', deleteAssignId)
      toast.success('تم حذف التكليف')
      setDeleteAssignId(null)
      load()
    } catch { toast.error('حدث خطأ في الحذف') }
  }

  // فتح نموذج الدفعة للإضافة أو التعديل
  const openPayForm = (p?: Payment) => {
    if (p) {
      setEditPayId(p.id)
      setPayForm({
        assignment_id: p.assignment_id, amount: String(p.amount), payment_date: p.payment_date,
        payment_method: p.payment_method, check_due_date: p.check_due_date ?? '', check_number: p.check_number ?? '',
        notes: p.notes ?? '', payment_proof_data: p.payment_proof_data ?? '', invoice_copy_data: p.invoice_copy_data ?? '',
      })
    } else {
      setEditPayId(null)
      setPayForm({ assignment_id: '', amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'cash', check_due_date: '', check_number: '', notes: '', payment_proof_data: '', invoice_copy_data: '' })
    }
    setShowPayForm(true)
  }

  const handleSavePayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast.error('أدخل المبلغ'); return }
    if (!payForm.assignment_id) { toast.error('اختر التكليف'); return }
    try {
      const assign = assignments.find(a => a.id === payForm.assignment_id)
      const payload = {
        assignment_id: payForm.assignment_id,
        subcontractor_id: id,
        project_id: assign?.project_id ?? null,
        amount: Number(payForm.amount),
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        check_due_date: payForm.check_due_date || null,
        check_number: payForm.check_number || '',
        notes: payForm.notes || '',
        payment_proof_data: payForm.payment_proof_data || '',
        invoice_copy_data: payForm.invoice_copy_data || '',
      }
      if (editPayId) {
        // عند التعديل: نحسب فرق المبلغ لتحديث paid_amount
        const oldPay = payments.find(p => p.id === editPayId)
        const diff = Number(payForm.amount) - Number(oldPay?.amount ?? 0)
        const { error } = await supabase.from('subcontractor_payments').update(payload).eq('id', editPayId)
        if (error) throw error
        if (assign && diff !== 0) {
          await supabase.from('subcontractor_assignments').update({
            paid_amount: Number(assign.paid_amount) + diff
          }).eq('id', payForm.assignment_id)
        }
        toast.success('تم تحديث الدفعة')
      } else {
        const { error } = await supabase.from('subcontractor_payments').insert(payload)
        if (error) throw error
        if (assign) {
          await supabase.from('subcontractor_assignments').update({
            paid_amount: Number(assign.paid_amount) + Number(payForm.amount)
          }).eq('id', payForm.assignment_id)
        }
        toast.success('تم تسجيل الدفعة')
      }
      setShowPayForm(false)
      setEditPayId(null)
      load()
    } catch (e) {
      const m = (e as { message?: string })?.message
      toast.error(m ? `خطأ: ${m}` : 'حدث خطأ')
    }
  }

  const handleDeletePayment = async () => {
    if (!deletePayId) return
    try {
      await supabase.from('subcontractor_payments').delete().eq('id', deletePayId.id)
      // خصم مبلغ الدفعة المحذوفة من paid_amount
      const assign = assignments.find(a => a.id === deletePayId.assignmentId)
      if (assign) {
        await supabase.from('subcontractor_assignments').update({
          paid_amount: Math.max(0, Number(assign.paid_amount) - Number(deletePayId.amount))
        }).eq('id', deletePayId.assignmentId)
      }
      toast.success('تم حذف الدفعة')
      setDeletePayId(null)
      load()
    } catch { toast.error('حدث خطأ في الحذف') }
  }

  const totalAgreed = assignments.reduce((s, a) => s + Number(a.agreed_amount), 0)
  const totalPaid = assignments.reduce((s, a) => s + Number(a.paid_amount), 0)
  const totalRemaining = totalAgreed - totalPaid

  if (loading) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/subcontractors')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ChevronRight size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{isNew ? 'إضافة مقاول جديد' : form.name}</h1>
            {!isNew && <p className="text-slate-500 text-sm">{subcontractorSpecialtyLabel[form.specialty] ?? form.specialty}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (form.whatsapp || form.phone) && (
            <Button variant="outline" size="sm" icon={<MessageCircle size={15} className="text-green-600" />}
              className="border-green-300 text-green-700 hover:bg-green-50" onClick={sendWhatsApp}>واتساب</Button>
          )}
          <Button loading={saving} onClick={handleSave}>حفظ</Button>
        </div>
      </div>

      {!isNew && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'إجمالي المتفق عليه', value: formatCurrency(totalAgreed), color: '#7b4a2d' },
            { label: 'إجمالي المدفوع', value: formatCurrency(totalPaid), color: '#16a34a' },
            { label: 'المتبقي المستحق', value: formatCurrency(totalRemaining), color: totalRemaining > 0 ? '#dc2626' : '#64748b' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">{kpi.label}</div>
              <div className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {!isNew && (
        <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit">
          {([['info', 'البيانات'], ['assignments', 'التكاليف والعقود'], ['payments', 'المدفوعات']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {(isNew || activeTab === 'info') && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="اسم المقاول *" value={form.name} onChange={set('name')} placeholder="محمد علي السباك" />
            <Select label="التخصص *" value={form.specialty} onChange={set('specialty')} options={SPECIALTY_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="رقم الهاتف" value={form.phone} onChange={set('phone')} placeholder="3XXXXXXX" dir="ltr" />
            <Input label="واتساب" value={form.whatsapp} onChange={set('whatsapp')} placeholder="973XXXXXXXX" dir="ltr" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="رقم السجل التجاري" value={form.cr_number} onChange={set('cr_number')} dir="ltr" />
            <Input label="IBAN البنكي" value={form.bank_iban} onChange={set('bank_iban')} dir="ltr" />
          </div>
          <Textarea label="ملاحظات" value={form.notes} onChange={set('notes')} rows={2} />
        </div>
      )}

      {!isNew && activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-700">التكاليف والعقود</h3>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => openAssignForm()}>إضافة تكليف</Button>
          </div>

          {showAssignForm && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="font-medium text-amber-900 text-sm mb-2">{editAssignId ? 'تعديل التكليف' : 'تكليف جديد'}</div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="المشروع" value={assignForm.project_id}
                  onChange={e => setAssignForm(f => ({ ...f, project_id: e.target.value }))}
                  options={[{ value: '', label: '— بدون مشروع —' }, ...projects.map(p => ({ value: p.id, label: p.project_name }))]} />
                <Input label="المبلغ المتفق عليه" value={assignForm.agreed_amount}
                  onChange={e => setAssignForm(f => ({ ...f, agreed_amount: e.target.value }))} type="number" />
              </div>
              <Textarea label="وصف العمل *" value={assignForm.scope}
                onChange={e => setAssignForm(f => ({ ...f, scope: e.target.value }))} rows={2}
                placeholder="تمديدات كهربائية، أعمال حفر، سباكة..." />
              <div className="grid grid-cols-2 gap-3">
                <Input label="تاريخ البداية" value={assignForm.start_date}
                  onChange={e => setAssignForm(f => ({ ...f, start_date: e.target.value }))} type="date" />
                <Input label="تاريخ النهاية" value={assignForm.end_date}
                  onChange={e => setAssignForm(f => ({ ...f, end_date: e.target.value }))} type="date" />
              </div>
              {/* إرفاق عقد التكليف */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">عقد التكليف (صورة أو PDF)</label>
                <AttachField label="العقد" data={assignForm.contract_data}
                  onUpload={async f => { const d = await fileToData(f); setAssignForm(p => ({ ...p, contract_data: d, contract_name: f.name })) }}
                  onPreview={openDoc} />
              </div>
              {/* صور عمل المقاول (متعددة) */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">صور عمل المقاول (يمكن إضافة عدة صور)</label>
                <WorkImagesField images={assignForm.work_images}
                  onChange={imgs => setAssignForm(p => ({ ...p, work_images: imgs }))}
                  onPreview={setPreviewImg} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveAssignment}>{editAssignId ? 'تحديث' : 'حفظ'}</Button>
                <Button variant="secondary" onClick={() => { setShowAssignForm(false); setEditAssignId(null) }}>إلغاء</Button>
              </div>
            </div>
          )}

          {assignments.length === 0 ? (
            <div className="text-center py-10 text-slate-400">لا توجد تكاليف مسجلة</div>
          ) : (
            <div className="space-y-3">
              {assignments.map(a => {
                const rem = Number(a.agreed_amount) - Number(a.paid_amount)
                const pct = Number(a.agreed_amount) > 0 ? Math.round((Number(a.paid_amount) / Number(a.agreed_amount)) * 100) : 0
                const workImgs = parseImages(a.work_images)
                return (
                  <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-slate-800">{a.project_name || 'بدون مشروع'}</div>
                        <div className="text-sm text-slate-600 mt-0.5">{a.scope}</div>
                        {(a.start_date || a.end_date) && (
                          <div className="text-xs text-slate-400 mt-1">
                            {a.start_date && formatDate(a.start_date)} {a.end_date && `— ${formatDate(a.end_date)}`}
                          </div>
                        )}
                        {/* عرض العقد المرفق */}
                        {hasFile(a.contract_data) && (
                          <button onClick={() => openDoc(a.contract_data!)}
                            className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1 mt-2 hover:bg-amber-100 transition-colors">
                            <Paperclip size={12} /> <Eye size={12} /> عرض العقد
                          </button>
                        )}
                        {/* عرض صور العمل */}
                        {workImgs.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs text-slate-400 mb-1">صور العمل ({workImgs.length}):</div>
                            <div className="flex flex-wrap gap-1.5">
                              {workImgs.map((img, i) => (
                                <img key={i} src={img} alt={`عمل ${i + 1}`}
                                  className="w-14 h-14 object-cover rounded-lg border border-slate-200 cursor-pointer hover:ring-2 hover:ring-amber-300 transition-all"
                                  onClick={() => setPreviewImg(img)} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="text-left shrink-0">
                        <div className="text-xs text-slate-400">المتفق</div>
                        <div className="font-bold text-slate-700">{formatCurrency(Number(a.agreed_amount))}</div>
                        <div className="text-xs text-slate-400 mt-0.5">مدفوع: {formatCurrency(Number(a.paid_amount))}</div>
                        <div className={`text-xs font-medium mt-0.5 ${rem > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {rem > 0 ? `متبقي: ${formatCurrency(rem)}` : '✓ مكتمل'}
                        </div>
                        {/* أزرار التعديل والحذف */}
                        <div className="flex gap-1 mt-2 justify-end">
                          <button onClick={() => openAssignForm(a)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="تعديل">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => setDeleteAssignId(a.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="حذف">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                    {Number(a.agreed_amount) > 0 && (
                      <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!isNew && activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-700">سجل المدفوعات</h3>
            <Button size="sm" icon={<DollarSign size={14} />} onClick={() => openPayForm()}>تسجيل دفعة</Button>
          </div>

          {showPayForm && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
              <div className="font-medium text-green-900 text-sm mb-2">{editPayId ? 'تعديل الدفعة' : 'دفعة جديدة'}</div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="التكليف *" value={payForm.assignment_id}
                  onChange={e => setPayForm(f => ({ ...f, assignment_id: e.target.value }))}
                  options={[{ value: '', label: '— اختر —' }, ...assignments.map(a => ({ value: a.id, label: `${a.project_name || 'عام'} — ${a.scope.slice(0, 30)}` }))]} />
                <Input label="المبلغ *" value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} type="number" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="تاريخ الدفع" value={payForm.payment_date}
                  onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} type="date" />
                <Select label="طريقة الدفع" value={payForm.payment_method}
                  onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))} options={PAY_METHODS} />
              </div>
              {payForm.payment_method === 'cheque' && (
                <div className="grid grid-cols-2 gap-3">
                  <Input label="تاريخ استحقاق الشيك" value={payForm.check_due_date}
                    onChange={e => setPayForm(f => ({ ...f, check_due_date: e.target.value }))} type="date" />
                  <Input label="رقم الشيك" value={payForm.check_number}
                    onChange={e => setPayForm(f => ({ ...f, check_number: e.target.value }))} dir="ltr" />
                </div>
              )}
              <Input label="ملاحظات" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
              {/* إرفاق إثبات الدفع + الفاتورة */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">إثبات الدفع</label>
                  <AttachField label="الإثبات" data={payForm.payment_proof_data}
                    onUpload={async f => { const d = await fileToData(f); setPayForm(p => ({ ...p, payment_proof_data: d })) }}
                    onPreview={openDoc} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">فاتورة المقاول</label>
                  <AttachField label="الفاتورة" data={payForm.invoice_copy_data}
                    onUpload={async f => { const d = await fileToData(f); setPayForm(p => ({ ...p, invoice_copy_data: d })) }}
                    onPreview={openDoc} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSavePayment}>{editPayId ? 'تحديث الدفعة' : 'تسجيل الدفعة'}</Button>
                <Button variant="secondary" onClick={() => { setShowPayForm(false); setEditPayId(null) }}>إلغاء</Button>
              </div>
            </div>
          )}

          {payments.length === 0 ? (
            <div className="text-center py-10 text-slate-400">لا توجد مدفوعات مسجلة</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">التاريخ</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">الطريقة</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600">المستندات</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">ملاحظات</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {payments.map(p => {
                    const docs: { label: string; data: string }[] = []
                    if (hasFile(p.payment_proof_data)) docs.push({ label: 'إثبات الدفع', data: p.payment_proof_data! })
                    if (hasFile(p.invoice_copy_data)) docs.push({ label: 'الفاتورة', data: p.invoice_copy_data! })
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-700">{formatDate(p.payment_date)}</td>
                        <td className="px-4 py-3 font-bold text-green-700">{formatCurrency(Number(p.amount))}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {PAY_LABELS[p.payment_method] ?? p.payment_method}{p.payment_method === 'cheque' && p.check_due_date ? ` (${formatDate(p.check_due_date)})` : ''}
                        </td>
                        <td className="px-4 py-3">
                          {docs.length > 0 ? (
                            <div className="flex items-center justify-center gap-1">
                              {docs.map((doc, di) => (
                                <button key={di} onClick={() => openDoc(doc.data)} title={doc.label}
                                  className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 px-2 py-1 rounded-lg transition-colors">
                                  {isImageData(doc.data) ? <ImageIcon size={12} /> : <FileText size={12} />}
                                </button>
                              ))}
                            </div>
                          ) : <div className="text-center text-slate-300 text-xs">—</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{p.notes || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => openPayForm(p)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="تعديل">
                              <Edit size={14} />
                            </button>
                            <button onClick={() => setDeletePayId({ id: p.id, amount: Number(p.amount), assignmentId: p.assignment_id })} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="حذف">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-slate-700">الإجمالي</td>
                    <td className="px-4 py-3 font-bold text-green-700">{formatCurrency(payments.reduce((s, p) => s + Number(p.amount), 0))}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* معاينة الصورة بملء الشاشة */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -right-3 bg-white text-slate-700 rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-slate-100">
              <X size={18} />
            </button>
            <img src={previewImg} alt="معاينة" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}

      {/* حوارات الحذف */}
      <ConfirmDialog open={!!deleteAssignId} title="حذف التكليف" message="هل أنت متأكد من حذف هذا التكليف؟ سيتم حذف بياناته نهائياً." confirmLabel="حذف" danger onConfirm={handleDeleteAssignment} onCancel={() => setDeleteAssignId(null)} />
      <ConfirmDialog open={!!deletePayId} title="حذف الدفعة" message="هل أنت متأكد من حذف هذه الدفعة؟ سيُخصم مبلغها من إجمالي المدفوع." confirmLabel="حذف" danger onConfirm={handleDeletePayment} onCancel={() => setDeletePayId(null)} />
    </div>
  )
}
