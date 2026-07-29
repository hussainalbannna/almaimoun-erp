import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Printer, Eye, Save, Plus, Trash2, CheckCircle2, RotateCcw, Loader2, FileSignature } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, todayLocal } from '../../lib/utils'
import {
  type ContractSpec, type ContractStage, type TradeKey, type BuildingKey,
  defaultSpec, buildContractHTML, branchCompanyName, stagesTotal,
  BRANCHES, BUILDING_LABELS, TRADE_LABELS,
} from '../../lib/subcontracts'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// صفّ مرحلة كما هو مخزّن في قاعدة البيانات (المصدر المالي)
interface StageRow {
  id: string
  seq: number
  description: string
  amount: number
  status: 'pending' | 'paid'
  payment_id: string | null
  paid_date: string | null
}

interface ProjectOpt { id: string; project_name: string; location: string | null }

const TRADE_OPTS = (Object.keys(TRADE_LABELS) as TradeKey[]).map(k => ({ value: k, label: TRADE_LABELS[k].ar }))
const BUILDING_OPTS = (Object.keys(BUILDING_LABELS) as BuildingKey[]).map(k => ({ value: k, label: BUILDING_LABELS[k] }))
const BRANCH_OPTS = BRANCHES.map(b => ({ value: String(b.no), label: `فرع ${b.no} — ${b.name}` }))
const PAY_METHODS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'cheque', label: 'شيك آجل' },
]

// ─── طباعة: معاينة في نافذة + طباعة صامتة عبر iframe (نفس نمط النظام) ──
function openPreviewWindow(html: string) {
  const win = window.open('', '_blank')
  if (!win) { toast.error('فعّل النوافذ المنبثقة للمعاينة، أو استخدم زر الطباعة'); return }
  const bar = `
    <div id="__bar__" style="position:fixed;top:0;left:0;right:0;background:#7b4a2d;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;z-index:9999;font-family:Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);">
      <span style="font-weight:700;font-size:14px;">معاينة العقد</span>
      <div style="display:flex;gap:8px;">
        <button onclick="window.print()" style="background:#c4925a;color:#fff;border:0;padding:8px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;">طباعة / حفظ PDF</button>
        <button onclick="window.close()" style="background:rgba(255,255,255,.2);color:#fff;border:0;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;">إغلاق</button>
      </div>
    </div>
    <style>@media print { #__bar__ { display:none !important; } }</style>`
  win.document.open()
  win.document.write(html.replace('<body>', `<body>${bar}`))
  win.document.close()
}

function openPrintWindow(html: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument ?? iframe.contentWindow?.document
  if (!doc) { document.body.removeChild(iframe); return }
  doc.open(); doc.write(html); doc.close()
  const cleanup = () => { if (document.body.contains(iframe)) document.body.removeChild(iframe) }
  const guard = document.createElement('style')
  guard.id = '__print_guard__'
  guard.textContent = `@media print { body > *:not(iframe[aria-hidden]) { display:none !important; } }`
  document.head.appendChild(guard)
  const removeGuard = () => document.getElementById('__print_guard__')?.remove()
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      setTimeout(() => { cleanup(); removeGuard() }, 120_000)
    }
  }
}

