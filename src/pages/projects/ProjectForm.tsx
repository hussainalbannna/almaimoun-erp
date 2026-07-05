import { useEffect, useState, useRef, useMemo, type DragEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Sparkles, Loader2, FileCheck, FolderOpen,
  FileText, FileImage, Eye, X, Building2, User, Layers, Paperclip,
  GripVertical, ChevronUp, ChevronDown
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectMilestone, Customer } from '../../types'
import { nextSerial, formatCurrency } from '../../lib/utils'
import { readDocumentText, extractJSON, compressImage, fileToDataUrl, openStoredFile, hasApiKey } from '../../lib/ai'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

const DEFAULT_MILESTONES = [
  'دفعة مقدمة', 'أعمال الأساسات - الخرسانة العمياء', 'أعمال الأساسات', 'أعمال الأعمدة والجسور',
  'أعمال الأسقف - الدور الأرضي', 'أعمال البناء بالطابوق - الدور الأرضي', 'أعمال الأسقف - الدور الأول',
  'أعمال البناء بالطابوق - الدور الأول', 'أعمال اللياسة', 'أعمال الأسقف - الدور الثاني',
  'أعمال السيراميك والبلاط', 'أعمال التشطيبات النهائية', 'تسليم المشروع'
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'نشط' },
  { value: 'completed', label: 'منتهي' },
  { value: 'on_hold', label: 'متوقف' },
  { value: 'cancelled', label: 'ملغى' },
]

const DOC_TYPES = [
  { value: 'contract', label: 'عقد' },
  { value: 'permit', label: 'رخصة بناء' },
  { value: 'drawing', label: 'مخططات ورسومات' },
  { value: 'soil_report', label: 'فحص تربة' },
  { value: 'quotation', label: 'عرض سعر' },
  { value: 'invoice', label: 'فاتورة' },
  { value: 'receipt', label: 'إيصال' },
  { value: 'id', label: 'هوية / CPR' },
  { value: 'other', label: 'أخرى' },
]
const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(DOC_TYPES.map(d => [d.value, d.label]))

interface ProjectDoc {
  id?: string
  name: string
  doc_type: string
  file_url: string
  file_type: string
  created_at?: string
}

// نوع موسّع يشمل الحقول الذكية الإضافية
type ProjectFormState = Partial<Project> & {
  project_number?: string
  estimated_cost?: number
  handover_date?: string | null
  warranty_months?: number
  soil_type?: string
  building_permit?: string
  consultant_name?: string
  consultant_phone?: string
}

