import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, User, FileText, CalendarCheck, Stethoscope,
  Plane, ShieldAlert, Wallet, Plus, Trash2, Upload, X
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type {
  Worker, WorkerAdvance, WorkerAttendance, WorkerLoan,
  WorkerMedicalRecord, WorkerTravelRecord, WorkerDocument,
  WorkerDisciplinary, WorkerDocType, DisciplinaryType, AttendanceStatus
} from '../../types'
import { formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'info', label: 'البيانات الأساسية والتصنيف', icon: User },
  { id: 'documents', label: 'أرشيف الوثائق', icon: FileText },
  { id: 'attendance', label: 'سجل الحضور', icon: CalendarCheck },
  { id: 'financial', label: 'السجل المالي', icon: Wallet },
  { id: 'medical', label: 'الملف الطبي', icon: Stethoscope },
  { id: 'travel', label: 'سجل السفر', icon: Plane },
  { id: 'disciplinary', label: 'الدفتر الإداري', icon: ShieldAlert },
] as const

type TabId = typeof TABS[number]['id']

const BRANCH_OPTIONS = [
  { value: '', label: 'اختر الفرع' },
  { value: '2', label: 'الفرع 2' },
  { value: '3', label: 'الفرع 3' },
  { value: '5', label: 'الفرع 5' },
]

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'على رأس العمل', absent: 'متغيب', sick: 'حالة مرضية',
  travel: 'مسافر', vacation: 'إجازة', leave: 'إذن',
}

const DOC_LABELS: Record<WorkerDocType, string> = {
  cpr_photo: 'صورة البطاقة الذكية CPR',
  passport: 'صورة جواز السفر',
  iban_cert: 'صورة شهادة الآيبان IBAN',
  contract: 'صورة عقد العمل',
}

export default function WorkerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [worker, setWorker] = useState<Worker | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<Worker>>({})

  // Sub-data
  const [attendance, setAttendance] = useState<WorkerAttendance[]>([])
  const [advances, setAdvances] = useState<WorkerAdvance[]>([])
  const [loans, setLoans] = useState<WorkerLoan[]>([])
  const [medicalRecords, setMedicalRecords] = useState<WorkerMedicalRecord[]>([])
  const [travelRecords, setTravelRecords] = useState<WorkerTravelRecord[]>([])
  const [documents, setDocuments] = useState<WorkerDocument[]>([])
  const [disciplinary, setDisciplinary] = useState<WorkerDisciplinary[]>([])

  useEffect(() => {
    if (!id) return
    const loadAll = async () => {
      const { data: w } = await supabase.from('workers').select('*').eq('id', id).single()
      if (w) { setWorker(w as Worker); setForm(w as Worker) }

      const [attRes, advRes, loanRes, medRes, travRes, docRes, discRes] = await Promise.all([
        supabase.from('worker_attendance').select('*').eq('worker_id', id).order('attendance_date', { ascending: false }).limit(100),
        supabase.from('worker_advances').select('*').eq('worker_id', id).order('advance_date', { ascending: false }),
        supabase.from('worker_loans').select('*').eq('worker_id', id).order('loan_date', { ascending: false }),
        supabase.from('worker_medical_records').select('*').eq('worker_id', id).order('visit_date', { ascending: false }),
        supabase.from('worker_travel_records').select('*').eq('worker_id', id).order('departure_date', { ascending: false }),
        supabase.from('worker_documents').select('*').eq('worker_id', id),
        supabase.from('worker_disciplinary').select('*').eq('worker_id', id).order('record_date', { ascending: false }),
      ])
      setAttendance((attRes.data ?? []) as WorkerAttendance[])
      setAdvances((advRes.data ?? []) as WorkerAdvance[])
      setLoans((loanRes.data ?? []) as WorkerLoan[])
      setMedicalRecords((medRes.data ?? []) as WorkerMedicalRecord[])
      setTravelRecords((travRes.data ?? []) as WorkerTravelRecord[])
      setDocuments((docRes.data ?? []) as WorkerDocument[])
      setDisciplinary((discRes.data ?? []) as WorkerDisciplinary[])
    }
    loadAll()
  }, [id])

  const handleSaveInfo = async () => {
    if (!form.name) { toast.error('يجب إدخال الاسم'); return }
    setSaving(true)
    const { error } = await supabase.from('workers').update({ ...form, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) toast.error('حدث خطأ')
    else { toast.success('تم حفظ البيانات'); setWorker({ ...worker!, ...form } as Worker) }
    setSaving(false)
  }

  if (!worker) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/workers')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{worker.name}</h1>
          <p className="text-sm text-slate-500">{worker.profession || 'عامل'} — {worker.name_en || ''}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-slate-800 text-slate-800'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-4xl">
        {activeTab === 'info' && (
          <InfoTab form={form} setForm={setForm} saving={saving} onSave={handleSaveInfo} />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab workerId={id!} documents={documents} setDocuments={setDocuments} />
        )}
        {activeTab === 'attendance' && (
          <AttendanceTab workerId={id!} attendance={attendance} setAttendance={setAttendance} />
        )}
        {activeTab === 'financial' && (
          <FinancialTab workerId={id!} advances={advances} setAdvances={setAdvances} loans={loans} setLoans={setLoans} />
        )}
        {activeTab === 'medical' && (
          <MedicalTab workerId={id!} records={medicalRecords} setRecords={setMedicalRecords} />
        )}
        {activeTab === 'travel' && (
          <TravelTab workerId={id!} records={travelRecords} setRecords={setTravelRecords} />
        )}
        {activeTab === 'disciplinary' && (
          <DisciplinaryTab workerId={id!} records={disciplinary} setRecords={setDisciplinary} />
        )}
      </div>
    </div>
  )
}

