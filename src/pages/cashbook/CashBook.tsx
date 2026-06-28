import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Search, Upload, ExternalLink, Sparkles, Loader2, X, BarChart3, Receipt as ReceiptIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Project } from '../../types'
import { formatCurrency, formatDate, extractVAT } from '../../lib/utils'
import { readDocumentText, extractJSON, hasApiKey, compressImage, fileToDataUrl, openStoredFile } from '../../lib/ai'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

interface CashEntry {
  id: string
  entry_date: string
  description: string
  vendor_name: string
  category: string
  amount: number
  payment_method: string
  project_id: string | null
  project_name?: string
  receipt_url: string
  receipt_image_data?: string
  expense_type: string
  vat_amount?: number
  is_vat_recoverable?: boolean
  notes: string
  created_at: string
}

const CATEGORIES = [
  { value: 'materials', label: 'مواد بناء' },
  { value: 'labor', label: 'عمالة' },
  { value: 'equipment', label: 'معدات' },
  { value: 'transport', label: 'نقل' },
  { value: 'other', label: 'أخرى' },
]

const EXPENSE_TYPES = [
  { value: 'general', label: 'مصروف عام' },
  { value: 'fuel', label: 'بنزين / وقود' },
  { value: 'uniforms', label: 'يونيفورم / ملابس' },
  { value: 'water_ice', label: 'مياه / ثلج' },
  { value: 'lmra_fees', label: 'رسوم LMRA' },
  { value: 'social_insurance', label: 'تأمين اجتماعي' },
  { value: 'insurance', label: 'تأمين / بوليصة' },
  { value: 'government', label: 'رسوم حكومية' },
  { value: 'tools', label: 'أدوات ومعدات صغيرة' },
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'cheque', label: 'شيك' },
  { value: 'benefit', label: 'بنفت' },
  { value: 'card', label: 'بطاقة' },
]

const PERIODS = [
  { value: 'all', label: 'كل الفترات' },
  { value: 'this_month', label: 'هذا الشهر' },
  { value: 'last_month', label: 'الشهر الماضي' },
  { value: 'this_quarter', label: 'هذا الربع' },
  { value: 'this_year', label: 'هذه السنة' },
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))
const EXPENSE_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_TYPES.map(e => [e.value, e.label]))
const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map(m => [m.value, m.label]))

const n = (v: unknown): number => Number(v) || 0

function periodRange(key: string): { from: Date | null; to: Date | null } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  if (key === 'this_month') return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59) }
  if (key === 'last_month') return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59) }
  if (key === 'this_quarter') { const q = Math.floor(m / 3) * 3; return { from: new Date(y, q, 1), to: new Date(y, q + 3, 0, 23, 59, 59) } }
  if (key === 'this_year') return { from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59) }
  return { from: null, to: null }
}

const emptyForm = (): Partial<CashEntry> => ({
  entry_date: new Date().toISOString().slice(0, 10),
  description: '', vendor_name: '', category: 'materials',
  expense_type: 'general', amount: 0, payment_method: 'cash',
  project_id: null, receipt_url: '', receipt_image_data: '',
  vat_amount: 0, is_vat_recoverable: false, notes: '',
})

