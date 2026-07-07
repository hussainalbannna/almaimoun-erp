import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Eye, Pencil, Trash2, X, Banknote, ShieldCheck,
  AlertTriangle, CheckCircle2, Undo2, Ban, Landmark, CalendarClock,
  FileText, Image as ImageIcon, Link2, RotateCcw
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '../../lib/utils'
import { compressImage, fileToDataUrl, openStoredFile } from '../../lib/ai'
import { uploadDataUrl, resolveAttachmentUrl, deleteAttachment, isDataUrl } from '../../lib/storage'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// ════════════════════════════════════════════════════════════════════
//  مركز الشيكات — إدارة موحّدة لكل شيكات المؤسسة
//  آجلة + ضمان | صادرة + واردة | تسوية / ارتداد / استرجاع
//  جدول cheques هو مصدر الحقيقة — يتغذّى تلقائياً من المشتريات والباطن
//
//  الأداء والتخزين:
//  - القائمة تجلب أعمدة خفيفة فقط (بلا cheque_image_data الثقيل) —
//    عمود has_image المولَّد في قاعدة البيانات يكشف وجود الصورة.
//  - صورة الشيك تُجلب عند الطلب فقط (فتح العرض/التعديل).
//  - الصور الجديدة تُرفع إلى Supabase Storage ويُحفظ مسارها القصير،
//    مع توافق خلفي كامل للسجلّات القديمة المخزَّنة base64.
// ════════════════════════════════════════════════════════════════════

interface Cheque {
  id: string
  cheque_number: string
  direction: 'outgoing' | 'incoming'
  cheque_type: 'deferred' | 'guarantee' | 'current'
  party_type: string
  party_name: string
  amount: number
  bank_name: string
  issue_date: string | null
  due_date: string | null
  status: 'pending' | 'cleared' | 'bounced' | 'returned' | 'cancelled'
  cleared_date: string | null
  project_id: string | null
  project_name: string
  related_type: string
  related_id: string | null
  has_image: boolean
  notes: string
  created_at: string
}

interface ProjectOpt { id: string; project_name: string }

type Tab = 'action' | 'pending' | 'guarantee' | 'all'

const TYPE_LABELS: Record<string, string> = {
  deferred: 'آجل',
  guarantee: 'ضمان',
  current: 'حالي',
}
const DIRECTION_LABELS: Record<string, string> = {
  outgoing: 'صادر',
  incoming: 'وارد',
}
const PARTY_LABELS: Record<string, string> = {
  supplier: 'مورد',
  customer: 'عميل',
  subcontractor: 'مقاول باطن',
  landlord: 'مؤجّر',
  other: 'أخرى',
}
const STATUS_META: Record<string, { label: string; color: 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'purple' }> = {
  pending: { label: 'معلّق', color: 'amber' },
  cleared: { label: 'صُرف', color: 'green' },
  bounced: { label: 'مرتد', color: 'red' },
  returned: { label: 'مسترجع', color: 'blue' },
  cancelled: { label: 'ملغى', color: 'gray' },
}
const SOURCE_LABELS: Record<string, string> = {
  purchase_invoice: 'فاتورة شراء',
  subcontractor_payment: 'دفعة مقاول باطن',
  manual: 'مُدخل يدوياً',
}

const emptyForm = {
  cheque_number: '',
  direction: 'outgoing' as Cheque['direction'],
  cheque_type: 'deferred' as Cheque['cheque_type'],
  party_type: 'supplier',
  party_name: '',
  amount: '',
  bank_name: '',
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: '',
  project_id: '',
  cheque_image_data: '',
  notes: '',
}

// الأعمدة الخفيفة للقائمة — بلا cheque_image_data (كان يضخّم الرد ويبطئ التحميل)
const LIGHT_COLUMNS =
  'id, cheque_number, direction, cheque_type, party_type, party_name, amount, bank_name, '
  + 'issue_date, due_date, status, cleared_date, project_id, project_name, related_type, '
  + 'related_id, has_image, notes, created_at'

