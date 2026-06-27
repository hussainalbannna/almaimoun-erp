import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { VariationOrder, Project } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

export default function VOForm() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<VariationOrder>>({
    description: '', amount: 0, billable: true, status: 'pending',
    request_date: new Date().toISOString().slice(0, 10), notes: '',
  })

  useEffect(() => {
    if (projectId) {
      supabase.from('projects').select('*').eq('id', projectId).single().then(({ data }) => setProject(data as Project))
      supabase.from('variation_orders').select('vo_number').eq('project_id', projectId).then(({ data }) => {
        const count = (data ?? []).length + 1
        setForm(prev => ({ ...prev, vo_number: `VO-${String(count).padStart(3, '0')}` }))
      })
    }
  }, [projectId])

  const handleSave = async () => {
    if (!form.description) { toast.error('يجب إدخال الوصف'); return }
    setSaving(true)
    const { error } = await supabase.from('variation_orders').insert({ ...form, project_id: projectId })
    if (error) { toast.error('حدث خطأ'); setSaving(false); return }
    toast.success('تم إضافة أمر التغيير')
    navigate(`/projects/${projectId}`)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">إضافة أمر تغيير</h1>
          {project && <p className="text-slate-500 text-sm">{project.project_name}</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="رقم VO" value={form.vo_number ?? ''} onChange={e => setForm(p => ({ ...p, vo_number: e.target.value }))} />
          <Input label="تاريخ الطلب" type="date" value={form.request_date ?? ''} onChange={e => setForm(p => ({ ...p, request_date: e.target.value }))} />
        </div>
        <Textarea label="وصف التغيير *" value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
              <input
                type="checkbox"
                checked={form.billable}
                onChange={e => setForm(p => ({ ...p, billable: e.target.checked, amount: e.target.checked ? p.amount : 0 }))}
                className="rounded"
              />
              قابل للفوترة (له تكلفة)
            </label>
            {form.billable && (
              <Input label="المبلغ (د.ب)" type="number" value={String(form.amount ?? 0)} onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} />
            )}
          </div>
          <Select
            label="الحالة"
            value={form.status ?? 'pending'}
            onChange={e => setForm(p => ({ ...p, status: e.target.value as VariationOrder['status'] }))}
            options={[
              { value: 'pending', label: 'معلق' },
              { value: 'approved', label: 'معتمد' },
              { value: 'rejected', label: 'مرفوض' },
            ]}
          />
        </div>
        <Textarea label="ملاحظات" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
      </div>

      <div className="flex gap-3 mt-4">
        <Button loading={saving} onClick={handleSave}>حفظ أمر التغيير</Button>
        <Button variant="secondary" onClick={() => navigate(-1)}>إلغاء</Button>
      </div>
    </div>
  )
}