export default function SubcontractorContract() {
  const { id, assignmentId } = useParams<{ id: string; assignmentId?: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = !!assignmentId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [spec, setSpec] = useState<ContractSpec>(() => defaultSpec('electrical', todayLocal()))
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [stages, setStages] = useState<StageRow[]>([])       // للعرض المالي عند التعديل
  const [scopeText, setScopeText] = useState('')

  // حوار تسجيل دفع مرحلة
  const [payStage, setPayStage] = useState<StageRow | null>(null)
  const [payForm, setPayForm] = useState({ payment_date: todayLocal(), payment_method: 'cash', check_due_date: '', check_number: '' })
  const [unpayStage, setUnpayStage] = useState<StageRow | null>(null)
  const [busyStage, setBusyStage] = useState<string | null>(null)

  const anyPaid = stages.some(s => s.status === 'paid')
  const liveTotal = useMemo(() => stagesTotal(spec.stages), [spec.stages])

  // ─── التحميل ───────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const [projRes, subRes] = await Promise.all([
        supabase.from('projects').select('id, project_name, location').eq('status', 'active').order('project_name'),
        id ? supabase.from('subcontractors').select('id, name, specialty, phone, cr_number, cpr, address').eq('id', id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (!alive) return
      setProjects((projRes.data ?? []) as ProjectOpt[])
      const sub = (subRes.data ?? null) as { name?: string; specialty?: string; phone?: string; cr_number?: string; cpr?: string; address?: string } | null

      if (isEdit && assignmentId) {
        const [aRes, stRes] = await Promise.all([
          supabase.from('subcontractor_assignments').select('id, project_id, contract_spec, contract_trade, building_type, branch_no, agreed_amount').eq('id', assignmentId).maybeSingle(),
          supabase.from('subcontractor_stages').select('id, seq, description, amount, status, payment_id, paid_date').eq('assignment_id', assignmentId).order('seq'),
        ])
        if (!alive) return
        const a = aRes.data as { project_id?: string; contract_spec?: ContractSpec | null; agreed_amount?: number | string } | null
        const loadedSpec = a?.contract_spec ?? null
        if (loadedSpec) {
          setSpec(loadedSpec)
          setScopeText(loadedSpec.scopeItems.join('\n'))
        } else {
          // إسناد قديم بلا عقد مولّد — نهيّئ مواصفات افتراضية ونملأ طرف المقاول
          const trade: TradeKey = sub?.specialty === 'plumbing' ? 'plumbing' : 'electrical'
          const s = defaultSpec(trade, todayLocal())
          if (sub) s.sub = { name: sub.name ?? '', cr: sub.cr_number ?? '', cpr: sub.cpr ?? '', address: sub.address ?? '', tel: sub.phone ?? '', email: '' }
          setSpec(s)
          setScopeText(s.scopeItems.join('\n'))
        }
        setProjectId(a?.project_id ?? '')
        setStages(((stRes.data ?? []) as StageRow[]).map(s => ({ ...s, amount: Number(s.amount) || 0, seq: Number(s.seq) || 0 })))
      } else {
        // عقد جديد — نهيّئ المواصفات ونملأ طرف المقاول من سجلّه
        const trade: TradeKey = sub?.specialty === 'plumbing' ? 'plumbing' : 'electrical'
        const s = defaultSpec(trade, todayLocal())
        if (sub) {
          s.sub = { name: sub.name ?? '', cr: sub.cr_number ?? '', cpr: sub.cpr ?? '', address: sub.address ?? '', tel: sub.phone ?? '', email: '' }
        }
        setSpec(s)
        setScopeText(s.scopeItems.join('\n'))
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [id, assignmentId, isEdit])

  // ─── تعديل المواصفات ────────────────────────────────────────────────
  const patch = (p: Partial<ContractSpec>) => setSpec(prev => ({ ...prev, ...p }))
  const patchMain = (p: Partial<ContractSpec['main']>) => setSpec(prev => ({ ...prev, main: { ...prev.main, ...p } }))
  const patchSub = (p: Partial<ContractSpec['sub']>) => setSpec(prev => ({ ...prev, sub: { ...prev.sub, ...p } }))

  const changeTrade = (trade: TradeKey) => {
    if (anyPaid) return
    const fresh = defaultSpec(trade, spec.contractDate)
    // نحافظ على البيانات المشتركة (الطرفان، الفرع، الموقع، نوع المبنى)
    fresh.branchNo = spec.branchNo
    fresh.main = { ...spec.main }
    fresh.sub = { ...spec.sub }
    fresh.siteLocation = spec.siteLocation
    fresh.buildingType = spec.buildingType
    setSpec(fresh)
    setScopeText(fresh.scopeItems.join('\n'))
  }

  const changeBranch = (no: number) => patch({ branchNo: no, main: { ...spec.main, name: branchCompanyName(no) } })

  const changeProject = (pid: string) => {
    setProjectId(pid)
    const p = projects.find(x => x.id === pid)
    if (p && !spec.siteLocation) patch({ siteLocation: p.location ?? '' })
  }

  const setStageField = (idx: number, field: 'description' | 'amount', value: string) => {
    setSpec(prev => {
      const next = prev.stages.map((s, i) =>
        i === idx ? { ...s, [field]: field === 'amount' ? (Number(value) || 0) : value } : s,
      )
      return { ...prev, stages: next, total: stagesTotal(next) }
    })
  }
  const addStage = () => setSpec(prev => {
    const next = [...prev.stages, { seq: prev.stages.length + 1, description: '', amount: 0 }]
    return { ...prev, stages: next, total: stagesTotal(next) }
  })
  const removeStage = (idx: number) => setSpec(prev => {
    const next = prev.stages.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 }))
    return { ...prev, stages: next, total: stagesTotal(next) }
  })

  // بناء المواصفات النهائية للحفظ/الطباعة (النطاق من النص، الإجمالي محسوب)
  const finalSpec = (): ContractSpec => {
    const scopeItems = scopeText.split('\n').map(l => l.trim()).filter(Boolean)
    const stagesClean = spec.stages.map((s, i) => ({ seq: i + 1, description: s.description.trim(), amount: Number(s.amount) || 0 }))
    return { ...spec, scopeItems, stages: stagesClean, total: stagesTotal(stagesClean) }
  }

  // ─── الحفظ (إنشاء/تعديل الإسناد + المراحل) ──────────────────────────
  const validate = (s: ContractSpec): string | null => {
    if (!s.sub.name.trim()) return 'اسم مقاول الباطن مطلوب'
    if (!s.siteLocation.trim()) return 'الموقع (السايت) مطلوب'
    if (s.stages.length === 0) return 'أضف مرحلة دفع واحدة على الأقل'
    if (s.total <= 0) return 'إجمالي العقد يجب أن يكون أكبر من صفر'
    return null
  }

  const handleSave = async () => {
    const s = finalSpec()
    const err = validate(s)
    if (err) { toast.error(err); return }
    setSaving(true)
    try {
      const project = projects.find(p => p.id === projectId)
      const payload = {
        subcontractor_id: id,
        project_id: projectId || null,
        project_name: project?.project_name ?? '',
        scope: `${TRADE_LABELS[s.trade].ar} — ${BUILDING_LABELS[s.buildingType]} @ ${s.siteLocation}`,
        agreed_amount: s.total,
        start_date: s.contractDate || null,
        contract_spec: s,
        contract_trade: s.trade,
        building_type: s.buildingType,
        branch_no: s.branchNo,
      }

      if (isEdit && assignmentId) {
        const { error } = await supabase.from('subcontractor_assignments').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', assignmentId)
        if (error) throw error
        // نعيد بناء المراحل فقط إذا لم تُدفع أي مرحلة (حماية الربط المالي)
        if (!anyPaid) {
          await supabase.from('subcontractor_stages').delete().eq('assignment_id', assignmentId)
          const rows = s.stages.map(st => ({ assignment_id: assignmentId, seq: st.seq, description: st.description, amount: st.amount, status: 'pending' }))
          if (rows.length) { const { error: e2 } = await supabase.from('subcontractor_stages').insert(rows); if (e2) throw e2 }
        } else {
          // مراحل مدفوعة موجودة — نحدّث النصوص/المبالغ للمراحل المعلّقة فقط
          await Promise.all(stages.filter(st => st.status === 'pending').map((st, i) => {
            const src = s.stages[i]
            return src ? supabase.from('subcontractor_stages').update({ description: src.description, amount: src.amount }).eq('id', st.id) : Promise.resolve()
          }))
        }
        toast.success('تم حفظ العقد')
      } else {
        const { data, error } = await supabase.from('subcontractor_assignments').insert({ ...payload, status: 'active', paid_amount: 0 }).select('id').single()
        if (error) throw error
        const newId = (data as { id: string }).id
        const rows = s.stages.map(st => ({ assignment_id: newId, seq: st.seq, description: st.description, amount: st.amount, status: 'pending' }))
        if (rows.length) { const { error: e2 } = await supabase.from('subcontractor_stages').insert(rows); if (e2) throw e2 }
        toast.success('تم إنشاء العقد')
        qc.invalidateQueries()
        navigate(`/subcontractors/${id}/contract/${newId}`, { replace: true })
        return
      }
      qc.invalidateQueries()
      // نعيد تحميل المراحل بعد الحفظ
      const { data: st } = await supabase.from('subcontractor_stages').select('id, seq, description, amount, status, payment_id, paid_date').eq('assignment_id', assignmentId!).order('seq')
      setStages(((st ?? []) as StageRow[]).map(x => ({ ...x, amount: Number(x.amount) || 0, seq: Number(x.seq) || 0 })))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // ─── الربط المالي: تسجيل دفع مرحلة → إنشاء مصروف فعلي ────────────────
  const confirmPayStage = async () => {
    if (!payStage || !assignmentId || !id) return
    if (payForm.payment_method === 'cheque' && !payForm.check_due_date) {
      toast.error('أدخل تاريخ استحقاق الشيك (وإلا يُحتسب مصروفاً فورياً)')
      return
    }
    setBusyStage(payStage.id)
    try {
      const { data, error } = await supabase.from('subcontractor_payments').insert({
        assignment_id: assignmentId,
        subcontractor_id: id,
        project_id: projectId || null,
        amount: payStage.amount,
        payment_date: payForm.payment_date || todayLocal(),
        payment_method: payForm.payment_method,
        check_due_date: payForm.payment_method === 'cheque' ? (payForm.check_due_date || null) : null,
        check_number: payForm.payment_method === 'cheque' ? payForm.check_number : '',
        notes: `دفعة مرحلة ${payStage.seq}: ${payStage.description}`,
      }).select('id').single()
      if (error) throw error
      const paymentId = (data as { id: string }).id
      const { error: e2 } = await supabase.from('subcontractor_stages')
        .update({ status: 'paid', payment_id: paymentId, paid_date: payForm.payment_date || todayLocal(), updated_at: new Date().toISOString() })
        .eq('id', payStage.id)
      if (e2) throw e2
      // تحديث إجمالي المدفوع على الإسناد
      const newPaid = stages.filter(s => s.status === 'paid').reduce((sum, s) => sum + s.amount, 0) + payStage.amount
      await supabase.from('subcontractor_assignments').update({ paid_amount: newPaid }).eq('id', assignmentId)

      setStages(prev => prev.map(s => s.id === payStage.id ? { ...s, status: 'paid', payment_id: paymentId, paid_date: payForm.payment_date || todayLocal() } : s))
      qc.invalidateQueries()
      toast.success('سُجّلت الدفعة كمصروف على المشروع')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر تسجيل الدفعة')
    } finally {
      setBusyStage(null)
      setPayStage(null)
      setPayForm({ payment_date: todayLocal(), payment_method: 'cash', check_due_date: '', check_number: '' })
    }
  }

  const confirmUnpay = async () => {
    if (!unpayStage || !assignmentId) return
    setBusyStage(unpayStage.id)
    try {
      if (unpayStage.payment_id) {
        const { error } = await supabase.from('subcontractor_payments').delete().eq('id', unpayStage.payment_id)
        if (error) throw error
      }
      const { error: e2 } = await supabase.from('subcontractor_stages')
        .update({ status: 'pending', payment_id: null, paid_date: null, updated_at: new Date().toISOString() })
        .eq('id', unpayStage.id)
      if (e2) throw e2
      const newPaid = stages.filter(s => s.status === 'paid' && s.id !== unpayStage.id).reduce((sum, s) => sum + s.amount, 0)
      await supabase.from('subcontractor_assignments').update({ paid_amount: newPaid }).eq('id', assignmentId)

      setStages(prev => prev.map(s => s.id === unpayStage.id ? { ...s, status: 'pending', payment_id: null, paid_date: null } : s))
      qc.invalidateQueries()
      toast.success('تم التراجع عن الدفعة وحذف المصروف')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر التراجع')
    } finally {
      setBusyStage(null)
      setUnpayStage(null)
    }
  }

  // ─── الطباعة ─────────────────────────────────────────────────────────
  const preview = () => openPreviewWindow(buildContractHTML(finalSpec()))
  const print = () => openPrintWindow(buildContractHTML(finalSpec()))

  if (loading) return <div className="p-6 text-center text-slate-400" dir="rtl">جاري التحميل...</div>

  const paidTotal = stages.filter(s => s.status === 'paid').reduce((s, x) => s + x.amount, 0)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
        <button onClick={() => navigate(`/subcontractors/${id}`)} className="hover:text-slate-700">مقاول الباطن</button>
        <ChevronRight size={16} className="rotate-180" />
        <span className="text-slate-700 font-medium">{isEdit ? 'عقد المقاول' : 'عقد جديد'}</span>
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <FileSignature size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">عقد مقاول باطن احترافي</h1>
            <p className="text-sm text-slate-500">{TRADE_LABELS[spec.trade].ar} — {BUILDING_LABELS[spec.buildingType]}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Eye size={16} />} onClick={preview}>معاينة</Button>
          <Button variant="secondary" icon={<Printer size={16} />} onClick={print}>طباعة</Button>
          <Button icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} onClick={handleSave} disabled={saving}>
            {isEdit ? 'حفظ' : 'إنشاء العقد'}
          </Button>
        </div>
      </div>

      {/* بيانات العقد */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <h2 className="font-semibold text-slate-700 mb-4">بيانات العقد</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label="نوع العمل" value={spec.trade} onChange={e => changeTrade(e.target.value as TradeKey)} options={TRADE_OPTS} disabled={anyPaid} hint={anyPaid ? 'مقفل — توجد مراحل مدفوعة' : undefined} />
          <Select label="الفرع (اسم الشركة)" value={String(spec.branchNo)} onChange={e => changeBranch(Number(e.target.value))} options={BRANCH_OPTS} />
          <Select label="نوع المبنى" value={spec.buildingType} onChange={e => patch({ buildingType: e.target.value as BuildingKey })} options={BUILDING_OPTS} />
          <Input label="تاريخ العقد" type="date" value={spec.contractDate} onChange={e => patch({ contractDate: e.target.value })} />
          <Select label="المشروع المرتبط" value={projectId} onChange={e => changeProject(e.target.value)} options={projects.map(p => ({ value: p.id, label: p.project_name }))} placeholder="بدون ربط" />
          <Input label="الموقع (السايت)" value={spec.siteLocation} onChange={e => patch({ siteLocation: e.target.value })} placeholder="مثال: سترة / بوقوة" />
        </div>
      </div>

      {/* بيانات مقاول الباطن */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <h2 className="font-semibold text-slate-700 mb-4">الطرف الثاني — مقاول الباطن</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="الاسم / الشركة" value={spec.sub.name} onChange={e => patchSub({ name: e.target.value })} dir="ltr" />
          <Input label="السجل التجاري C.R." value={spec.sub.cr} onChange={e => patchSub({ cr: e.target.value })} dir="ltr" />
          <Input label="الرقم الشخصي C.P.R." value={spec.sub.cpr} onChange={e => patchSub({ cpr: e.target.value })} dir="ltr" />
          <Input label="الهاتف" value={spec.sub.tel} onChange={e => patchSub({ tel: e.target.value })} dir="ltr" />
          <div className="md:col-span-2">
            <Input label="العنوان" value={spec.sub.address} onChange={e => patchSub({ address: e.target.value })} dir="ltr" />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">يُملأ تلقائياً من سجلّ المقاول؛ عدّله هنا إن لزم — التعديل هنا يخصّ هذا العقد فقط.</p>
      </div>

      {/* الطرف الأول — للتوثيق */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <h2 className="font-semibold text-slate-700 mb-4">الطرف الأول — المقاول الرئيسي</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="اسم الشركة" value={spec.main.name} onChange={e => patchMain({ name: e.target.value })} dir="ltr" />
          <Input label="السجل التجاري C.R." value={spec.main.cr} onChange={e => patchMain({ cr: e.target.value })} dir="ltr" />
          <Input label="الهاتف" value={spec.main.tel} onChange={e => patchMain({ tel: e.target.value })} dir="ltr" />
          <Input label="البريد" value={spec.main.email} onChange={e => patchMain({ email: e.target.value })} dir="ltr" />
          <div className="md:col-span-2">
            <Input label="العنوان" value={spec.main.address} onChange={e => patchMain({ address: e.target.value })} dir="ltr" />
          </div>
        </div>
      </div>

      {/* بنود قابلة للتعديل */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <h2 className="font-semibold text-slate-700 mb-4">بنود قابلة للتعديل</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="مدة الضمان (شهر)" type="number" value={String(spec.warrantyMonths)} onChange={e => patch({ warrantyMonths: Number(e.target.value) || 0 })} dir="ltr" />
          <Input label="غرامة التأخير/يوم (د.ب)" type="number" value={String(spec.delayPenaltyPerDay)} onChange={e => patch({ delayPenaltyPerDay: Number(e.target.value) || 0 })} dir="ltr" />
          <div className="grid grid-cols-2 gap-2">
            <Input label="نقاط مجانية (من)" type="number" value={String(spec.additionalPointsMin)} onChange={e => patch({ additionalPointsMin: Number(e.target.value) || 0 })} dir="ltr" />
            <Input label="(إلى)" type="number" value={String(spec.additionalPointsMax)} onChange={e => patch({ additionalPointsMax: Number(e.target.value) || 0 })} dir="ltr" />
          </div>
        </div>
        <div className="mt-4">
          <Textarea label="نطاق العمل (كل سطر = بند)" value={scopeText} onChange={e => setScopeText(e.target.value)} rows={7} dir="ltr" />
        </div>
      </div>

      {/* جدول المراحل */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-700">جدول الدفعات (المراحل)</h2>
          {!anyPaid && <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addStage}>مرحلة</Button>}
        </div>
        {anyPaid && (
          <div className="mb-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
            توجد مراحل مدفوعة — جدول المبالغ مقفل جزئياً لحماية الربط المالي. يمكنك تعديل نصوص/مبالغ المراحل غير المدفوعة فقط.
          </div>
        )}
        <div className="space-y-2">
          {spec.stages.map((st, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-6 text-center text-sm text-slate-400">{idx + 1}</span>
              <input
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                value={st.description} onChange={e => setStageField(idx, 'description', e.target.value)} dir="ltr" placeholder="Stage description"
              />
              <input
                type="number" step="0.001"
                className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-amber-200"
                value={String(st.amount)} onChange={e => setStageField(idx, 'amount', e.target.value)} dir="ltr"
              />
              {!anyPaid && (
                <button onClick={() => removeStage(idx)} className="text-red-400 hover:text-red-600 p-1" aria-label="حذف">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100">
          <span className="text-sm text-slate-500">الإجمالي المحسوب</span>
          <span className="text-lg font-bold text-amber-700">{formatCurrency(liveTotal)}</span>
        </div>
      </div>

      {/* لوحة الحالة المالية + تسجيل الدفعات (عند التعديل فقط) */}
      {isEdit && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
          <h2 className="font-semibold text-slate-700 mb-1">الربط المالي — دفعات المراحل</h2>
          <p className="text-xs text-slate-400 mb-4">كل ضغطة «تم الدفع» تُنشئ مصروفاً فعلياً على المشروع تلقائياً. «تراجع» يحذف ذلك المصروف.</p>
          <div className="grid grid-cols-3 gap-3 mb-4 text-center">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-xs text-slate-500">إجمالي العقد</div>
              <div className="font-bold text-slate-700">{formatCurrency(Number(spec.total))}</div>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <div className="text-xs text-green-700">مدفوع (مصروف فعلي)</div>
              <div className="font-bold text-green-700">{formatCurrency(paidTotal)}</div>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <div className="text-xs text-amber-700">متبقٍ (التزام)</div>
              <div className="font-bold text-amber-700">{formatCurrency(Math.max(0, Number(spec.total) - paidTotal))}</div>
            </div>
          </div>
          {stages.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-3">احفظ العقد أولاً لإنشاء المراحل.</div>
          ) : (
            <div className="space-y-2">
              {stages.map(st => (
                <div key={st.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${st.status === 'paid' ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="w-6 text-center text-sm text-slate-400">{st.seq}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700 truncate" dir="ltr">{st.description}</div>
                    {st.status === 'paid' && st.paid_date && <div className="text-xs text-green-600">دُفع في {formatDate(st.paid_date)}</div>}
                  </div>
                  <span className="text-sm font-medium text-slate-700">{formatCurrency(st.amount)}</span>
                  {st.status === 'paid' ? (
                    <button onClick={() => setUnpayStage(st)} disabled={busyStage === st.id}
                      className="text-xs flex items-center gap-1 text-slate-500 hover:text-red-600 disabled:opacity-50">
                      {busyStage === st.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} تراجع
                    </button>
                  ) : (
                    <button onClick={() => { setPayStage(st); setPayForm({ payment_date: todayLocal(), payment_method: 'cash', check_due_date: '', check_number: '' }) }} disabled={busyStage === st.id}
                      className="text-xs flex items-center gap-1 text-green-600 hover:text-green-700 disabled:opacity-50 font-medium">
                      <CheckCircle2 size={15} /> تم الدفع
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* حوار تسجيل دفع مرحلة */}
      {payStage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPayStage(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()} dir="rtl">
            <h3 className="font-bold text-slate-800 mb-1">تسجيل دفع المرحلة {payStage.seq}</h3>
            <p className="text-sm text-slate-500 mb-4">{formatCurrency(payStage.amount)} — {payStage.description}</p>
            <div className="space-y-3">
              <Input label="تاريخ الدفع" type="date" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} />
              <Select label="طريقة الدفع" value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))} options={PAY_METHODS} />
              {payForm.payment_method === 'cheque' && (
                <div className="grid grid-cols-2 gap-3">
                  <Input label="تاريخ استحقاق الشيك" type="date" value={payForm.check_due_date} onChange={e => setPayForm(f => ({ ...f, check_due_date: e.target.value }))} />
                  <Input label="رقم الشيك" value={payForm.check_number} onChange={e => setPayForm(f => ({ ...f, check_number: e.target.value }))} dir="ltr" />
                </div>
              )}
              {payForm.payment_method === 'cheque' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  الشيك الآجل لا يُحتسب مصروفاً إلا بعد حلول تاريخ استحقاقه (نفس منطق النظام).
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <Button variant="secondary" onClick={() => setPayStage(null)}>إلغاء</Button>
              <Button onClick={confirmPayStage} disabled={busyStage === payStage.id} icon={busyStage === payStage.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}>تأكيد الدفع</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!unpayStage}
        title="التراجع عن الدفعة"
        message="سيُحذف المصروف المرتبط بهذه المرحلة من المشروع، وتعود المرحلة إلى «معلّقة». هل أنت متأكد؟"
        confirmLabel="تراجع وحذف المصروف"
        onConfirm={confirmUnpay}
        onCancel={() => setUnpayStage(null)}
      />
    </div>
  )
}
