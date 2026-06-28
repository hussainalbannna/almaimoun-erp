import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, DollarSign } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, subcontractorSpecialtyLabel } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
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

const emptyForm: Omit<Subcontractor, 'id'> = {
  name: '', specialty: 'electrical', phone: '', whatsapp: '',
  cr_number: '', bank_iban: '', notes: '', status: 'active',
}

export default function SubcontractorDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [activeTab, setActiveTab] = useState<'info' | 'assignments' | 'payments'>('info')

  const [showAssignForm, setShowAssignForm] = useState(false)
  const [assignForm, setAssignForm] = useState({
    project_id: '', scope: '', agreed_amount: '', start_date: '', end_date: '', notes: '',
  })

  const [showPayForm, setShowPayForm] = useState(false)
  const [payForm, setPayForm] = useState({
    assignment_id: '', amount: '', payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'cash', check_due_date: '', check_number: '', notes: '',
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

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم المقاول'); return }
    setSaving(true)
    try {
      if (isNew) {
        const { data, error } = await supabase.from('subcontractors').insert(form).select().single()
        if (error) throw error
        toast.success('تم إضافة المقاول')
        navigate(`/subcontractors/${(data as Subcontractor).id}`)
      } else {
        const { error } = await supabase.from('subcontractors').update({ ...form, updated_at: new Date().toISOString() }).eq('id', id!)
        if (error) throw error
        toast.success('تم الحفظ')
      }
    } catch {
      toast.error('حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const handleAddAssignment = async () => {
    if (!assignForm.scope.trim()) { toast.error('أدخل وصف العمل'); return }
    try {
      const proj = projects.find(p => p.id === assignForm.project_id)
      const { error } = await supabase.from('subcontractor_assignments').insert({
        subcontractor_id: id,
        project_id: assignForm.project_id || null,
        project_name: proj?.project_name ?? '',
        scope: assignForm.scope,
        agreed_amount: Number(assignForm.agreed_amount) || 0,
        start_date: assignForm.start_date || null,
        end_date: assignForm.end_date || null,
        notes: assignForm.notes,
        status: 'active',
      })
      if (error) throw error
      toast.success('تم إضافة التكليف')
      setShowAssignForm(false)
      setAssignForm({ project_id: '', scope: '', agreed_amount: '', start_date: '', end_date: '', notes: '' })
      load()
    } catch { toast.error('حدث خطأ') }
  }

  const handleAddPayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast.error('أدخل المبلغ'); return }
    if (!payForm.assignment_id) { toast.error('اختر التكليف'); return }
    try {
      const assign = assignments.find(a => a.id === payForm.assignment_id)
      const { error: payErr } = await supabase.from('subcontractor_payments').insert({
        assignment_id: payForm.assignment_id,
        subcontractor_id: id,
        project_id: assign?.project_id ?? null,
        amount: Number(payForm.amount),
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        check_due_date: payForm.check_due_date || null,
        check_number: payForm.check_number,
        notes: payForm.notes,
      })
      if (payErr) throw payErr
      if (assign) {
        await supabase.from('subcontractor_assignments').update({
          paid_amount: Number(assign.paid_amount) + Number(payForm.amount)
        }).eq('id', payForm.assignment_id)
      }
      toast.success('تم تسجيل الدفعة')
      setShowPayForm(false)
      setPayForm({ assignment_id: '', amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'cash', check_due_date: '', check_number: '', notes: '' })
      load()
    } catch { toast.error('حدث خطأ') }
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
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{isNew ? 'إضافة مقاول جديد' : form.name}</h1>
            {!isNew && <p className="text-slate-500 text-sm">{subcontractorSpecialtyLabel[form.specialty] ?? form.specialty}</p>}
          </div>
        </div>
        <Button loading={saving} onClick={handleSave}>حفظ</Button>
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
            <Input label="رقم الهاتف" value={form.phone} onChange={set('phone')} placeholder="3XXXXXXX" />
            <Input label="واتساب" value={form.whatsapp} onChange={set('whatsapp')} placeholder="973XXXXXXXX" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="رقم السجل التجاري" value={form.cr_number} onChange={set('cr_number')} />
            <Input label="IBAN البنكي" value={form.bank_iban} onChange={set('bank_iban')} />
          </div>
          <Textarea label="ملاحظات" value={form.notes} onChange={set('notes')} rows={2} />
        </div>
      )}

      {!isNew && activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-700">التكاليف والعقود</h3>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowAssignForm(true)}>إضافة تكليف</Button>
          </div>

          {showAssignForm && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="font-medium text-amber-900 text-sm mb-2">تكليف جديد</div>
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
              <div className="flex gap-2">
                <Button onClick={handleAddAssignment}>حفظ</Button>
                <Button variant="secondary" onClick={() => setShowAssignForm(false)}>إلغاء</Button>
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
                return (
                  <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-slate-800">{a.project_name || 'بدون مشروع'}</div>
                        <div className="text-sm text-slate-600 mt-0.5">{a.scope}</div>
                        {(a.start_date || a.end_date) && (
                          <div className="text-xs text-slate-400 mt-1">
                            {a.start_date && formatDate(a.start_date)} {a.end_date && `— ${formatDate(a.end_date)}`}
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <div className="text-xs text-slate-400">المتفق</div>
                        <div className="font-bold text-slate-700">{formatCurrency(Number(a.agreed_amount))}</div>
                        <div className="text-xs text-slate-400 mt-0.5">مدفوع: {formatCurrency(Number(a.paid_amount))}</div>
                        <div className={`text-xs font-medium mt-0.5 ${rem > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {rem > 0 ? `متبقي: ${formatCurrency(rem)}` : '✓ مكتمل'}
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
            <Button size="sm" icon={<DollarSign size={14} />} onClick={() => setShowPayForm(true)}>تسجيل دفعة</Button>
          </div>

          {showPayForm && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
              <div className="font-medium text-green-900 text-sm mb-2">دفعة جديدة</div>
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
                    onChange={e => setPayForm(f => ({ ...f, check_number: e.target.value }))} />
                </div>
              )}
              <Input label="ملاحظات" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-2">
                <Button onClick={handleAddPayment}>تسجيل الدفعة</Button>
                <Button variant="secondary" onClick={() => setShowPayForm(false)}>إلغاء</Button>
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
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-700">{formatDate(p.payment_date)}</td>
                      <td className="px-4 py-3 font-bold text-green-700">{formatCurrency(Number(p.amount))}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.payment_method === 'cash' ? 'نقداً' : p.payment_method === 'bank_transfer' ? 'تحويل بنكي' : `شيك${p.check_due_date ? ` (${formatDate(p.check_due_date)})` : ''}`}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{p.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-slate-700">الإجمالي</td>
                    <td className="px-4 py-3 font-bold text-green-700">{formatCurrency(payments.reduce((s, p) => s + Number(p.amount), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}