// ─── Info Tab ────────────────────────────────────────────────────────────────

function InfoTab({ form, setForm, saving, onSave }: {
  form: Partial<Worker>; setForm: React.Dispatch<React.SetStateAction<Partial<Worker>>>; saving: boolean; onSave: () => void
}) {
  return (
    <div className="space-y-5">
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

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">التصنيف</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label="نوع العمالة" value={form.worker_type ?? 'company'}
            onChange={e => setForm(p => ({ ...p, worker_type: e.target.value as Worker['worker_type'] }))}
            options={[{ value: 'company', label: 'عمالة الشركة' }, { value: 'lmra', label: 'عمالة هيئة LMRA' }]} />
          <Select label="طريقة الدفع" value={form.pay_type ?? 'monthly'}
            onChange={e => setForm(p => ({ ...p, pay_type: e.target.value as Worker['pay_type'] }))}
            options={[{ value: 'monthly', label: 'شهري' }, { value: 'daily', label: 'يومي' }]} />
          {form.worker_type === 'company' && (
            <Select label="الفرع" value={form.branch ?? ''} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} options={BRANCH_OPTIONS} />
          )}
          <Select label="الحالة" value={form.status ?? 'active'}
            onChange={e => setForm(p => ({ ...p, status: e.target.value as Worker['status'] }))}
            options={[{ value: 'active', label: 'نشط' }, { value: 'inactive', label: 'غير نشط' }]} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">بيانات الراتب</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {form.pay_type === 'monthly' ? (<>
            <Input label="الراتب الأساسي (WPS) (د.ب)" type="number" value={String(form.basic_salary ?? 0)} onChange={e => setForm(p => ({ ...p, basic_salary: parseFloat(e.target.value) || 0 }))} />
            <Input label="بدل اجتماعي (د.ب)" type="number" value={String(form.social_allowance ?? 0)} onChange={e => setForm(p => ({ ...p, social_allowance: parseFloat(e.target.value) || 0 }))} />
            <Input label="الراتب الفعلي (خارج WPS) (د.ب)" type="number" value={String(form.actual_salary ?? 0)} onChange={e => setForm(p => ({ ...p, actual_salary: parseFloat(e.target.value) || 0 }))} />
          </>) : (
            <Input label="الأجر اليومي (د.ب)" type="number" value={String(form.daily_rate ?? 0)} onChange={e => setForm(p => ({ ...p, daily_rate: parseFloat(e.target.value) || 0 }))} />
          )}
          <Input label="رقم IBAN" value={form.iban ?? ''} onChange={e => setForm(p => ({ ...p, iban: e.target.value }))} />
        </div>
      </div>

      <Textarea label="ملاحظات" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
      <Button loading={saving} onClick={onSave}>حفظ التعديلات</Button>
    </div>
  )
}