// جلب الشيكات ('cheques' — مفتاح مشترك) وقائمة المشاريع (مصادر React Query)
async function fetchAllCheques(): Promise<Cheque[]> {
  const { data } = await supabase.from('cheques').select(LIGHT_COLUMNS).order('due_date', { ascending: true, nullsFirst: false })
  return (data ?? []) as unknown as Cheque[]
}
async function fetchProjectsList(): Promise<ProjectOpt[]> {
  const { data } = await supabase.from('projects').select('id, project_name').order('project_name')
  return (data ?? []) as ProjectOpt[]
}
// جلب صورة شيك واحد عند الطلب فقط — قد تكون مسار Storage أو base64 قديم
async function fetchChequeImage(id: string): Promise<string> {
  const { data } = await supabase.from('cheques').select('cheque_image_data').eq('id', id).maybeSingle()
  return (data?.cheque_image_data as string | undefined) ?? ''
}

// هل القيمة/الرابط يشير إلى ملف PDF؟ (يشمل الروابط الموقّعة من Storage)
const isPdfValue = (v: string) => v.startsWith('data:application/pdf') || /\.pdf($|\?)/i.test(v)

export default function ChequesCenter() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('action')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  // القيمة الأصلية لصورة الشيك عند فتح التعديل — لتنظيف Storage عند الاستبدال/الإزالة
  const originalImageRef = useRef('')

  const [viewCheque, setViewCheque] = useState<Cheque | null>(null)
  // صورة مودال العرض تُجلب وتُحلّ (رابط موقّع/‏base64 قديم) عند الطلب فقط
  const [viewImage, setViewImage] = useState<{ loading: boolean; url: string | null }>({ loading: false, url: null })
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // مودال التسوية (صُرف بتاريخ فعلي)
  const [clearTarget, setClearTarget] = useState<Cheque | null>(null)
  const [clearDate, setClearDate] = useState(new Date().toISOString().slice(0, 10))

  const t = new Date().toISOString().slice(0, 10)

  const { data: cheques = [], isLoading } = useQuery({ queryKey: ['cheques'], queryFn: fetchAllCheques })
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: fetchProjectsList })
  // أي تعديل على الشيكات يُبطِل المفتاح فيتحدّث كل مستهلِك له تلقائياً
  const reload = () => queryClient.invalidateQueries({ queryKey: ['cheques'] })

  // ─── إحصائيات البطاقات ───────────────────────────────────────────
  const stats = useMemo(() => {
    let pendingCount = 0, pendingTotal = 0
    let due7Count = 0, due7Total = 0
    let overdueCount = 0, overdueTotal = 0
    let guaranteeCount = 0, guaranteeTotal = 0
    let bouncedCount = 0
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    for (const c of cheques) {
      if (c.status === 'bounced') bouncedCount++
      if (c.status !== 'pending') continue
      const amt = Number(c.amount || 0)
      if (c.cheque_type === 'guarantee') { guaranteeCount++; guaranteeTotal += amt; continue }
      pendingCount++; pendingTotal += amt
      if (c.due_date && c.due_date < t) { overdueCount++; overdueTotal += amt }
      else if (c.due_date && c.due_date <= in7) { due7Count++; due7Total += amt }
    }
    return { pendingCount, pendingTotal, due7Count, due7Total, overdueCount, overdueTotal, guaranteeCount, guaranteeTotal, bouncedCount }
  }, [cheques, t])

  // ─── الفلترة حسب التبويب والبحث ─────────────────────────────────
  const filtered = useMemo(() => {
    let list = cheques
    if (tab === 'action') {
      // تحتاج إجراء: معلّقة واستحق تاريخها (تسوية) + المرتدة (متابعة)
      list = list.filter(c =>
        (c.status === 'pending' && c.cheque_type !== 'guarantee' && c.due_date && c.due_date <= t)
        || c.status === 'bounced'
      )
    } else if (tab === 'pending') {
      list = list.filter(c => c.status === 'pending' && c.cheque_type !== 'guarantee')
    } else if (tab === 'guarantee') {
      list = list.filter(c => c.cheque_type === 'guarantee')
    }
    if (projectFilter) list = list.filter(c => c.project_id === projectFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.party_name.toLowerCase().includes(q)
        || c.cheque_number.toLowerCase().includes(q)
        || c.bank_name.toLowerCase().includes(q)
        || c.project_name.toLowerCase().includes(q)
      )
    }
    return list
  }, [cheques, tab, search, projectFilter, t])

  // ─── فتح المرفقات (توافق خلفي كامل) ──────────────────────────────
  // Data URL قديم → يُفتح مباشرة | مسار Storage → رابط موقّع في تبويب جديد
  const openAttachmentValue = async (value: string) => {
    if (!value) return
    if (isDataUrl(value)) { openStoredFile(value); return }
    const url = value.startsWith('http') ? value : await resolveAttachmentUrl(value)
    if (url) window.open(url, '_blank', 'noopener')
    else toast.error('تعذّر فتح المرفق')
  }

  // ─── حفظ (إضافة / تعديل يدوي) ────────────────────────────────────
  const openNew = () => {
    setEditingId(null)
    originalImageRef.current = ''
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = async (c: Cheque) => {
    setEditingId(c.id)
    originalImageRef.current = ''
    setForm({
      cheque_number: c.cheque_number,
      direction: c.direction,
      cheque_type: c.cheque_type,
      party_type: c.party_type,
      party_name: c.party_name,
      amount: String(c.amount || ''),
      bank_name: c.bank_name,
      issue_date: c.issue_date ?? new Date().toISOString().slice(0, 10),
      due_date: c.due_date ?? '',
      project_id: c.project_id ?? '',
      cheque_image_data: '',
      notes: c.notes,
    })
    setShowForm(true)
    // الصورة تُجلب عند الطلب — لا تُحمَّل ضمن القائمة إطلاقاً
    if (c.has_image) {
      const raw = await fetchChequeImage(c.id)
      originalImageRef.current = raw
      setForm(f => ({ ...f, cheque_image_data: raw }))
    }
  }

  const handleSave = async () => {
    if (!form.party_name.trim()) { toast.error('أدخل اسم الجهة'); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { toast.error('أدخل مبلغ الشيك'); return }
    if (form.cheque_type === 'deferred' && !form.due_date) { toast.error('أدخل تاريخ استحقاق الشيك الآجل'); return }
    setSaving(true)
    try {
      // الصور الجديدة (Data URL) تُرفع إلى Storage ويُحفظ المسار القصير فقط
      let imageValue = form.cheque_image_data
      if (imageValue && isDataUrl(imageValue)) {
        imageValue = await uploadDataUrl(imageValue, 'cheques')
      }

      const projectName = projects.find(p => p.id === form.project_id)?.project_name ?? ''
      const payload = {
        cheque_number: form.cheque_number.trim(),
        direction: form.direction,
        cheque_type: form.cheque_type,
        party_type: form.party_type,
        party_name: form.party_name.trim(),
        amount: amt,
        bank_name: form.bank_name.trim(),
        issue_date: form.issue_date || null,
        due_date: form.due_date || null,
        project_id: form.project_id || null,
        project_name: projectName,
        cheque_image_data: imageValue,
        notes: form.notes,
        updated_at: new Date().toISOString(),
      }
      if (editingId) {
        const { error } = await supabase.from('cheques').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success('تم تحديث الشيك')
      } else {
        const { error } = await supabase.from('cheques').insert({ ...payload, related_type: 'manual', status: 'pending' })
        if (error) throw error
        toast.success('تم تسجيل الشيك')
      }

      // تنظيف Storage: إن استُبدلت الصورة القديمة أو أُزيلت، احذف ملفها (دون تعطيل الحفظ)
      const old = originalImageRef.current
      if (old && !isDataUrl(old) && old !== imageValue) {
        deleteAttachment(old).catch(() => { /* تنظيف اختياري — لا يؤثر على العملية */ })
      }

      setShowForm(false)
      reload()
    } catch (e) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  // ─── تغيير الحالة ────────────────────────────────────────────────
  const updateStatus = async (c: Cheque, status: Cheque['status'], clearedDate?: string) => {
    const { error } = await supabase.from('cheques').update({
      status,
      cleared_date: status === 'cleared' ? (clearedDate ?? t) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', c.id)
    if (error) { toast.error('تعذّر تحديث الحالة'); return }
    const msg: Record<string, string> = {
      cleared: 'تم تسجيل صرف الشيك',
      bounced: 'تم تسجيل ارتداد الشيك',
      returned: 'تم تسجيل استرجاع شيك الضمان',
      cancelled: 'تم إلغاء الشيك',
      pending: 'أُعيد الشيك إلى معلّق',
    }
    toast.success(msg[status])
    setClearTarget(null)
    closeView()
    reload()
  }

  // ─── حذف (اليدوي فقط) ────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    const target = cheques.find(c => c.id === deleteId)
    if (target && target.related_type !== 'manual') {
      toast.error('هذا الشيك مرتبط بمصدر — عدّله أو احذفه من الفاتورة الأصلية')
      setDeleteId(null)
      return
    }
    // نقرأ مسار الصورة قبل حذف الصف لتنظيف ملفها من Storage بعد الحذف
    const oldImage = target?.has_image ? await fetchChequeImage(deleteId) : ''
    const { error } = await supabase.from('cheques').delete().eq('id', deleteId)
    if (error) { toast.error('تعذّر الحذف'); return }
    if (oldImage && !isDataUrl(oldImage)) {
      deleteAttachment(oldImage).catch(() => { /* تنظيف اختياري */ })
    }
    toast.success('تم حذف الشيك')
    setDeleteId(null)
    reload()
  }

  // ─── صورة الشيك ──────────────────────────────────────────────────
  const handleImageUpload = async (file: File) => {
    try {
      // تُضغط وتبقى Data URL للمعاينة الفورية — الرفع الفعلي إلى Storage يتم عند الحفظ
      const data = file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)
      setForm(f => ({ ...f, cheque_image_data: data }))
      toast.success('تم إرفاق صورة الشيك')
    } catch {
      toast.error('تعذّر قراءة الملف')
    }
  }

  // ─── عرض التفاصيل (الصورة تُجلب عند الفتح فقط) ───────────────────
  const openView = async (c: Cheque) => {
    setViewCheque(c)
    if (!c.has_image) { setViewImage({ loading: false, url: null }); return }
    setViewImage({ loading: true, url: null })
    const raw = await fetchChequeImage(c.id)
    const url = await resolveAttachmentUrl(raw)
    setViewImage({ loading: false, url })
  }
  const closeView = () => {
    setViewCheque(null)
    setViewImage({ loading: false, url: null })
  }

  const isLinked = (c: Cheque) => c.related_type !== 'manual'

  const dueBadge = (c: Cheque) => {
    if (!c.due_date || c.status !== 'pending' || c.cheque_type === 'guarantee') return null
    const d = daysUntil(c.due_date)
    if (d === null) return null
    if (d < 0) return <span className="text-[11px] text-red-600 font-bold">متأخر {Math.abs(d)} يوم</span>
    if (d === 0) return <span className="text-[11px] text-red-600 font-bold">يستحق اليوم</span>
    if (d <= 7) return <span className="text-[11px] text-amber-600 font-medium">بعد {d} أيام</span>
    return null
  }

  const TABS: { key: Tab; label: string; count: number }[] = useMemo(() => [
    { key: 'action', label: 'تحتاج إجراء', count: cheques.filter(c => (c.status === 'pending' && c.cheque_type !== 'guarantee' && c.due_date && c.due_date <= t) || c.status === 'bounced').length },
    { key: 'pending', label: 'معلّقة (آجلة)', count: stats.pendingCount },
    { key: 'guarantee', label: 'شيكات الضمان', count: cheques.filter(c => c.cheque_type === 'guarantee').length },
    { key: 'all', label: 'السجل الكامل', count: cheques.length },
  ], [cheques, stats.pendingCount, t])

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8f 100%)' }}>
            <Banknote size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">مركز الشيكات</h1>
            <p className="text-sm text-slate-500">آجلة، ضمان، تسوية — كل الشيكات في مكان واحد</p>
          </div>
        </div>
        <Button icon={<Plus size={16} />} onClick={openNew}>تسجيل شيك</Button>
      </div>

      {/* البطاقات الإحصائية */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><CalendarClock size={14} /> شيكات معلّقة (آجلة)</div>
          <div className="text-lg font-bold text-slate-800">{formatCurrency(stats.pendingTotal)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{stats.pendingCount} شيك — التزام قادم</div>
        </div>
        <div className={`rounded-xl border p-4 ${stats.overdueCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><AlertTriangle size={14} className={stats.overdueCount > 0 ? 'text-red-500' : ''} /> استحقت وتحتاج تسوية</div>
          <div className={`text-lg font-bold ${stats.overdueCount > 0 ? 'text-red-700' : 'text-slate-800'}`}>{formatCurrency(stats.overdueTotal)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{stats.overdueCount} شيك — أكّد الصرف أو الارتداد</div>
        </div>
        <div className={`rounded-xl border p-4 ${stats.due7Count > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><Landmark size={14} className={stats.due7Count > 0 ? 'text-amber-500' : ''} /> تستحق خلال 7 أيام</div>
          <div className="text-lg font-bold text-slate-800">{formatCurrency(stats.due7Total)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{stats.due7Count} شيك — جهّز السيولة</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><ShieldCheck size={14} /> شيكات ضمان قائمة</div>
          <div className="text-lg font-bold text-slate-800">{formatCurrency(stats.guaranteeTotal)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{stats.guaranteeCount} شيك — التزام محتمل</div>
        </div>
      </div>

      {/* التبويبات */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${tab === tb.key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {tb.label}
            <span className={`text-[11px] px-1.5 rounded-full ${tab === tb.key ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-500'}`}>{tb.count}</span>
          </button>
        ))}
      </div>

      {/* البحث والفلاتر */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="بحث بالجهة أو رقم الشيك أو البنك..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <div className="w-52">
          <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            placeholder="كل المشاريع"
            options={[{ value: '', label: 'كل المشاريع' }, ...projects.map(p => ({ value: p.id, label: p.project_name }))]} />
        </div>
      </div>

      {/* الجدول */}
      {isLoading ? (
        <div className="text-center text-slate-400 py-12">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Banknote size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">{tab === 'action' ? 'لا توجد شيكات تحتاج إجراء — ممتاز' : 'لا توجد شيكات هنا'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-right font-medium px-4 py-3">الشيك</th>
                  <th className="text-right font-medium px-4 py-3">الجهة</th>
                  <th className="text-right font-medium px-4 py-3">المشروع</th>
                  <th className="text-right font-medium px-4 py-3">المبلغ</th>
                  <th className="text-right font-medium px-4 py-3">الاستحقاق</th>
                  <th className="text-right font-medium px-4 py-3">الحالة</th>
                  <th className="text-center font-medium px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {c.cheque_type === 'guarantee'
                          ? <ShieldCheck size={15} className="text-blue-500 shrink-0" />
                          : <Banknote size={15} className="text-slate-400 shrink-0" />}
                        <div>
                          <div className="font-medium text-slate-800">
                            {c.cheque_number ? `شيك ${c.cheque_number}` : `${TYPE_LABELS[c.cheque_type]} ${DIRECTION_LABELS[c.direction]}`}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            {TYPE_LABELS[c.cheque_type]} · {DIRECTION_LABELS[c.direction]}
                            {c.bank_name ? ` · ${c.bank_name}` : ''}
                            {isLinked(c) && <span className="inline-flex items-center gap-0.5 text-blue-500"><Link2 size={10} /> {SOURCE_LABELS[c.related_type] ?? c.related_type}</span>}
                            {c.has_image && <ImageIcon size={11} className="text-slate-400" />}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">{c.party_name || '—'}</div>
                      <div className="text-[11px] text-slate-400">{PARTY_LABELS[c.party_type] ?? c.party_type}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.project_name || '—'}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{formatCurrency(Number(c.amount))}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-600">{c.due_date ? formatDate(c.due_date) : '—'}</div>
                      {dueBadge(c)}
                      {c.status === 'cleared' && c.cleared_date && (
                        <div className="text-[11px] text-green-600">صُرف {formatDate(c.cleared_date)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={STATUS_META[c.status]?.color ?? 'gray'}>{STATUS_META[c.status]?.label ?? c.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {c.status === 'pending' && c.cheque_type !== 'guarantee' && (
                          <button onClick={() => { setClearTarget(c); setClearDate(c.due_date && c.due_date <= t ? c.due_date : t) }}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="تسوية — صُرف">
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        {c.status === 'pending' && c.cheque_type === 'guarantee' && (
                          <button onClick={() => updateStatus(c, 'returned')}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="استرجاع شيك الضمان">
                            <Undo2 size={16} />
                          </button>
                        )}
                        {c.status === 'pending' && (
                          <button onClick={() => updateStatus(c, 'bounced')}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="ارتداد الشيك">
                            <Ban size={16} />
                          </button>
                        )}
                        {c.status !== 'pending' && (
                          <button onClick={() => updateStatus(c, 'pending')}
                            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" title="إعادة إلى معلّق">
                            <RotateCcw size={16} />
                          </button>
                        )}
                        <button onClick={() => openView(c)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="عرض">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="تعديل">
                          <Pencil size={16} />
                        </button>
                        {!isLinked(c) && (
                          <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="حذف">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ مودال التسوية ═══ */}
      {clearTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setClearTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-600" />
              <h3 className="font-bold text-slate-800">تسوية الشيك — تأكيد الصرف</h3>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">الجهة</span><span className="font-medium text-slate-700">{clearTarget.party_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">المبلغ</span><span className="font-bold text-slate-800">{formatCurrency(Number(clearTarget.amount))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">الاستحقاق</span><span className="text-slate-700">{clearTarget.due_date ? formatDate(clearTarget.due_date) : '—'}</span></div>
            </div>
            <Input label="تاريخ الصرف الفعلي" type="date" value={clearDate} onChange={e => setClearDate(e.target.value)} />
            <p className="text-xs text-slate-400">بعد التسوية يُحسب المبلغ مصروفاً فعلياً بهذا التاريخ في كل النظام.</p>
            <div className="flex gap-2">
              <Button onClick={() => updateStatus(clearTarget, 'cleared', clearDate)}>تأكيد الصرف</Button>
              <Button variant="secondary" onClick={() => setClearTarget(null)}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ مودال عرض التفاصيل ═══ */}
      {viewCheque && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeView}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                {viewCheque.cheque_type === 'guarantee' ? <ShieldCheck size={18} className="text-blue-500" /> : <Banknote size={18} className="text-slate-500" />}
                <h3 className="font-bold text-slate-800">تفاصيل الشيك</h3>
                <Badge color={STATUS_META[viewCheque.status]?.color ?? 'gray'}>{STATUS_META[viewCheque.status]?.label}</Badge>
              </div>
              <button onClick={closeView} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-slate-400 mb-0.5">رقم الشيك</div><div className="font-medium text-slate-700">{viewCheque.cheque_number || '—'}</div></div>
                <div><div className="text-xs text-slate-400 mb-0.5">النوع</div><div className="font-medium text-slate-700">{TYPE_LABELS[viewCheque.cheque_type]} — {DIRECTION_LABELS[viewCheque.direction]}</div></div>
                <div><div className="text-xs text-slate-400 mb-0.5">الجهة</div><div className="font-medium text-slate-700">{viewCheque.party_name} ({PARTY_LABELS[viewCheque.party_type] ?? viewCheque.party_type})</div></div>
                <div><div className="text-xs text-slate-400 mb-0.5">البنك</div><div className="font-medium text-slate-700">{viewCheque.bank_name || '—'}</div></div>
                <div><div className="text-xs text-slate-400 mb-0.5">المبلغ</div><div className="font-bold text-slate-800 text-base">{formatCurrency(Number(viewCheque.amount))}</div></div>
                <div><div className="text-xs text-slate-400 mb-0.5">المشروع</div><div className="font-medium text-slate-700">{viewCheque.project_name || '—'}</div></div>
                <div><div className="text-xs text-slate-400 mb-0.5">تاريخ الإصدار</div><div className="text-slate-700">{viewCheque.issue_date ? formatDate(viewCheque.issue_date) : '—'}</div></div>
                <div><div className="text-xs text-slate-400 mb-0.5">تاريخ الاستحقاق</div><div className="text-slate-700">{viewCheque.due_date ? formatDate(viewCheque.due_date) : '—'}</div></div>
                {viewCheque.cleared_date && (
                  <div><div className="text-xs text-slate-400 mb-0.5">تاريخ الصرف الفعلي</div><div className="text-green-700 font-medium">{formatDate(viewCheque.cleared_date)}</div></div>
                )}
                <div><div className="text-xs text-slate-400 mb-0.5">المصدر</div><div className="text-slate-700 flex items-center gap-1">{isLinked(viewCheque) && <Link2 size={12} className="text-blue-500" />}{SOURCE_LABELS[viewCheque.related_type] ?? viewCheque.related_type}</div></div>
              </div>

              {viewCheque.notes && (
                <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
                  <div className="text-xs text-slate-400 mb-1 flex items-center gap-1"><FileText size={12} /> ملاحظات</div>
                  {viewCheque.notes}
                </div>
              )}

              {viewCheque.has_image ? (
                <div>
                  <div className="text-xs text-slate-400 mb-2 flex items-center gap-1"><ImageIcon size={12} /> صورة الشيك (اضغط للتكبير)</div>
                  {viewImage.loading ? (
                    <div className="h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-400">
                      جاري تحميل الصورة...
                    </div>
                  ) : viewImage.url ? (
                    isPdfValue(viewImage.url) ? (
                      <Button variant="outline" onClick={() => openAttachmentValue(viewImage.url!)}>فتح ملف PDF</Button>
                    ) : (
                      <img src={viewImage.url} alt="صورة الشيك"
                        className="w-full rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-90"
                        onClick={() => openAttachmentValue(viewImage.url!)} />
                    )
                  ) : (
                    <div className="text-xs text-slate-400">تعذّر تحميل الصورة</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400">لا توجد صورة مرفقة</div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                {viewCheque.status === 'pending' && viewCheque.cheque_type !== 'guarantee' && (
                  <Button size="sm" onClick={() => { setClearTarget(viewCheque); setClearDate(viewCheque.due_date && viewCheque.due_date <= t ? viewCheque.due_date : t) }}
                    icon={<CheckCircle2 size={14} />}>تسوية — صُرف</Button>
                )}
                {viewCheque.status === 'pending' && viewCheque.cheque_type === 'guarantee' && (
                  <Button size="sm" onClick={() => updateStatus(viewCheque, 'returned')} icon={<Undo2 size={14} />}>استرجاع الضمان</Button>
                )}
                {viewCheque.status === 'pending' && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(viewCheque, 'bounced')} icon={<Ban size={14} />}>ارتداد</Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => { openEdit(viewCheque); closeView() }} icon={<Pencil size={14} />}>تعديل</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ مودال إضافة / تعديل ═══ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-800">{editingId ? 'تعديل الشيك' : 'تسجيل شيك جديد'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-4">
              {editingId && cheques.find(c => c.id === editingId && c.related_type !== 'manual') && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex items-start gap-2">
                  <Link2 size={14} className="shrink-0 mt-0.5" />
                  <span>هذا الشيك مرتبط بفاتورة — المبلغ والتاريخ والجهة تُدار من الفاتورة الأصلية وتُحدَّث تلقائياً. يمكنك هنا إضافة رقم الشيك والبنك والصورة والملاحظات.</span>
                </div>
              )}

              {/* نوع الشيك واتجاهه */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">نوع الشيك</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, cheque_type: 'deferred' }))}
                      className={`p-2.5 rounded-xl border-2 text-center text-sm transition-colors ${form.cheque_type === 'deferred' ? 'border-amber-400 bg-amber-50 font-bold text-slate-800' : 'border-slate-200 text-slate-500'}`}>
                      آجل
                    </button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, cheque_type: 'guarantee' }))}
                      className={`p-2.5 rounded-xl border-2 text-center text-sm transition-colors ${form.cheque_type === 'guarantee' ? 'border-blue-400 bg-blue-50 font-bold text-slate-800' : 'border-slate-200 text-slate-500'}`}>
                      ضمان
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">الاتجاه</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, direction: 'outgoing' }))}
                      className={`p-2.5 rounded-xl border-2 text-center text-sm transition-colors ${form.direction === 'outgoing' ? 'border-slate-400 bg-slate-50 font-bold text-slate-800' : 'border-slate-200 text-slate-500'}`}>
                      صادر منّا
                    </button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, direction: 'incoming' }))}
                      className={`p-2.5 rounded-xl border-2 text-center text-sm transition-colors ${form.direction === 'incoming' ? 'border-green-400 bg-green-50 font-bold text-slate-800' : 'border-slate-200 text-slate-500'}`}>
                      وارد لنا
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="رقم الشيك" value={form.cheque_number} onChange={e => setForm(f => ({ ...f, cheque_number: e.target.value }))} dir="ltr" />
                <Input label="البنك" value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="بنك البحرين الوطني..." />
                <Select label="نوع الجهة" value={form.party_type}
                  onChange={e => setForm(f => ({ ...f, party_type: e.target.value }))}
                  options={Object.entries(PARTY_LABELS).map(([value, label]) => ({ value, label }))} />
                <Input label="اسم الجهة *" value={form.party_name} onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))} />
                <Input label="المبلغ (د.ب) *" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} dir="ltr" />
                <Select label="المشروع (اختياري)" value={form.project_id}
                  onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                  placeholder="بدون مشروع"
                  options={[{ value: '', label: 'بدون مشروع' }, ...projects.map(p => ({ value: p.id, label: p.project_name }))]} />
                <Input label="تاريخ الإصدار" type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
                <Input label={form.cheque_type === 'deferred' ? 'تاريخ الاستحقاق *' : 'تاريخ الاستحقاق'} type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>

              {/* صورة الشيك */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">صورة الشيك</label>
                {form.cheque_image_data ? (
                  <div className="relative">
                    {form.cheque_image_data.startsWith('data:image') ? (
                      <img src={form.cheque_image_data} alt="صورة الشيك"
                        className="w-full max-h-44 object-contain rounded-xl border border-slate-200 cursor-zoom-in bg-slate-50"
                        onClick={() => openStoredFile(form.cheque_image_data)} />
                    ) : (
                      <Button variant="outline" onClick={() => openAttachmentValue(form.cheque_image_data)}>
                        {isDataUrl(form.cheque_image_data) ? 'فتح المرفق' : 'عرض الصورة المرفقة'}
                      </Button>
                    )}
                    <button onClick={() => setForm(f => ({ ...f, cheque_image_data: '' }))}
                      className="absolute top-2 left-2 p-1 bg-white/90 rounded-lg text-red-500 hover:bg-red-50 border border-slate-200">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : editingId && cheques.find(c => c.id === editingId)?.has_image && !originalImageRef.current ? (
                  <div className="h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">
                    جاري تحميل الصورة المرفقة...
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 text-sm cursor-pointer hover:border-slate-300 hover:bg-slate-50">
                    <ImageIcon size={16} /> اضغط لإرفاق صورة الشيك
                    <input type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={e => { const file = e.target.files?.[0]; if (file) handleImageUpload(file) }} />
                  </label>
                )}
              </div>

              <Textarea label="ملاحظات" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />

              <div className="flex gap-2 pt-1">
                <Button loading={saving} onClick={handleSave}>{editingId ? 'حفظ التعديلات' : 'تسجيل الشيك'}</Button>
                <Button variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="حذف الشيك"
        message="هل أنت متأكد من حذف هذا الشيك من السجل؟ لا يمكن التراجع."
        confirmLabel="حذف"
        danger
      />
    </div>
  )
}
