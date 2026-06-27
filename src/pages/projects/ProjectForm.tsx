import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Upload, FileCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectMilestone, Customer, ExtractedDocumentData } from '../../types'
import { nextSerial } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import DocumentUpload from '../../components/ui/DocumentUpload'
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

export default function ProjectForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [customers, setCustomers] = useState<Customer[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<Project>>({
    project_name: '', client_name: '', client_phone: '', client_cpr: '',
    location: '', contract_value: 0, status: 'active', notes: '',
    start_date: new Date().toISOString().slice(0, 10), client_id: null,
  })
  const [milestones, setMilestones] = useState<Partial<ProjectMilestone>[]>(
    DEFAULT_MILESTONES.map((name, i) => ({ name, description: '', percentage: 0, amount: 0, status: 'pending', sort_order: i }))
  )
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    supabase.from('customers').select('*').order('name').then(({ data }) => setCustomers((data ?? []) as Customer[]))
    if (isEdit) {
      supabase.from('projects').select('*').eq('id', id).single().then(({ data }) => {
        if (data) setForm(data as Project)
      })
      supabase.from('project_milestones').select('*').eq('project_id', id).order('sort_order').then(({ data }) => {
        if (data && data.length > 0) setMilestones(data as ProjectMilestone[])
      })
    } else {
      // Auto project number
      supabase.from('projects').select('project_number').then(({ data }) => {
        const nums = (data ?? []).map((r: { project_number: string }) => r.project_number)
        setForm(prev => ({ ...prev, project_number: 'PRJ-' + nextSerial(nums.map(n => n?.replace('PRJ-', '') ?? ''), 1) }))
      })
    }
  }, [id, isEdit])

  const updateMilestoneAmount = (idx: number, val: number) => {
    setMilestones(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], amount: val }
      return updated
    })
  }

  const updateMilestoneField = <K extends keyof ProjectMilestone>(idx: number, field: K, val: ProjectMilestone[K]) => {
    setMilestones(prev => { const u = [...prev]; u[idx] = { ...u[idx], [field]: val }; return u })
  }

  const addMilestone = () => {
    setMilestones(prev => [...prev, { name: '', description: '', percentage: 0, amount: 0, status: 'pending', sort_order: prev.length }])
  }

  const removeMilestone = (idx: number) => {
    setMilestones(prev => prev.filter((_, i) => i !== idx))
  }

  const totalMilestoneAmount = milestones.reduce((s, m) => s + Number(m.amount || 0), 0)

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
      // Upsert milestones
      const toSave = milestones.map((m, i) => ({ ...m, project_id: projectId, sort_order: i }))
      for (const m of toSave) {
        if (m.id) {
          await supabase.from('project_milestones').update(m).eq('id', m.id)
        } else {
          await supabase.from('project_milestones').insert(m)
        }
      }
      toast.success(isEdit ? 'تم تحديث المشروع' : 'تم إنشاء المشروع')
      navigate(`/projects/${projectId}`)
    } catch (e: unknown) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  const customerOptions = [
    { value: '', label: 'اختر العميل (اختياري)' },
    ...customers.map(c => ({ value: c.id, label: c.name }))
  ]

  const onCustomerChange = (cid: string) => {
    const c = customers.find(x => x.id === cid)
    setForm(prev => ({ ...prev, client_id: cid || null, client_name: c?.name ?? prev.client_name, client_phone: c?.phone ?? prev.client_phone }))
  }

  const handleContractExtracted = (data: ExtractedDocumentData) => {
    const updates: Partial<Project> = {}
    if (data.project_name) updates.project_name = data.project_name
    if (data.contract_value) updates.contract_value = data.contract_value
    if (data.start_date) updates.start_date = data.start_date
    if (data.end_date) updates.end_date = data.end_date
    if (data.location) updates.location = data.location
    if (data.client_name) updates.client_name = data.client_name
    if (data.client_phone || data.phone) updates.client_phone = data.client_phone ?? data.phone
    if (data.client_cpr) updates.client_cpr = data.client_cpr
    if (data.notes) updates.notes = data.notes

    setForm(prev => ({ ...prev, ...updates }))

    if (data.milestones && data.milestones.length > 0) {
      setMilestones(data.milestones.map((m, i) => ({
        name: m.name,
        description: '',
        percentage: m.percentage,
        amount: m.amount,
        status: 'pending' as const,
        sort_order: i,
      })))
    }

    setShowUpload(false)
    toast.success('تم استخراج بيانات العقد وتعبئة الحقول تلقائياً')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800">{isEdit ? 'تعديل المشروع' : 'مشروع جديد'}</h1>
      </div>

      <div className="space-y-6">
        {/* Contract Upload */}
        {!isEdit && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileCheck size={18} className="text-amber-600" />
                <h2 className="font-semibold text-slate-700 text-base">إرفاق العقد — تعبئة تلقائية</h2>
              </div>
              <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => setShowUpload(!showUpload)}>
                {showUpload ? 'إخفاء' : 'رفع العقد'}
              </Button>
            </div>
            {showUpload && (
              <div className="mt-3">
                <p className="text-xs text-slate-500 mb-3">ارفع نسخة من العقد (PDF أو صورة) وسيتم قراءة المعلومات مثل اسم المشروع، قيمة العقد، التواريخ، ومراحل الدفع تلقائياً</p>
                <DocumentUpload
                  onExtracted={(data) => handleContractExtracted(data)}
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                />
              </div>
            )}
          </div>
        )}

        {/* Project Info */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4 text-base">بيانات المشروع</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="رقم المشروع" value={form.project_number ?? ''} onChange={e => setForm(p => ({ ...p, project_number: e.target.value }))} />
            <Input label="اسم المشروع *" value={form.project_name ?? ''} onChange={e => setForm(p => ({ ...p, project_name: e.target.value }))} />
            <Input label="الموقع" value={form.location ?? ''} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
            <Input label="قيمة العقد (د.ب) *" type="number" value={String(form.contract_value ?? 0)} onChange={e => setForm(p => ({ ...p, contract_value: parseFloat(e.target.value) || 0 }))} />
            <Input label="تاريخ البداية" type="date" value={form.start_date ?? ''} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
            <Input label="تاريخ الانتهاء المتوقع" type="date" value={form.end_date ?? ''} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
            <Select label="الحالة" value={form.status ?? 'active'} onChange={e => setForm(p => ({ ...p, status: e.target.value as Project['status'] }))} options={STATUS_OPTIONS} />
          </div>
        </div>

        {/* Client Info */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4 text-base">بيانات العميل</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="اختر من قائمة العملاء" value={form.client_id ?? ''} onChange={e => onCustomerChange(e.target.value)} options={customerOptions} />
            <Input label="اسم العميل *" value={form.client_name ?? ''} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} />
            <Input label="رقم الهاتف" value={form.client_phone ?? ''} onChange={e => setForm(p => ({ ...p, client_phone: e.target.value }))} />
            <Input label="رقم السجل المدني (CPR)" value={form.client_cpr ?? ''} onChange={e => setForm(p => ({ ...p, client_cpr: e.target.value }))} />
          </div>
        </div>

        {/* Milestones */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 text-base">مراحل الدفع</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                مجموع المراحل: <span className={totalMilestoneAmount > Number(form.contract_value || 0) + 0.01 ? 'text-red-600 font-bold' : 'text-amber-700 font-bold'}>
                  {totalMilestoneAmount.toFixed(3)} د.ب
                </span>
              </span>
              <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addMilestone}>إضافة مرحلة</Button>
            </div>
          </div>
          <div className="space-y-3">
            {milestones.map((m, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <span className="w-6 h-6 bg-amber-100 text-amber-700 text-xs font-bold rounded-full flex items-center justify-center mt-1 shrink-0">{idx + 1}</span>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input label="اسم المرحلة *" value={m.name ?? ''} onChange={e => updateMilestoneField(idx, 'name', e.target.value)} />
                  <Input label="المبلغ (د.ب)" type="number" value={String(m.amount ?? 0)} onChange={e => updateMilestoneAmount(idx, parseFloat(e.target.value) || 0)} />
                  <Select
                    label="الحالة"
                    value={m.status ?? 'pending'}
                    onChange={e => updateMilestoneField(idx, 'status', e.target.value as ProjectMilestone['status'])}
                    options={[
                      { value: 'pending', label: 'معلق' },
                      { value: 'in_progress', label: 'جارٍ' },
                      { value: 'completed', label: 'مكتمل' },
                      { value: 'invoiced', label: 'مفوتر' },
                      { value: 'paid', label: 'مدفوع' },
                    ]}
                  />
                </div>
                <button onClick={() => removeMilestone(idx)} className="p-1.5 text-red-400 hover:text-red-600 rounded mt-1">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Textarea label="ملاحظات" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />

        <div className="flex gap-3">
          <Button loading={saving} onClick={handleSave}>{isEdit ? 'حفظ التعديلات' : 'إنشاء المشروع'}</Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>إلغاء</Button>
        </div>
      </div>
    </div>
  )
}