// ─── Documents Tab ───────────────────────────────────────────────────────────

function DocumentsTab({ workerId, documents, setDocuments }: {
  workerId: string; documents: WorkerDocument[]; setDocuments: React.Dispatch<React.SetStateAction<WorkerDocument[]>>
}) {
  const handleUpload = async (docType: WorkerDocType, file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const fileData = reader.result as string
      const { data, error } = await supabase.from('worker_documents')
        .upsert({ worker_id: workerId, doc_type: docType, file_data: fileData, file_name: file.name, uploaded_at: new Date().toISOString() }, { onConflict: 'worker_id,doc_type' })
        .select().single()
      if (error) { toast.error('حدث خطأ'); return }
      setDocuments(prev => {
        const filtered = prev.filter(d => d.doc_type !== docType)
        return [...filtered, data as WorkerDocument]
      })
      toast.success('تم رفع المستند')
    }
    reader.readAsDataURL(file)
  }

  const handleDelete = async (docType: WorkerDocType) => {
    await supabase.from('worker_documents').delete().eq('worker_id', workerId).eq('doc_type', docType)
    setDocuments(prev => prev.filter(d => d.doc_type !== docType))
    toast.success('تم حذف المستند')
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {(Object.keys(DOC_LABELS) as WorkerDocType[]).map(docType => {
        const doc = documents.find(d => d.doc_type === docType)
        return (
          <div key={docType} className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">{DOC_LABELS[docType]}</h3>
            {doc?.file_data ? (
              <div className="space-y-2">
                <div className="aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                  <img src={doc.file_data} alt={DOC_LABELS[docType]} className="w-full h-full object-contain" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 truncate">{doc.file_name}</span>
                  <button onClick={() => handleDelete(docType)} className="text-xs text-red-500 hover:text-red-700">حذف</button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors">
                <Upload size={24} className="text-slate-400" />
                <span className="text-sm text-slate-500">انقر لرفع الملف</span>
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(docType, f)
                }} />
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Attendance Tab ──────────────────────────────────────────────────────────

function AttendanceTab({ workerId, attendance, setAttendance }: {
  workerId: string; attendance: WorkerAttendance[]; setAttendance: React.Dispatch<React.SetStateAction<WorkerAttendance[]>>
}) {
  const [addForm, setAddForm] = useState({ date: new Date().toISOString().slice(0, 10), status: 'present' as AttendanceStatus, notes: '' })
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    const { data, error } = await supabase.from('worker_attendance')
      .upsert({ worker_id: workerId, attendance_date: addForm.date, status: addForm.status, source: 'manual', notes: addForm.notes }, { onConflict: 'worker_id,attendance_date' })
      .select().single()
    if (error) toast.error('حدث خطأ')
    else {
      setAttendance(prev => {
        const filtered = prev.filter(a => a.attendance_date !== addForm.date)
        return [data as WorkerAttendance, ...filtered].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date))
      })
      toast.success('تم تسجيل الحضور')
      setAddForm({ date: new Date().toISOString().slice(0, 10), status: 'present', notes: '' })
    }
    setAdding(false)
  }

  const statusColor: Record<AttendanceStatus, string> = {
    present: 'bg-green-100 text-green-700', absent: 'bg-red-100 text-red-700', sick: 'bg-amber-100 text-amber-700',
    travel: 'bg-blue-100 text-blue-700', vacation: 'bg-teal-100 text-teal-700', leave: 'bg-slate-100 text-slate-700',
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">تسجيل يدوي</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Input label="التاريخ" type="date" value={addForm.date} onChange={e => setAddForm(p => ({ ...p, date: e.target.value }))} />
          <Select label="الحالة" value={addForm.status}
            onChange={e => setAddForm(p => ({ ...p, status: e.target.value as AttendanceStatus }))}
            options={Object.entries(ATTENDANCE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          <Input label="ملاحظة" value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} />
          <Button size="sm" loading={adding} onClick={handleAdd} icon={<Plus size={14} />}>تسجيل</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">سجل التحركات والحضور</h3>
        </div>
        {attendance.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">لا توجد سجلات</div>
        ) : (
          <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
            {attendance.map(a => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700 w-24">{formatDate(a.attendance_date)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[a.status]}`}>
                    {ATTENDANCE_LABELS[a.status]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {a.project_name && <span className="text-xs text-slate-500">{a.project_name}</span>}
                  <span className={`text-xs ${a.source === 'auto_log' ? 'text-blue-500' : 'text-slate-400'}`}>
                    {a.source === 'auto_log' ? 'تلقائي' : 'يدوي'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Financial Tab ───────────────────────────────────────────────────────────

function FinancialTab({ workerId, advances, setAdvances, loans, setLoans }: {
  workerId: string; advances: WorkerAdvance[]; setAdvances: React.Dispatch<React.SetStateAction<WorkerAdvance[]>>
  loans: WorkerLoan[]; setLoans: React.Dispatch<React.SetStateAction<WorkerLoan[]>>
}) {
  const [advForm, setAdvForm] = useState({ amount: 0, advance_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [loanForm, setLoanForm] = useState({ loan_amount: 0, monthly_installment: 0, loan_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [addingAdv, setAddingAdv] = useState(false)
  const [addingLoan, setAddingLoan] = useState(false)

  const handleAddAdvance = async () => {
    if (!advForm.amount || advForm.amount <= 0) { toast.error('يجب إدخال المبلغ'); return }
    setAddingAdv(true)
    const { data, error } = await supabase.from('worker_advances').insert({ ...advForm, worker_id: workerId }).select().single()
    if (error) toast.error('حدث خطأ')
    else { setAdvances(prev => [data as WorkerAdvance, ...prev]); toast.success('تم تسجيل السلفة') }
    setAdvForm({ amount: 0, advance_date: new Date().toISOString().slice(0, 10), notes: '' })
    setAddingAdv(false)
  }

  const handleAddLoan = async () => {
    if (!loanForm.loan_amount || loanForm.loan_amount <= 0) { toast.error('يجب إدخال مبلغ القرض'); return }
    if (!loanForm.monthly_installment || loanForm.monthly_installment <= 0) { toast.error('يجب إدخال القسط الشهري'); return }
    setAddingLoan(true)
    const payload = { ...loanForm, worker_id: workerId, remaining_balance: loanForm.loan_amount, status: 'active' }
    const { data, error } = await supabase.from('worker_loans').insert(payload).select().single()
    if (error) toast.error('حدث خطأ')
    else { setLoans(prev => [data as WorkerLoan, ...prev]); toast.success('تم تسجيل القرض') }
    setLoanForm({ loan_amount: 0, monthly_installment: 0, loan_date: new Date().toISOString().slice(0, 10), notes: '' })
    setAddingLoan(false)
  }

  const toggleAdvDeducted = async (adv: WorkerAdvance) => {
    await supabase.from('worker_advances').update({ deducted: !adv.deducted }).eq('id', adv.id)
    setAdvances(prev => prev.map(a => a.id === adv.id ? { ...a, deducted: !a.deducted } : a))
  }

  const deductInstallment = async (loan: WorkerLoan) => {
    const newBalance = Math.max(0, loan.remaining_balance - loan.monthly_installment)
    const newStatus = newBalance <= 0 ? 'completed' : 'active'
    await supabase.from('worker_loans').update({ remaining_balance: newBalance, status: newStatus }).eq('id', loan.id)
    setLoans(prev => prev.map(l => l.id === loan.id ? { ...l, remaining_balance: newBalance, status: newStatus as 'active' | 'completed' } : l))
    toast.success(`تم خصم ${loan.monthly_installment.toFixed(3)} د.ب`)
  }

  const totalPendingAdvances = advances.filter(a => !a.deducted).reduce((s, a) => s + Number(a.amount), 0)
  const totalActiveLoans = loans.filter(l => l.status === 'active').reduce((s, l) => s + l.remaining_balance, 0)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs text-red-600 mb-1">رصيد السلف المعلقة</div>
          <div className="text-xl font-bold text-red-700">{totalPendingAdvances.toFixed(3)} د.ب</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs text-amber-600 mb-1">رصيد القروض النشطة</div>
          <div className="text-xl font-bold text-amber-700">{totalActiveLoans.toFixed(3)} د.ب</div>
        </div>
      </div>

      {/* Emergency Advances */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-3">السلف المؤقتة (خصم كامل من الراتب القادم)</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4 p-3 bg-slate-50 rounded-lg">
          <Input label="المبلغ (د.ب)" type="number" value={String(advForm.amount)} onChange={e => setAdvForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} />
          <Input label="التاريخ" type="date" value={advForm.advance_date} onChange={e => setAdvForm(p => ({ ...p, advance_date: e.target.value }))} />
          <Input label="ملاحظة" value={advForm.notes} onChange={e => setAdvForm(p => ({ ...p, notes: e.target.value }))} />
          <Button size="sm" icon={<Plus size={14} />} loading={addingAdv} onClick={handleAddAdvance}>إضافة سلفة</Button>
        </div>
        {advances.length === 0 ? <p className="text-center text-slate-400 text-sm py-3">لا توجد سلف</p> : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {advances.map(adv => (
              <div key={adv.id} className={`flex items-center justify-between p-3 rounded-lg border ${adv.deducted ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div>
                  <span className="font-medium text-sm">{Number(adv.amount).toFixed(3)} د.ب</span>
                  <span className="text-slate-500 text-xs mr-2">{formatDate(adv.advance_date)}</span>
                  {adv.notes && <span className="text-slate-500 text-xs"> — {adv.notes}</span>}
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={adv.deducted} onChange={() => toggleAdvDeducted(adv)} className="rounded" />
                  {adv.deducted ? 'تم الخصم' : 'لم يُخصم'}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Installment Loans */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-3">القروض المقسطة (خصم شهري تلقائي)</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4 p-3 bg-slate-50 rounded-lg">
          <Input label="إجمالي القرض (د.ب)" type="number" value={String(loanForm.loan_amount)} onChange={e => setLoanForm(p => ({ ...p, loan_amount: parseFloat(e.target.value) || 0 }))} />
          <Input label="القسط الشهري (د.ب)" type="number" value={String(loanForm.monthly_installment)} onChange={e => setLoanForm(p => ({ ...p, monthly_installment: parseFloat(e.target.value) || 0 }))} />
          <Input label="تاريخ القرض" type="date" value={loanForm.loan_date} onChange={e => setLoanForm(p => ({ ...p, loan_date: e.target.value }))} />
          <Button size="sm" icon={<Plus size={14} />} loading={addingLoan} onClick={handleAddLoan}>تسجيل قرض</Button>
        </div>
        {loans.length === 0 ? <p className="text-center text-slate-400 text-sm py-3">لا توجد قروض</p> : (
          <div className="space-y-3">
            {loans.map(loan => (
              <div key={loan.id} className={`p-4 rounded-lg border ${loan.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-bold text-sm">{loan.loan_amount.toFixed(3)} د.ب</span>
                    <span className="text-xs text-slate-500 mr-2">— قسط: {loan.monthly_installment.toFixed(3)} د.ب/شهر</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${loan.status === 'active' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {loan.status === 'active' ? 'نشط' : 'مكتمل'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    المتبقي: <span className="font-bold text-slate-700">{loan.remaining_balance.toFixed(3)} د.ب</span>
                    <span className="mr-2">— تاريخ: {formatDate(loan.loan_date)}</span>
                  </div>
                  {loan.status === 'active' && (
                    <Button size="sm" variant="outline" onClick={() => deductInstallment(loan)}>خصم قسط</Button>
                  )}
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${Math.max(0, ((loan.loan_amount - loan.remaining_balance) / loan.loan_amount) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Medical Tab ─────────────────────────────────────────────────────────────

function MedicalTab({ workerId, records, setRecords }: {
  workerId: string; records: WorkerMedicalRecord[]; setRecords: React.Dispatch<React.SetStateAction<WorkerMedicalRecord[]>>
}) {
  const [form, setForm] = useState({ hospital: '', diagnosis: '', treatment_cost: 0, visit_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!form.hospital && !form.diagnosis) { toast.error('يجب إدخال بيانات الزيارة'); return }
    setAdding(true)
    const { data, error } = await supabase.from('worker_medical_records').insert({ ...form, worker_id: workerId }).select().single()
    if (error) toast.error('حدث خطأ')
    else { setRecords(prev => [data as WorkerMedicalRecord, ...prev]); toast.success('تم تسجيل الزيارة') }
    setForm({ hospital: '', diagnosis: '', treatment_cost: 0, visit_date: new Date().toISOString().slice(0, 10), notes: '' })
    setAdding(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('worker_medical_records').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">تسجيل زيارة طبية</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <Input label="المستشفى / العيادة" value={form.hospital} onChange={e => setForm(p => ({ ...p, hospital: e.target.value }))} />
          <Input label="التشخيص / المشكلة" value={form.diagnosis} onChange={e => setForm(p => ({ ...p, diagnosis: e.target.value }))} />
          <Input label="تكلفة العلاج (د.ب)" type="number" value={String(form.treatment_cost)} onChange={e => setForm(p => ({ ...p, treatment_cost: parseFloat(e.target.value) || 0 }))} />
          <Input label="تاريخ الزيارة" type="date" value={form.visit_date} onChange={e => setForm(p => ({ ...p, visit_date: e.target.value }))} />
        </div>
        <Button size="sm" icon={<Plus size={14} />} loading={adding} onClick={handleAdd}>تسجيل</Button>
      </div>

      {records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">لا توجد سجلات طبية</div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between">
              <div>
                <div className="font-medium text-sm text-slate-800">{r.hospital || '—'}</div>
                <div className="text-xs text-slate-500 mt-0.5">{r.diagnosis}</div>
                <div className="text-xs text-slate-400 mt-1">{formatDate(r.visit_date)} — {r.treatment_cost.toFixed(3)} د.ب</div>
              </div>
              <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Travel Tab ──────────────────────────────────────────────────────────────

function TravelTab({ workerId, records, setRecords }: {
  workerId: string; records: WorkerTravelRecord[]; setRecords: React.Dispatch<React.SetStateAction<WorkerTravelRecord[]>>
}) {
  const [form, setForm] = useState({ departure_date: '', return_date: '', departure_airport: '', arrival_airport: '', airline: '', ticket_cost: 0, notes: '' })
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!form.departure_date) { toast.error('يجب إدخال تاريخ السفر'); return }
    setAdding(true)
    const { data, error } = await supabase.from('worker_travel_records').insert({ ...form, worker_id: workerId }).select().single()
    if (error) toast.error('حدث خطأ')
    else { setRecords(prev => [data as WorkerTravelRecord, ...prev]); toast.success('تم تسجيل السفر') }
    setForm({ departure_date: '', return_date: '', departure_airport: '', arrival_airport: '', airline: '', ticket_cost: 0, notes: '' })
    setAdding(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('worker_travel_records').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">تسجيل رحلة سفر</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <Input label="تاريخ السفر" type="date" value={form.departure_date} onChange={e => setForm(p => ({ ...p, departure_date: e.target.value }))} />
          <Input label="تاريخ العودة" type="date" value={form.return_date} onChange={e => setForm(p => ({ ...p, return_date: e.target.value }))} />
          <Input label="الخطوط الجوية" value={form.airline} onChange={e => setForm(p => ({ ...p, airline: e.target.value }))} />
          <Input label="مطار المغادرة" value={form.departure_airport} onChange={e => setForm(p => ({ ...p, departure_airport: e.target.value }))} />
          <Input label="مطار الوصول" value={form.arrival_airport} onChange={e => setForm(p => ({ ...p, arrival_airport: e.target.value }))} />
          <Input label="سعر التذكرة (د.ب)" type="number" value={String(form.ticket_cost)} onChange={e => setForm(p => ({ ...p, ticket_cost: parseFloat(e.target.value) || 0 }))} />
        </div>
        <Button size="sm" icon={<Plus size={14} />} loading={adding} onClick={handleAdd}>تسجيل</Button>
      </div>

      {records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">لا توجد سجلات سفر</div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between">
              <div>
                <div className="font-medium text-sm text-slate-800">
                  {r.departure_airport || '—'} → {r.arrival_airport || '—'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {r.airline && `${r.airline} — `}
                  {r.departure_date && formatDate(r.departure_date)}
                  {r.return_date && ` إلى ${formatDate(r.return_date)}`}
                </div>
                <div className="text-xs text-slate-400 mt-1">{r.ticket_cost.toFixed(3)} د.ب</div>
              </div>
              <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Disciplinary Tab ────────────────────────────────────────────────────────

function DisciplinaryTab({ workerId, records, setRecords }: {
  workerId: string; records: WorkerDisciplinary[]; setRecords: React.Dispatch<React.SetStateAction<WorkerDisciplinary[]>>
}) {
  const [form, setForm] = useState({ record_type: 'request' as DisciplinaryType, title: '', description: '', record_date: new Date().toISOString().slice(0, 10) })
  const [adding, setAdding] = useState(false)

  const TYPE_LABELS: Record<DisciplinaryType, { label: string; color: string }> = {
    request: { label: 'طلب', color: 'bg-blue-100 text-blue-700' },
    violation: { label: 'مخالفة', color: 'bg-red-100 text-red-700' },
    warning: { label: 'إنذار', color: 'bg-amber-100 text-amber-700' },
  }

  const handleAdd = async () => {
    if (!form.title) { toast.error('يجب إدخال العنوان'); return }
    setAdding(true)
    const { data, error } = await supabase.from('worker_disciplinary').insert({ ...form, worker_id: workerId }).select().single()
    if (error) toast.error('حدث خطأ')
    else { setRecords(prev => [data as WorkerDisciplinary, ...prev]); toast.success('تم التسجيل') }
    setForm({ record_type: 'request', title: '', description: '', record_date: new Date().toISOString().slice(0, 10) })
    setAdding(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('worker_disciplinary').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">إضافة سجل إداري</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <Select label="النوع" value={form.record_type}
            onChange={e => setForm(p => ({ ...p, record_type: e.target.value as DisciplinaryType }))}
            options={[{ value: 'request', label: 'طلب' }, { value: 'violation', label: 'مخالفة' }, { value: 'warning', label: 'إنذار / تنبيه' }]} />
          <Input label="التاريخ" type="date" value={form.record_date} onChange={e => setForm(p => ({ ...p, record_date: e.target.value }))} />
          <Input label="العنوان *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <Input label="التفاصيل" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
        </div>
        <Button size="sm" icon={<Plus size={14} />} loading={adding} onClick={handleAdd}>إضافة</Button>
      </div>

      {records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">لا توجد سجلات</div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${TYPE_LABELS[r.record_type].color}`}>
                  {TYPE_LABELS[r.record_type].label}
                </span>
                <div>
                  <div className="font-medium text-sm text-slate-800">{r.title}</div>
                  {r.description && <div className="text-xs text-slate-500 mt-0.5">{r.description}</div>}
                  <div className="text-xs text-slate-400 mt-1">{formatDate(r.record_date)}</div>
                </div>
              </div>
              <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
