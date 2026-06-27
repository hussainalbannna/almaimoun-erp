import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Worker, WorkerAdvance } from '../../types'
import { formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

const BRANCH_OPTIONS = [
  { value: '', label: 'اختر الفرع' },
  { value: '2', label: 'الفرع 2' },
  { value: '3', label: 'الفرع 3' },
  { value: '5', label: 'الفرع 5' },
]

export default function WorkerForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const [saving, setSaving] = useState(false)
  const [advances, setAdvances] = useState<WorkerAdvance[]>([])
  const [newAdvance, setNewAdvance] = useState({ amount: 0, notes: '', advance_date: new Date().toISOString().slice(0, 10) })
  const [addingAdvance, setAddingAdvance] = useState(false)

  const [form, setForm] = useState<Partial<Worker>>({
    name: '', name_en: '', cpr: '', nationality: 'بحريني', profession: '',
    phone: '', iban: '', worker_type: 'company', pay_type: 'monthly',
    branch: '', basic_salary: 0, social_allowance: 0, actual_salary: 0,
    daily_rate: 0, status: 'active', notes: '',
    join_date: new Date().toISOString().slice(0, 10),
    visa_expiry: null,
    cpr_expiry: null,
  })

  useEffect(() => {
    if (isEdit) {
      supabase.from('workers').select('*').eq('id', id).single().then(({ data }) => {
        if (data) setForm(data as Worker)
      })
      supabase.from('worker_advances').select('*').eq('worker_id', id).order('advance_date', { ascending: false }).then(({ data }) => {
        setAdvances((data ?? []) as WorkerAdvance[])
      })
    }
  }, [id, isEdit])

  const handleSave = async () => {
    if (!form.name) { toast.error('يجب إدخال الاسم'); return }
    setSaving(true)
    try {
      if (isEdit) {
        const { error } = await supabase.from('workers').update({ ...form, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('workers').insert({ ...form })
        if (error) throw error
      }
      toast.success(isEdit ? 'تم تحديث بيانات العامل' : 'تم إضافة العامل')
      navigate('/workers')
    } catch (e: unknown) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  const handleAddAdvance = async () => {
    if (!newAdvance.amount || Number(newAdvance.amount) <= 0) { toast.error('يجب إدخال المبلغ'); return }
    setAddingAdvance(true)
    const { data, error } = await supabase.from('worker_advances').insert({ ...newAdvance, worker_id: id }).select().single()
    if (error) { toast.error('حدث خطأ'); setAddingAdvance(false); return }
    setAdvances(prev => [data as WorkerAdvance, ...prev])
    setNewAdvance({ amount: 0, notes: '', advance_date: new Date().toISOString().slice(0, 10) })
    toast.success('تم تسجيل السلفة')
    setAddingAdvance(false)
  }

  const toggleDeducted = async (adv: WorkerAdvance) => {
    await supabase.from('worker_advances').update({ deducted: !adv.deducted }).eq('id', adv.id)
    setAdvances(prev => prev.map(a => a.id === adv.id ? { ...a, deducted: !a.deducted } : a))
  }

  const totalAdvances = advances.filter(a => !a.deducted).reduce((s, a) => s + Number(a.amount), 0)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800">{isEdit ? 'تعديل بيانات العامل' : 'إضافة عامل جديد'}</h1>
      </div>

      <div className="space-y-5">
        {/* Personal Info */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">البيانات الشخصية</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="الاسم بالعربي *" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <Input label="الاسم بالإنجليزي" value={form.name_en ?? ''} onChange={e => setForm(p => ({ ...p, name_en: e.target.value }))} />
            <Input label="رقم السجل المدني (CPR)" value={form.cpr ?? ''} onChange={e => setForm(p => ({ ...p, cpr: e.target.value }))} />
            <Input label="الجنسية" value={form.nationality ?? ''} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))} />
            <Input label="المهنة / الوظيفة" value={form.profession ?? ''} onChange={e => setForm(p => ({ ...p, profession: e.target.value }))} />
            <Input label="رقم الهاتف" value={form.phone ?? ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            <Input label="تاريخ الانضمام" type="date" value={form.join_date ?? ''} onChange={e => setForm(p => ({ ...p, join_date: e.target.value }))} />
            <Input label="تاريخ انتهاء التأشيرة / الإقامة" type="date" value={form.visa_expiry ?? ''} onChange={e => setForm(p => ({ ...p, visa_expiry: e.target.value || null }))} />
            <Input label="تاريخ انتهاء البطاقة الذكية CPR" type="date" value={form.cpr_expiry ?? ''} onChange={e => setForm(p => ({ ...p, cpr_expiry: e.target.value || null }))} />
          </div>
        </div>

        {/* Classification */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">التصنيف</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="نوع العمالة *"
              value={form.worker_type ?? 'company'}
              onChange={e => setForm(p => ({ ...p, worker_type: e.target.value as Worker['worker_type'], branch: e.target.value === 'lmra' ? '' : p.branch }))}
              options={[
                { value: 'company', label: 'عمالة الشركة' },
                { value: 'lmra', label: 'عمالة هيئة LMRA' },
              ]}
            />
            <Select
              label="طريقة الدفع"
              value={form.pay_type ?? 'monthly'}
              onChange={e => setForm(p => ({ ...p, pay_type: e.target.value as Worker['pay_type'] }))}
              options={[
                { value: 'monthly', label: 'شهري' },
                { value: 'daily', label: 'يومي' },
              ]}
            />
            {form.worker_type === 'company' && (
              <Select label="الفرع *" value={form.branch ?? ''} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} options={BRANCH_OPTIONS} />
            )}
            <Select
              label="الحالة"
              value={form.status ?? 'active'}
              onChange={e => setForm(p => ({ ...p, status: e.target.value as Worker['status'] }))}
              options={[{ value: 'active', label: 'نشط' }, { value: 'inactive', label: 'غير نشط' }]}
            />
          </div>
        </div>

        {/* Salary */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">بيانات الراتب</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {form.pay_type === 'monthly' ? (
              <>
                <Input label="الراتب الأساسي (WPS) (د.ب)" type="number" value={String(form.basic_salary ?? 0)} onChange={e => setForm(p => ({ ...p, basic_salary: parseFloat(e.target.value) || 0 }))} />
                <Input label="بدل اجتماعي (د.ب)" type="number" value={String(form.social_allowance ?? 0)} onChange={e => setForm(p => ({ ...p, social_allowance: parseFloat(e.target.value) || 0 }))} />
                <Input label="الراتب الفعلي (خارج WPS) (د.ب)" type="number" value={String(form.actual_salary ?? 0)} onChange={e => setForm(p => ({ ...p, actual_salary: parseFloat(e.target.value) || 0 }))} />
              </>
            ) : (
              <Input label="الأجر اليومي (د.ب)" type="number" value={String(form.daily_rate ?? 0)} onChange={e => setForm(p => ({ ...p, daily_rate: parseFloat(e.target.value) || 0 }))} />
            )}
            <Input label="رقم IBAN" value={form.iban ?? ''} onChange={e => setForm(p => ({ ...p, iban: e.target.value }))} />
          </div>
        </div>

        <Textarea label="ملاحظات" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />

        {/* Advances (only on edit) */}
        {isEdit && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-700">السلف المقدمة</h2>
              <span className="text-sm text-red-600 font-medium">
                رصيد السلف: {totalAdvances.toFixed(3)} د.ب
              </span>
            </div>
            {/* Add advance */}
            <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
              <Input label="المبلغ (د.ب)" type="number" value={String(newAdvance.amount)} onChange={e => setNewAdvance(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} />
              <Input label="التاريخ" type="date" value={newAdvance.advance_date} onChange={e => setNewAdvance(p => ({ ...p, advance_date: e.target.value }))} />
              <div className="flex items-end">
                <Button size="sm" icon={<Plus size={14} />} loading={addingAdvance} onClick={handleAddAdvance}>إضافة سلفة</Button>
              </div>
            </div>
            {advances.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-4">لا توجد سلف مسجلة</div>
            ) : (
              <div className="space-y-2">
                {advances.map(adv => (
                  <div key={adv.id} className={`flex items-center justify-between p-3 rounded-lg border ${adv.deducted ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div>
                      <span className="font-medium text-sm">{Number(adv.amount).toFixed(3)} د.ب</span>
                      <span className="text-slate-500 text-xs mr-2">{formatDate(adv.advance_date)}</span>
                      {adv.notes && <span className="text-slate-500 text-xs"> — {adv.notes}</span>}
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={adv.deducted} onChange={() => toggleDeducted(adv)} className="rounded" />
                      {adv.deducted ? 'تم الخصم' : 'لم يُخصم بعد'}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button loading={saving} onClick={handleSave}>{isEdit ? 'حفظ التعديلات' : 'إضافة العامل'}</Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>إلغاء</Button>
        </div>
      </div>
    </div>
  )
}
