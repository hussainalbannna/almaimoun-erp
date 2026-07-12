import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Sparkles, Loader2, Award, CalendarDays } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Worker } from '../../types'
import { formatCurrency, calcEndOfService, calcAccruedLeave } from '../../lib/utils'
import { readDocumentText, extractJSON, hasApiKey } from '../../lib/ai'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

const BRANCH_OPTIONS = [
  { value: '', label: 'اختر الفرع' },
  { value: '2', label: 'الفرع 2' },
  { value: '4', label: 'الفرع 4' },
  { value: '5', label: 'الفرع 5' },
]

const ID_PROMPT = `أنت مساعد متخصص في قراءة بطاقات الهوية البحرينية (CPR) وجوازات السفر. اقرأ هذا المستند بدقة تامة حتى لو كان ممسوحاً ضوئياً أو صورة غير واضحة. افهم محتواه واستخرج البيانات.
أرجع JSON فقط بدون أي نص أو شرح إضافي، بهذا الشكل بالضبط:
{
  "name": "الاسم بالعربي",
  "name_en": "name in english",
  "cpr": "الرقم الشخصي (9 أرقام)",
  "nationality": "الجنسية",
  "cpr_expiry": "YYYY-MM-DD",
  "passport_number": "رقم الجواز إن وُجد",
  "passport_expiry": "YYYY-MM-DD"
}
أي حقل غير موجود اتركه فارغاً "". التواريخ بصيغة YYYY-MM-DD فقط.`

export default function WorkerForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id
  const [saving, setSaving] = useState(false)
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
    }
  }, [id, isEdit])

  // ───── قراءة الهوية/الجواز بالذكاء الاصطناعي ─────
  const handleScanDocument = async (file: File) => {
    if (!hasApiKey()) {
      toast.error('فعّل مفتاح الذكاء الاصطناعي من الإعدادات أولاً')
      return
    }
    setScanning(true)
    toast.loading('جاري قراءة المستند...', { id: 'scan' })
    try {
      const text = await readDocumentText(file, ID_PROMPT)
      const parsed = extractJSON<{
        name?: string; name_en?: string; cpr?: string; nationality?: string
        cpr_expiry?: string; passport_number?: string; passport_expiry?: string
      }>(text)
      if (!parsed) { toast.error('تعذّر فهم المستند', { id: 'scan' }); return }

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
    } catch (e) {
      toast.error((e as Error)?.message ?? 'تعذّرت القراءة', { id: 'scan' })
    } finally {
      setScanning(false)
    }
  }

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
      // العامل يؤثّر على قائمة العمال وكشف الرواتب وتكلفة عمالة المشاريع
      queryClient.invalidateQueries({ queryKey: ['workers-list'] })
      queryClient.invalidateQueries({ queryKey: ['payroll-workers'] })
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['worker', id] })
      toast.success(isEdit ? 'تم تحديث بيانات العامل' : 'تم إضافة العامل')
      navigate('/workers')
    } catch (e: unknown) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  // حسابات ذكية
  const eos = useMemo(() => calcEndOfService(Number(form.basic_salary) || 0, form.join_date ?? ''), [form.basic_salary, form.join_date])
  const accruedLeave = useMemo(() => calcAccruedLeave(Number(form.annual_leave_days) || 30, form.join_date ?? ''), [form.annual_leave_days, form.join_date])
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
        <div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScanDocument(f); e.target.value = '' }} />
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
            <Input label="الاسم بالإنجليزي" value={form.name_en ?? ''} onChange={e => setForm(p => ({ ...p, name_en: e.target.value }))} dir="ltr" />
            <Input label="رقم السجل المدني (CPR)" value={form.cpr ?? ''} onChange={e => setForm(p => ({ ...p, cpr: e.target.value }))} dir="ltr" />
            <Input label="الجنسية" value={form.nationality ?? ''} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))} />
            <Input label="المهنة / الوظيفة" value={form.profession ?? ''} onChange={e => setForm(p => ({ ...p, profession: e.target.value }))} />
            <Input label="رقم الهاتف" value={form.phone ?? ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} dir="ltr" />
            <Input label="رقم الجواز" value={form.passport_number ?? ''} onChange={e => setForm(p => ({ ...p, passport_number: e.target.value }))} dir="ltr" />
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
            <Input label="رقم الهاتف" value={form.emergency_phone ?? ''} onChange={e => setForm(p => ({ ...p, emergency_phone: e.target.value }))} dir="ltr" />
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
            <Input label="رقم IBAN" value={form.iban ?? ''} onChange={e => setForm(p => ({ ...p, iban: e.target.value }))} dir="ltr" />
          </div>
        </div>

        {/* الإجازات ونهاية الخدمة */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">الإجازات ونهاية الخدمة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="رصيد الإجازة السنوية (أيام)" type="number" value={String(form.annual_leave_days ?? 30)} onChange={e => setForm(p => ({ ...p, annual_leave_days: parseInt(e.target.value) || 0 }))} />
            <Input label="الأيام المستخدمة" type="number" value={String(form.used_leave_days ?? 0)} onChange={e => setForm(p => ({ ...p, used_leave_days: parseFloat(e.target.value) || 0 }))} />
          </div>
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

        {/* السلف تُدار الآن من كشف الرواتب (زيادة/خصم/سلفة قابلة للتعديل شهرياً) */}
        {isEdit && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            تُسجَّل السلف والزيادات والخصومات الآن من صفحة <button type="button" onClick={() => navigate('/payroll')} className="font-semibold underline underline-offset-2 hover:text-blue-900">كشف الرواتب</button> — لكل شهر على حدة، مع بقاء الراتب الأساسي ثابتاً لحماية الأجور.
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