export default function CashBook() {
  const [entries, setEntries] = useState<CashEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterProject, setFilterProject] = useState('all')
  const [filterPeriod, setFilterPeriod] = useState('all')
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Partial<CashEntry>>(emptyForm())

  const load = async () => {
    setLoading(true)
    const [eRes, pRes] = await Promise.all([
      supabase.from('accounts_payable').select('*').order('entry_date', { ascending: false }),
      supabase.from('projects').select('id, project_name').order('project_name'),
    ])
    setEntries((eRes.data ?? []) as CashEntry[])
    setProjects((pRes.data ?? []) as Project[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── قراءة الإيصال بالذكاء الاصطناعي ──
  const handleScan = async (file: File) => {
    if (!hasApiKey()) { toast.error('فعّل مفتاح الذكاء الاصطناعي من الإعدادات أولاً'); return }
    setScanning(true)
    toast.loading('جاري قراءة الإيصال...', { id: 'scan' })
    try {
      // خزّن الصورة مضغوطة
      const imageData = file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)

      const text = await readDocumentText(file, `هذا إيصال أو فاتورة مصروف (قد يكون صورة أو ممسوح ضوئياً). استخرج البيانات وأرجع JSON فقط بدون شرح:
{
  "vendor_name": "اسم المورد أو المتجر",
  "amount": المبلغ الإجمالي رقم,
  "vat_amount": مبلغ الضريبة إن وُجد رقم أو 0,
  "date": "التاريخ بصيغة YYYY-MM-DD",
  "description": "وصف مختصر للمصروف",
  "category": "التصنيف: materials أو labor أو equipment أو transport أو other"
}
إذا لم تجد قيمة اتركها فارغة أو 0.`)
      const parsed = extractJSON<{ vendor_name?: string; amount?: number; vat_amount?: number; date?: string; description?: string; category?: string }>(text)
      if (!parsed) { toast.error('تعذّرت قراءة الإيصال', { id: 'scan' }); setScanning(false); return }

      const cats = CATEGORIES.map(c => c.value)
      setForm(p => ({
        ...p,
        vendor_name: parsed.vendor_name || p.vendor_name,
        amount: n(parsed.amount) || p.amount,
        vat_amount: n(parsed.vat_amount) || p.vat_amount,
        is_vat_recoverable: n(parsed.vat_amount) > 0 ? true : p.is_vat_recoverable,
        entry_date: parsed.date || p.entry_date,
        description: parsed.description || p.description,
        category: parsed.category && cats.includes(parsed.category) ? parsed.category : p.category,
        receipt_image_data: imageData,
      }))
      toast.success('تمت قراءة الإيصال وتعبئة البيانات', { id: 'scan' })
    } catch (e) {
      toast.error((e as Error)?.message ?? 'تعذّرت القراءة', { id: 'scan' })
    } finally {
      setScanning(false)
    }
  }

  // رفع صورة الإيصال يدوياً (تُخزّن base64)
  const handleManualImage = async (file: File) => {
    try {
      const imageData = file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)
      setForm(p => ({ ...p, receipt_image_data: imageData }))
      toast.success('تم إرفاق الإيصال')
    } catch {
      toast.error('تعذّر إرفاق الملف')
    }
  }

  // حساب الضريبة تلقائياً من المبلغ
  const autoVAT = () => {
    const { vat } = extractVAT(n(form.amount))
    setForm(p => ({ ...p, vat_amount: vat, is_vat_recoverable: true }))
    toast.success('تم حساب الضريبة (10% من المبلغ الشامل)')
  }

  const handleSave = async () => {
    if (!form.description) { toast.error('يجب إدخال الوصف'); return }
    if (!form.amount || n(form.amount) <= 0) { toast.error('يجب إدخال المبلغ'); return }
    setSaving(true)
    const proj = projects.find(p => p.id === form.project_id)
    const payload = {
      entry_date: form.entry_date,
      description: form.description,
      vendor_name: form.vendor_name ?? '',
      category: form.category ?? 'other',
      amount: n(form.amount),
      payment_method: form.payment_method ?? 'cash',
      project_id: form.project_id || null,
      project_name: proj?.project_name ?? '',
      receipt_url: form.receipt_url ?? '',
      receipt_image_data: form.receipt_image_data ?? '',
      expense_type: form.expense_type ?? 'general',
      vat_amount: n(form.vat_amount),
      is_vat_recoverable: !!form.is_vat_recoverable,
      notes: form.notes ?? '',
    }
    const { error } = await supabase.from('accounts_payable').insert(payload)
    if (error) { toast.error('حدث خطأ: ' + error.message); setSaving(false); return }
    toast.success('تم تسجيل القيد')
    setForm(emptyForm())
    setShowForm(false)
    load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('accounts_payable').delete().eq('id', deleteId)
    toast.success('تم الحذف')
    setDeleteId(null)
    load()
  }

  // ── التصفية ──
  const filtered = useMemo(() => {
    const { from, to } = periodRange(filterPeriod)
    return entries.filter(e => {
      const matchSearch = !search ||
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        (e.vendor_name?.toLowerCase() ?? '').includes(search.toLowerCase())
      const matchType = filterType === 'all' || (e.expense_type ?? 'general') === filterType
      const matchProject = filterProject === 'all' ||
        (filterProject === 'none' ? !e.project_id : e.project_id === filterProject)
      let matchPeriod = true
      if (from && to && e.entry_date) {
        const t = new Date(e.entry_date).getTime()
        matchPeriod = t >= from.getTime() && t <= to.getTime()
      }
      return matchSearch && matchType && matchProject && matchPeriod
    })
  }, [entries, search, filterType, filterProject, filterPeriod])

  const total = filtered.reduce((s, e) => s + n(e.amount), 0)
  const totalVAT = filtered.reduce((s, e) => s + n(e.vat_amount), 0)
  const recoverableVAT = filtered.filter(e => e.is_vat_recoverable).reduce((s, e) => s + n(e.vat_amount), 0)

  // تحليل حسب المشروع والتصنيف
  const byProject = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of filtered) {
      const key = e.project_name || (e.project_id ? 'مشروع غير مسمّى' : 'مصروفات عامة')
      map[key] = (map[key] || 0) + n(e.amount)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of filtered) {
      const key = EXPENSE_LABEL[e.expense_type ?? 'general'] ?? CATEGORY_LABEL[e.category] ?? e.category
      map[key] = (map[key] || 0) + n(e.amount)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const projectOptions = [
    { value: '', label: 'بدون مشروع (مصروف عام للشركة)' },
    ...projects.map(p => ({ value: p.id, label: p.project_name }))
  ]

  const FILTER_TABS = [
    { value: 'all', label: 'الكل' },
    ...EXPENSE_TYPES.map(t => ({ value: t.value, label: t.label })),
  ]

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">دفتر الصندوق</h1>
          <p className="text-slate-500 text-sm mt-0.5">المصروفات النقدية وربطها بالمشاريع</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={<BarChart3 size={16} />} onClick={() => setShowAnalysis(v => !v)}>تحليل</Button>
          <Button icon={<Plus size={16} />} onClick={() => { setForm(emptyForm()); setShowForm(true) }}>إضافة قيد</Button>
        </div>
      </div>

      {/* نموذج قيد جديد */}
      {showForm && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">قيد مصروف جديد</h2>
            {/* قراءة ذكية */}
            <div>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f); e.target.value = '' }} />
              <button onClick={() => fileRef.current?.click()} disabled={scanning}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
                {scanning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                قراءة إيصال بالذكاء
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="التاريخ" type="date" value={form.entry_date ?? ''} onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} />
            <Input label="اسم المورد / الجهة" value={form.vendor_name ?? ''} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} />
            <Select label="التصنيف" value={form.category ?? 'other'} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} options={CATEGORIES} />
            <Select label="نوع المصروف" value={form.expense_type ?? 'general'} onChange={e => setForm(p => ({ ...p, expense_type: e.target.value }))} options={EXPENSE_TYPES} />
            <Input label="وصف المصروف *" value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            <Input label="المبلغ الإجمالي (د.ب) *" type="number" value={String(form.amount ?? 0)} onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} />
            <Select label="طريقة الدفع" value={form.payment_method ?? 'cash'} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} options={PAYMENT_METHODS} />
            <Select label="المشروع (لربط التكلفة)" value={form.project_id ?? ''} onChange={e => setForm(p => ({ ...p, project_id: e.target.value || null }))} options={projectOptions} />

            {/* ضريبة المشتريات القابلة للاسترداد */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">ضريبة قابلة للاسترداد (د.ب)</label>
              <div className="flex gap-1.5">
                <input type="number" value={String(form.vat_amount ?? 0)}
                  onChange={e => setForm(p => ({ ...p, vat_amount: parseFloat(e.target.value) || 0, is_vat_recoverable: (parseFloat(e.target.value) || 0) > 0 }))}
                  className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm outline-none focus:border-amber-400" placeholder="0.000" />
                <button onClick={autoVAT} type="button" title="حساب 10% تلقائياً"
                  className="px-2.5 rounded-lg border border-amber-300 text-amber-700 text-xs hover:bg-amber-50 whitespace-nowrap">احسب 10%</button>
              </div>
            </div>
          </div>

          {/* إرفاق الإيصال */}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-slate-700">صورة الإيصال:</label>
            {form.receipt_image_data ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setPreviewImg(form.receipt_image_data!)} className="text-sm text-amber-700 hover:underline flex items-center gap-1">
                  <ReceiptIcon size={14} /> عرض الإيصال
                </button>
                <button onClick={() => setForm(p => ({ ...p, receipt_image_data: '' }))} className="text-xs text-red-500 hover:underline">إزالة</button>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600">
                <Upload size={14} /> إرفاق يدوي
                <input type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleManualImage(f); e.target.value = '' }} />
              </label>
            )}
          </div>

          <div className="mt-3">
            <Textarea label="ملاحظات" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex gap-3 mt-4">
            <Button loading={saving} onClick={handleSave}>حفظ القيد</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      {/* لوحة التحليل */}
      {showAnalysis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-3">المصروفات حسب المشروع</h3>
            {byProject.length === 0 ? <p className="text-sm text-slate-400">لا بيانات</p> : (
              <div className="space-y-2.5">
                {byProject.map(([name, amt]) => (
                  <div key={name}>
                    <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">{name}</span><span className="font-medium">{formatCurrency(amt)}</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${total > 0 ? (amt / total) * 100 : 0}%`, background: 'linear-gradient(90deg, #c4925a, #7b4a2d)' }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-3">المصروفات حسب التصنيف</h3>
            {byCategory.length === 0 ? <p className="text-sm text-slate-400">لا بيانات</p> : (
              <div className="space-y-2.5">
                {byCategory.map(([name, amt]) => (
                  <div key={name}>
                    <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">{name}</span><span className="font-medium">{formatCurrency(amt)}</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${total > 0 ? (amt / total) * 100 : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* بطاقات ملخّص */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">إجمالي المصروفات</div>
          <div className="text-xl font-bold text-red-600">{formatCurrency(total)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">ضريبة قابلة للاسترداد</div>
          <div className="text-xl font-bold text-green-700">{formatCurrency(recoverableVAT)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">عدد القيود</div>
          <div className="text-xl font-bold text-slate-800">{filtered.length}</div>
        </div>
      </div>

      {/* الفلاتر */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white outline-none focus:border-amber-400">
          <option value="all">كل المشاريع</option>
          <option value="none">مصروفات عامة (بدون مشروع)</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
        </select>
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white outline-none focus:border-amber-400">
          {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* فلاتر التصنيف */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {FILTER_TABS.slice(0, 8).map(tab => (
          <button key={tab.value} onClick={() => setFilterType(tab.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterType === tab.value ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-amber-400'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* الجدول */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
              className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
          </div>
          <span className="text-sm text-slate-500">{filtered.length} قيد</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">جاري التحميل...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">التاريخ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الوصف</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المشروع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">النوع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">ضريبة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">إيصال</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">لا توجد قيود</td></tr>
                ) : filtered.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(e.entry_date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {e.description}
                      {e.vendor_name && <span className="block text-xs text-slate-400">{e.vendor_name}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {e.project_name ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{e.project_name}</span>
                        : <span className="text-xs text-slate-400">عام</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {EXPENSE_LABEL[e.expense_type ?? 'general'] ?? CATEGORY_LABEL[e.category] ?? e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-red-600 whitespace-nowrap">{formatCurrency(n(e.amount))}</td>
                    <td className="px-4 py-3 text-green-700 text-xs whitespace-nowrap">{n(e.vat_amount) > 0 ? formatCurrency(n(e.vat_amount)) : '—'}</td>
                    <td className="px-4 py-3">
                      {e.receipt_image_data ? (
                        <button onClick={() => setPreviewImg(e.receipt_image_data!)} className="text-amber-600 hover:text-amber-800"><ReceiptIcon size={15} /></button>
                      ) : e.receipt_url ? (
                        <button onClick={() => openStoredFile(e.receipt_url)} className="text-primary-600 hover:text-primary-800"><ExternalLink size={14} /></button>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDeleteId(e.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={4}>الإجمالي</td>
                    <td className="px-4 py-2.5 font-bold text-red-600">{formatCurrency(total)}</td>
                    <td className="px-4 py-2.5 font-bold text-green-700">{totalVAT > 0 ? formatCurrency(totalVAT) : '—'}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* معاينة الإيصال */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-2xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -left-3 bg-white rounded-full p-1.5 shadow-lg text-slate-600 hover:text-red-600"><X size={18} /></button>
            {previewImg.startsWith('data:application/pdf') || previewImg.includes('.pdf')
              ? <button onClick={() => openStoredFile(previewImg)} className="bg-white rounded-xl px-6 py-4 text-amber-700 font-medium">فتح ملف PDF</button>
              : <img src={previewImg} alt="إيصال" className="rounded-xl max-h-[90vh] object-contain" />}
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteId} title="حذف القيد" message="هل أنت متأكد من حذف هذا القيد؟" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} danger />
    </div>
  )
}