// مُعرّف واجهة فريد وثابت لكل صف مرحلة — يُستخدم كمفتاح React عند إعادة الترتيب ولا يُحفظ في قاعدة البيانات
const makeUid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`

// صف المرحلة في الواجهة = بيانات المرحلة + مُعرّف واجهة ثابت
type MilestoneRow = Partial<ProjectMilestone> & { _uid: string }

const CONTRACT_PROMPT = `أنت مساعد متخصص في قراءة عقود المقاولات في البحرين. اقرأ هذا العقد بدقة تامة حتى لو كان ممسوحاً ضوئياً، أو صورة غير واضحة، أو مكتوباً بخط اليد. افهم محتواه واستخرج المعلومات.
أرجع JSON فقط بدون أي نص أو شرح إضافي، بهذا الشكل بالضبط:
{
  "project_name": "اسم أو وصف المشروع مثل: بناء فيلا في سترة",
  "client_name": "اسم العميل أو المالك",
  "client_phone": "رقم هاتف العميل",
  "client_cpr": "الرقم الشخصي للعميل (9 أرقام)",
  "location": "موقع المشروع",
  "contract_value": رقم قيمة العقد بالدينار بدون فواصل أو عملة,
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "building_permit": "رقم رخصة البناء إن وُجد",
  "consultant_name": "اسم الاستشاري أو المكتب الهندسي إن وُجد",
  "milestones": [ { "name": "اسم مرحلة الدفع", "amount": المبلغ بالدينار, "percentage": النسبة المئوية } ]
}
أي حقل غير موجود اتركه فارغاً "" أو 0. التواريخ بصيغة YYYY-MM-DD فقط. المبالغ أرقام فقط.`

export default function ProjectForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [customers, setCustomers] = useState<Customer[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ProjectFormState>({
    project_name: '', client_name: '', client_phone: '', client_cpr: '',
    location: '', contract_value: 0, status: 'active', notes: '',
    start_date: new Date().toISOString().slice(0, 10), client_id: null,
    estimated_cost: 0, handover_date: null, warranty_months: 12,
    soil_type: '', building_permit: '', consultant_name: '', consultant_phone: '',
  })
  const [milestones, setMilestones] = useState<MilestoneRow[]>(
    DEFAULT_MILESTONES.map((name, i) => ({ _uid: makeUid(), name, description: '', percentage: 0, amount: 0, status: 'pending', sort_order: i }))
  )
  const [deletedMilestoneIds, setDeletedMilestoneIds] = useState<string[]>([])

  // حالة السحب والإفلات لإعادة ترتيب المراحل
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // الذكاء الاصطناعي + المستندات
  const [contractScanning, setContractScanning] = useState(false)
  const contractRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<ProjectDoc[]>([])
  const [docType, setDocType] = useState('contract')
  const [docUploading, setDocUploading] = useState(false)
  const [viewerDoc, setViewerDoc] = useState<ProjectDoc | null>(null)

  // ─── التحميل ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('customers').select('*').order('name').then(({ data }) => setCustomers((data ?? []) as Customer[]))
    if (isEdit) {
      supabase.from('projects').select('*').eq('id', id).single().then(({ data }) => {
        if (data) setForm(data as ProjectFormState)
      })
      supabase.from('project_milestones').select('*').eq('project_id', id).order('sort_order').then(({ data }) => {
        if (data && data.length > 0) setMilestones((data as ProjectMilestone[]).map(m => ({ ...m, _uid: makeUid() })))
      })
      supabase.from('documents').select('*').eq('related_id', id).eq('related_type', 'project').order('created_at', { ascending: false }).then(({ data }) => {
        if (data) setDocs((data as ProjectDoc[]).map(d => ({ id: d.id, name: d.name, doc_type: d.doc_type, file_url: d.file_url, file_type: d.file_type, created_at: d.created_at })))
      })
    } else {
      supabase.from('projects').select('project_number').then(({ data }) => {
        const nums = (data ?? []).map((r: { project_number: string }) => r.project_number)
        setForm(prev => ({ ...prev, project_number: 'PRJ-' + nextSerial(nums.map(n => n?.replace('PRJ-', '') ?? ''), 1) }))
      })
    }
  }, [id, isEdit])

  const setField = <K extends keyof ProjectFormState>(field: K, val: ProjectFormState[K]) =>
    setForm(prev => ({ ...prev, [field]: val }))

  // ─── المراحل ─────────────────────────────────────────────────────────
  const updateMilestoneField = <K extends keyof ProjectMilestone>(idx: number, field: K, val: ProjectMilestone[K]) => {
    setMilestones(prev => { const u = [...prev]; u[idx] = { ...u[idx], [field]: val }; return u })
  }
  const addMilestone = () =>
    setMilestones(prev => [...prev, { _uid: makeUid(), name: '', description: '', percentage: 0, amount: 0, status: 'pending', sort_order: prev.length }])

  const removeMilestone = (idx: number) => {
    const target = milestones[idx]
    if (target?.id) setDeletedMilestoneIds(ids => [...ids, target.id as string])
    setMilestones(prev => prev.filter((_, i) => i !== idx))
  }

  // نقل مرحلة من موضع لآخر — تُستخدم من أزرار الأسهم ومن السحب والإفلات
  const moveMilestone = (from: number, to: number) => {
    setMilestones(prev => {
      if (from === to || to < 0 || to >= prev.length) return prev
      const updated = [...prev]
      const [moved] = updated.splice(from, 1)
      updated.splice(to, 0, moved)
      return updated
    })
  }

  // السحب والإفلات: يبدأ فقط من مقبض السحب حتى لا يتعارض مع الكتابة داخل الحقول
  const handleDragStart = (e: DragEvent<HTMLDivElement>, idx: number) => {
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) { e.preventDefault(); return }
    setDragIndex(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const handleDragOver = (e: DragEvent<HTMLDivElement>, idx: number) => {
    if (dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (idx !== dragOverIndex) setDragOverIndex(idx)
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== idx) moveMilestone(dragIndex, idx)
    setDragIndex(null)
    setDragOverIndex(null)
  }
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null) }

  const totalMilestoneAmount = useMemo(
    () => milestones.reduce((s, m) => s + Number(m.amount || 0), 0),
    [milestones]
  )

  // ─── قراءة العقد بالذكاء الاصطناعي ───────────────────────────────────
  const handleContractScan = async (file: File) => {
    if (!hasApiKey()) {
      toast.error('فعّل مفتاح الذكاء الاصطناعي من الإعدادات أولاً')
      return
    }
    setContractScanning(true)
    toast.loading('جاري قراءة العقد وفهم محتواه...', { id: 'contract' })
    try {
      const text = await readDocumentText(file, CONTRACT_PROMPT)
      const parsed = extractJSON<{
        project_name?: string; client_name?: string; client_phone?: string; client_cpr?: string
        location?: string; contract_value?: number; start_date?: string; end_date?: string
        building_permit?: string; consultant_name?: string
        milestones?: { name: string; amount: number; percentage: number }[]
      }>(text)

      if (!parsed) { toast.error('تعذّر فهم محتوى العقد', { id: 'contract' }); return }

      setForm(prev => ({
        ...prev,
        project_name: parsed.project_name || prev.project_name,
        client_name: parsed.client_name || prev.client_name,
        client_phone: parsed.client_phone || prev.client_phone,
        client_cpr: parsed.client_cpr || prev.client_cpr,
        location: parsed.location || prev.location,
        contract_value: parsed.contract_value || prev.contract_value,
        start_date: parsed.start_date || prev.start_date,
        end_date: parsed.end_date || prev.end_date,
        building_permit: parsed.building_permit || prev.building_permit,
        consultant_name: parsed.consultant_name || prev.consultant_name,
      }))

      if (parsed.milestones && parsed.milestones.length > 0) {
        setMilestones(parsed.milestones.map((m, i) => ({
          _uid: makeUid(), name: m.name, description: '', percentage: Number(m.percentage) || 0,
          amount: Number(m.amount) || 0, status: 'pending' as const, sort_order: i,
        })))
      }

      // تخزين العقد نفسه كمستند مرفق
      const dataUrl = file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)
      setDocs(prev => [{ name: file.name || 'العقد', doc_type: 'contract', file_url: dataUrl, file_type: file.type }, ...prev])

      toast.success('تم قراءة العقد وتعبئة الحقول تلقائياً', { id: 'contract' })
    } catch (e) {
      toast.error((e as Error)?.message ?? 'تعذّرت قراءة العقد', { id: 'contract' })
    } finally {
      setContractScanning(false)
    }
  }

  // ─── إضافة مستند ─────────────────────────────────────────────────────
  const handleAddDoc = async (file: File) => {
    setDocUploading(true)
    try {
      const sizeMB = file.size / (1024 * 1024)
      if (sizeMB > 8) { toast.error('حجم الملف كبير جداً (الحد 8 ميجا)'); setDocUploading(false); return }
      const dataUrl = file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)
      const newDoc: ProjectDoc = { name: file.name, doc_type: docType, file_url: dataUrl, file_type: file.type }

      if (isEdit && id) {
        const { data, error } = await supabase.from('documents').insert({
          name: newDoc.name, doc_type: newDoc.doc_type, file_url: newDoc.file_url,
          file_type: newDoc.file_type, related_id: id, related_type: 'project',
        }).select().single()
        if (error) throw error
        newDoc.id = (data as { id: string }).id
        toast.success('تم رفع المستند')
      } else {
        toast.success('سيُحفظ المستند مع المشروع')
      }
      setDocs(prev => [newDoc, ...prev])
    } catch {
      toast.error('تعذّر رفع المستند')
    } finally {
      setDocUploading(false)
    }
  }

  const handleDeleteDoc = async (doc: ProjectDoc, idx: number) => {
    if (doc.id) {
      await supabase.from('documents').delete().eq('id', doc.id)
    }
    setDocs(prev => prev.filter((_, i) => i !== idx))
    toast.success('تم حذف المستند')
  }

  // ─── الحفظ ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.project_name) { toast.error('يجب إدخال اسم المشروع'); return }
    setSaving(true)
    try {
      let projectId = id
      if (isEdit) {
        const { error } = await supabase.from('projects').update({ ...form, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('projects').insert({ ...form }).select().single()
        if (error) throw error
        projectId = (data as Project).id
      }

      // حفظ المراحل (تُرقَّم حسب ترتيبها الحالي مع تجريد مُعرّف الواجهة _uid قبل الإرسال لقاعدة البيانات)
      const toSave = milestones.map((row, i) => {
        const m: Partial<ProjectMilestone> & { _uid?: string } = { ...row }
        delete m._uid
        return { ...m, project_id: projectId, sort_order: i }
      })
      for (const m of toSave) {
        if (m.id) await supabase.from('project_milestones').update(m).eq('id', m.id)
        else await supabase.from('project_milestones').insert(m)
      }

      // حذف المراحل التي أُزيلت أثناء التعديل (منع بقاء مراحل يتيمة في قاعدة البيانات)
      if (deletedMilestoneIds.length > 0) {
        await supabase.from('project_milestones').delete().in('id', deletedMilestoneIds)
        setDeletedMilestoneIds([])
      }

      // حفظ المستندات الجديدة غير المحفوظة بعد (للمشروع الجديد أو المضافة قبل الحفظ)
      const newDocs = docs.filter(d => !d.id)
      if (newDocs.length > 0 && projectId) {
        await supabase.from('documents').insert(
          newDocs.map(d => ({
            name: d.name, doc_type: d.doc_type, file_url: d.file_url,
            file_type: d.file_type, related_id: projectId, related_type: 'project',
          }))
        )
      }

      toast.success(isEdit ? 'تم تحديث المشروع' : 'تم إنشاء المشروع')
      navigate(`/projects/${projectId}`)
    } catch (e: unknown) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'اختر العميل (اختياري)' },
      ...customers.map(c => ({ value: c.id, label: c.name })),
    ],
    [customers]
  )
  const onCustomerChange = (cid: string) => {
    const c = customers.find(x => x.id === cid)
    setForm(prev => ({ ...prev, client_id: cid || null, client_name: c?.name ?? prev.client_name, client_phone: c?.phone ?? prev.client_phone }))
  }

  const docIsImage = (d: ProjectDoc) => d.file_type?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(d.name)

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800">{isEdit ? 'تعديل المشروع' : 'مشروع جديد'}</h1>
      </div>

      <div className="space-y-6">
        {/* ═══ رفع العقد بالذكاء الاصطناعي ═══ */}
        <div className="rounded-xl border-2 border-dashed p-5" style={{ borderColor: '#c4925a55', background: '#fdf9f4' }}>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
              <FileCheck size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-slate-800 text-base flex items-center gap-2">
                قراءة العقد بالذكاء الاصطناعي
                <Sparkles size={15} style={{ color: '#c4925a' }} />
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-3">
                ارفع صورة أو ملف العقد (حتى لو ممسوح ضوئياً أو بخط اليد) — يقرأه الذكاء الاصطناعي ويملأ كل الحقول والمراحل تلقائياً
              </p>
              <input ref={contractRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleContractScan(f); e.target.value = '' }} />
              <button onClick={() => contractRef.current?.click()} disabled={contractScanning}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
                {contractScanning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {contractScanning ? 'جاري القراءة...' : 'رفع العقد وقراءته'}
              </button>
            </div>
          </div>
        </div>

        {/* ═══ بيانات المشروع ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4 text-base flex items-center gap-2">
            <Building2 size={17} style={{ color: '#c4925a' }} /> بيانات المشروع
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="رقم المشروع" value={form.project_number ?? ''} onChange={e => setField('project_number', e.target.value)} />
            <Input label="اسم المشروع *" value={form.project_name ?? ''} onChange={e => setField('project_name', e.target.value)} />
            <Input label="الموقع" value={form.location ?? ''} onChange={e => setField('location', e.target.value)} placeholder="سترة / بوقوة..." />
            <Input label="قيمة العقد (د.ب) *" type="number" value={String(form.contract_value ?? 0)} onChange={e => setField('contract_value', parseFloat(e.target.value) || 0)} />
            <Input label="التكلفة التقديرية (د.ب)" type="number" value={String(form.estimated_cost ?? 0)} onChange={e => setField('estimated_cost', parseFloat(e.target.value) || 0)} />
            <Select label="الحالة" value={form.status ?? 'active'} onChange={e => setField('status', e.target.value as Project['status'])} options={STATUS_OPTIONS} />
            <Input label="تاريخ البداية" type="date" value={form.start_date ?? ''} onChange={e => setField('start_date', e.target.value)} />
            <Input label="تاريخ الانتهاء المتوقع" type="date" value={form.end_date ?? ''} onChange={e => setField('end_date', e.target.value)} />
            <Input label="تاريخ التسليم الفعلي" type="date" value={form.handover_date ?? ''} onChange={e => setField('handover_date', e.target.value || null)} />
            <Input label="فترة الضمان (شهور)" type="number" value={String(form.warranty_months ?? 12)} onChange={e => setField('warranty_months', parseInt(e.target.value) || 0)} />
          </div>
        </div>

        {/* ═══ التفاصيل الفنية ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4 text-base flex items-center gap-2">
            <Layers size={17} style={{ color: '#c4925a' }} /> التفاصيل الفنية والرسمية
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="رقم رخصة البناء" value={form.building_permit ?? ''} onChange={e => setField('building_permit', e.target.value)} />
            <Input label="نوع التربة" value={form.soil_type ?? ''} onChange={e => setField('soil_type', e.target.value)} placeholder="رملية / صخرية..." />
            <Input label="اسم الاستشاري / المكتب الهندسي" value={form.consultant_name ?? ''} onChange={e => setField('consultant_name', e.target.value)} />
            <Input label="هاتف الاستشاري" value={form.consultant_phone ?? ''} onChange={e => setField('consultant_phone', e.target.value)} />
          </div>
        </div>

        {/* ═══ بيانات العميل ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4 text-base flex items-center gap-2">
            <User size={17} style={{ color: '#c4925a' }} /> بيانات العميل
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="اختر من قائمة العملاء" value={form.client_id ?? ''} onChange={e => onCustomerChange(e.target.value)} options={customerOptions} />
            <Input label="اسم العميل *" value={form.client_name ?? ''} onChange={e => setField('client_name', e.target.value)} />
            <Input label="رقم الهاتف" value={form.client_phone ?? ''} onChange={e => setField('client_phone', e.target.value)} />
            <Input label="رقم السجل المدني (CPR)" value={form.client_cpr ?? ''} onChange={e => setField('client_cpr', e.target.value)} />
          </div>
          {isEdit && form.client_id && (
            <button onClick={() => navigate(`/customers/${form.client_id}/statement`)}
              className="mt-3 text-sm text-amber-700 hover:text-amber-800 font-medium">
              ← عرض كشف حساب العميل
            </button>
          )}
        </div>

        {/* ═══ المستندات المرفقة ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 text-base flex items-center gap-2">
              <FolderOpen size={17} style={{ color: '#c4925a' }} /> المستندات المرفقة
              {docs.length > 0 && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{docs.length}</span>}
            </h2>
          </div>

          {/* أداة الرفع */}
          <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-slate-50 rounded-xl">
            <div className="flex-1 min-w-40">
              <label className="block text-xs font-medium text-slate-600 mb-1">نوع المستند</label>
              <select value={docType} onChange={e => setDocType(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <input ref={docRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAddDoc(f); e.target.value = '' }} />
            <Button icon={docUploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
              onClick={() => docRef.current?.click()} disabled={docUploading}>
              {docUploading ? 'جاري الرفع...' : 'إرفاق مستند'}
            </Button>
          </div>

          {/* قائمة المستندات */}
          {docs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FolderOpen size={36} className="mx-auto mb-2 text-slate-200" />
              <p className="text-sm">لا توجد مستندات مرفقة</p>
              <p className="text-xs mt-1">أرفق العقد، الرخصة، المخططات، فحص التربة...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {docs.map((doc, idx) => (
                <div key={doc.id ?? idx} className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:border-amber-300 transition-colors">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: docIsImage(doc) ? '#eff6ff' : '#fef2f2' }}>
                    {docIsImage(doc) ? <FileImage size={18} className="text-blue-500" /> : <FileText size={18} className="text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{doc.name}</div>
                    <div className="text-xs text-slate-400">{DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}{!doc.id && ' • غير محفوظ'}</div>
                  </div>
                  <button onClick={() => docIsImage(doc) ? setViewerDoc(doc) : openStoredFile(doc.file_url, doc.file_type)}
                    className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50" title="عرض">
                    <Eye size={16} />
                  </button>
                  <button onClick={() => handleDeleteDoc(doc, idx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="حذف">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ مراحل الدفع ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="font-semibold text-slate-700 text-base">مراحل الدفع</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                مجموع المراحل: <span className={totalMilestoneAmount > Number(form.contract_value || 0) + 0.01 ? 'text-red-600 font-bold' : 'text-amber-700 font-bold'}>
                  {formatCurrency(totalMilestoneAmount)}
                </span>
              </span>
              <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addMilestone}>إضافة مرحلة</Button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">
            اسحب المرحلة من المقبض ⠿ أو استخدم السهمين ↑↓ لإعادة ترتيب المراحل حسب تسلسل التنفيذ. يُحفظ الترتيب الجديد عند حفظ المشروع.
          </p>
          <div className="space-y-3">
            {milestones.map((m, idx) => {
              const isDragging = dragIndex === idx
              const isDragOver = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx
              return (
                <div
                  key={m._uid}
                  draggable
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={e => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                    isDragging
                      ? 'opacity-40 border-amber-300'
                      : isDragOver
                        ? 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-200'
                        : 'bg-slate-50 border-transparent'
                  }`}
                >
                  {/* مقبض السحب + رقم المرحلة */}
                  <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                    <span
                      data-drag-handle
                      title="اسحب لإعادة الترتيب"
                      className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"
                    >
                      <GripVertical size={16} />
                    </span>
                    <span className="w-6 h-6 bg-amber-100 text-amber-700 text-xs font-bold rounded-full flex items-center justify-center">{idx + 1}</span>
                  </div>

                  {/* حقول المرحلة */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="اسم المرحلة *" value={m.name ?? ''} onChange={e => updateMilestoneField(idx, 'name', e.target.value)} />
                    <Input label="المبلغ (د.ب)" type="number" value={String(m.amount ?? 0)} onChange={e => updateMilestoneField(idx, 'amount', parseFloat(e.target.value) || 0)} />
                    <Select label="الحالة" value={m.status ?? 'pending'}
                      onChange={e => updateMilestoneField(idx, 'status', e.target.value as ProjectMilestone['status'])}
                      options={[
                        { value: 'pending', label: 'معلق' },
                        { value: 'in_progress', label: 'جارٍ' },
                        { value: 'completed', label: 'مكتمل' },
                        { value: 'invoiced', label: 'مفوتر' },
                        { value: 'paid', label: 'مدفوع' },
                      ]} />
                  </div>

                  {/* أزرار التحكم: تحريك لأعلى / لأسفل / حذف */}
                  <div className="flex flex-col items-center gap-0.5 pt-1 shrink-0">
                    <button type="button" onClick={() => moveMilestone(idx, idx - 1)} disabled={idx === 0}
                      title="تحريك لأعلى"
                      className="p-1 text-slate-400 rounded hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400">
                      <ChevronUp size={16} />
                    </button>
                    <button type="button" onClick={() => moveMilestone(idx, idx + 1)} disabled={idx === milestones.length - 1}
                      title="تحريك لأسفل"
                      className="p-1 text-slate-400 rounded hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400">
                      <ChevronDown size={16} />
                    </button>
                    <button type="button" onClick={() => removeMilestone(idx)}
                      title="حذف المرحلة"
                      className="p-1 text-red-400 rounded hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <Textarea label="ملاحظات" value={form.notes ?? ''} onChange={e => setField('notes', e.target.value)} rows={3} />

        <div className="flex gap-3 pb-6">
          <Button loading={saving} onClick={handleSave}>{isEdit ? 'حفظ التعديلات' : 'إنشاء المشروع'}</Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>إلغاء</Button>
        </div>
      </div>

      {/* ═══ عارض الصور ═══ */}
      {viewerDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setViewerDoc(null)}>
          <button className="absolute top-4 left-4 text-white/80 hover:text-white p-2" onClick={() => setViewerDoc(null)}>
            <X size={24} />
          </button>
          <div className="max-w-3xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <img src={viewerDoc.file_url} alt={viewerDoc.name} className="rounded-lg max-w-full" />
            <div className="text-center text-white/80 text-sm mt-3">{viewerDoc.name}</div>
          </div>
        </div>
      )}
    </div>
  )
}
