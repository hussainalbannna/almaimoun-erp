import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Sparkles, Loader2, Award, CalendarDays } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Worker, WorkerAdvance } from '../../types'
import { formatDate, formatCurrency, calcEndOfService, calcAccruedLeave } from '../../lib/utils'
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
  const [scanning, setScanning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Partial<Worker>>({
    name: '', name_en: '', cpr: '', nationality: 'بحريني', profession: '',
    phone: '', iban: '', worker_type: 'company', pay_type: 'monthly',
    branch: '', basic_salary: 0, social_allowance: 0, actual_salary: 0,
    daily_rate: 0, status: 'active', notes: '',
    passport_number: '', emergency_name: '', emergency_phone: '', emergency_relation: '',
    annual_leave_days: 30, used_leave_days: 0,
    join_date: new Date().toISOString().slice(0, 10),
    visa_expiry: null, cpr_expiry: null, passport_expiry: null,
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

  // ───── قراءة الهوية/الجواز بالذكاء الاصطناعي ─────
  const handleScanDocument = async (file: File) => {
    setScanning(true)
    toast.loading('جاري قراءة المستند...', { id: 'scan' })
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })
      const mediaType = file.type || 'image/jpeg'

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: `اقرأ بطاقة الهوية البحرينية أو جواز السفر هذا بدقة، حتى لو كان ممسوحاً ضوئياً أو الصورة غير واضحة. أرجع JSON فقط بدون أي نص آخر بهذا الشكل:
{"name":"الاسم بالعربي","name_en":"name in english","cpr":"الرقم الشخصي 9 أرقام","nationality":"الجنسية","cpr_expiry":"YYYY-MM-DD","passport_number":"رقم الجواز","passport_expiry":"YYYY-MM-DD"}
إذا لم تجد حقلاً اتركه فارغاً "". التواريخ بصيغة YYYY-MM-DD فقط.` }
            ]
          }]
        })
      })
      const data = await response.json()
      const text = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('')
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      setForm(p => ({
        ...p,
        name: parsed.name || p.name,
        name_en: parsed.name_en || p.name_en,
        cpr: parsed.cpr || p.cpr,
        nationality: parsed.nationality || p.nationality,
        cpr_expiry: parsed.cpr_expiry || p.cpr_expiry,
        passport_number: parsed.passport_number || p.passport_number,
        passport_expiry: parsed.passport_expiry || p.passport_expiry,
      }))
      toast.success('تم استخراج البيانات بنجاح', { id: 'scan' })
    } catch {
      toast.error('تعذّرت القراءة. تأكد من تفعيل مفتاح الذكاء الاصطناعي', { id: 'scan' })
    } finally {
      setScanning(false)
    }
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('يجب إدخال الاسم'); return }
    setSaving(true)
    try {
      const payload = { ...form }
      // حساب مكافأة نهاية الخدمة تلقائياً
      if (form.basic_salary && form.join_date) {
        payload.end_of_service_date = null
      }
      if (isEdit) {
        const { error } = await supabase.from('workers').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('workers').insert({ ...payload })
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

  // حسابات ذكية
  const eos = calcEndOfService(Number(form.basic_salary) || 0, form.join_date ?? '')
  const accruedLeave = calcAccruedLeave(Number(form.annual_leave_days) || 30, form.join_date ?? '')
  const remainingLeave = accruedLeave - (Number(form.used_leave_days) || 0)

  return (
    <div className="p-6 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-slate-800">{isEdit ? 'تعديل بيانات العامل' : 'إضافة عامل جديد'}</h1>
        </div>
        {/* زر القراءة الذكية */}
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScanDocument(f) }} />
          <button onClick={() => fileRef.current?.click()} disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            قراءة الهوية / الجواز
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* البيانات الشخصية */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">البيانات الشخصية</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="الاسم بالعربي *" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <Input label="الاسم بالإنجليزي" value={form.name_en ?? ''} onChange={e => setForm(p => ({ ...p, name_en: e.target.value }))} />
            <Input label="رقم السجل المدني (CPR)" value={form.cpr ?? ''} onChange={e => setForm(p => ({ ...p, cpr: e.target.value }))} />
            <Input label="الجنسية" value={form.nationality ?? ''} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))} />
            <Input label="المهنة / الوظيفة" value={form.profession ?? ''} onChange={e => setForm(p => ({ ...p, profession: e.target.value }))} />
            <Input label="رقم الهاتف" value={form.phone ?? ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            <Input label="رقم الجواز" value={form.passport_number ?? ''} onChange={e => setForm(p => ({ ...p, passport_number: e.target.value }))} />
            <Input label="تاريخ انتهاء الجواز" type="date" value={form.passport_expiry ?? ''} onChange={e => setForm(p => ({ ...p, passport_expiry: e.target.value || null }))} />
            <Input label="تاريخ الانضمام" type="date" value={form.join_date ?? ''} onChange={e => setForm(p => ({ ...p, join_date: e.target.value }))} />
            <Input label="تاريخ انتهاء التأشيرة / الإقامة" type="date" value={form.visa_expiry ?? ''} onChange={e => setForm(p => ({ ...p, visa_expiry: e.target.value || null }))} />
            <Input label="تاريخ انتهاء البطاقة الذكية CPR" type="date" value={form.cpr_expiry ?? ''} onChange={e => setForm(p => ({ ...p, cpr_expiry: e.target.value || null }))} />
          </div>
        </div>

        {/* جهة الطوارئ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">جهة الاتصال في الطوارئ</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="الاسم" value={form.emergency_name ?? ''} onChange={e => setForm(p => ({ ...p, emergency_name: e.target.value }))} />
            <Input label="رقم الهاتف" value={form.emergency_phone ?? ''} onChange={e => setForm(p => ({ ...p, emergency_phone: e.target.value }))} />
            <Input label="صلة القرابة" value={form.emergency_relation ?? ''} onChange={e => setForm(p => ({ ...p, emergency_relation: e.target.value }))} placeholder="أخ / زوجة / صديق" />
          </div>
        </div>

        {/* التصنيف */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">التصنيف</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="نوع العمالة *" value={form.worker_type ?? 'company'}
              onChange={e => setForm(p => ({ ...p, worker_type: e.target.value as Worker['worker_type'], branch: e.target.value === 'lmra' ? '' : p.branch }))}
              options={[{ value: 'company', label: 'عمالة الشركة' }, { value: 'lmra', label: 'عمالة هيئة LMRA' }]} />
            <Select label="طريقة الدفع" value={form.pay_type ?? 'monthly'}
              onChange={e => setForm(p => ({ ...p, pay_type: e.target.value as Worker['pay_type'] }))}
              options={[{ value: 'monthly', label: 'شهري' }, { value: 'daily', label: 'يومي' }]} />
            {form.worker_type === 'company' && (
              <Select label="الفرع *" value={form.branch ?? ''} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} options={BRANCH_OPTIONS} />
            )}
            <Select label="الحالة" value={form.status ?? 'active'}
              onChange={e => setForm(p => ({ ...p, status: e.target.value as Worker['status'] }))}
              options={[{ value: 'active', label: 'نشط' }, { value: 'inactive', label: 'غير نشط' }]} />
          </div>
        </div>

        {/* الراتب */}
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

        {/* الإجازات ونهاية الخدمة (تُحسب تلقائياً) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">الإجازات ونهاية الخدمة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="رصيد الإجازة السنوية (أيام)" type="number" value={String(form.annual_leave_days ?? 30)} onChange={e => setForm(p => ({ ...p, annual_leave_days: parseInt(e.target.value) || 0 }))} />
            <Input label="الأيام المستخدمة" type="number" value={String(form.used_leave_days ?? 0)} onChange={e => setForm(p => ({ ...p, used_leave_days: parseFloat(e.target.value) || 0 }))} />
          </div>
          {/* بطاقات الحساب التلقائي */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
              <CalendarDays size={20} className="text-blue-600" />
              <div>
                <div className="text-xs text-blue-700">الإجازة المتبقية</div>
                <div className="font-bold text-blue-900">{remainingLeave.toFixed(1)} يوم</div>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
              <CalendarDays size={20} className="text-amber-600" />
              <div>
                <div className="text-xs text-amber-700">المستحقة حتى الآن</div>
                <div className="font-bold text-amber-900">{accruedLeave.toFixed(1)} يوم</div>
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
              <Award size={20} className="text-green-600" />
              <div>
                <div className="text-xs text-green-700">مكافأة نهاية الخدمة</div>
                <div className="font-bold text-green-900">{formatCurrency(eos)}</div>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">* تُحسب تلقائياً حسب قانون عمل البحرين بناءً على تاريخ الانضمام والراتب الأساسي</p>
        </div>

        <Textarea label="ملاحظات" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />

        {/* السلف */}
        {isEdit && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-700">السلف المقدمة</h2>
              <span className="text-sm text-red-600 font-medium">رصيد السلف: {formatCurrency(totalAdvances)}</span>
            </div>
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
                      <span className="font-medium text-sm">{formatCurrency(Number(adv.amount))}</span>
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