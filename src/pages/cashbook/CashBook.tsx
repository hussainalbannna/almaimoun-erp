import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, Search, Upload, ExternalLink, Sparkles, Loader2, X,
  BarChart3, Receipt as ReceiptIcon, Download, Pencil, CalendarDays,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Project } from '../../types'
import { formatCurrency, formatDate, extractVAT } from '../../lib/utils'
import { readDocumentText, extractJSON, hasApiKey, compressImage, fileToDataUrl, openStoredFile } from '../../lib/ai'
import { uploadDataUrl, resolveAttachmentUrl, deleteAttachment, isDataUrl } from '../../lib/storage'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// ════════════════════════════════════════════════════════════════════
//  دفتر الصندوق — المصروفات النقدية وربطها بالمشاريع
//
//  الأداء والتخزين:
//  - القائمة تجلب أعمدة خفيفة فقط (بلا receipt_image_data الثقيل) —
//    عمود has_receipt_image المولَّد يكشف وجود الإيصال دون جلبه.
//  - صورة الإيصال تُجلب عند الضغط على أيقونتها فقط.
//  - الإيصالات الجديدة تُرفع إلى Supabase Storage ويُحفظ مسارها القصير،
//    مع توافق خلفي كامل للسجلّات القديمة المخزَّنة base64.
//
//  المزايا:
//  - إضافة/تعديل/حذف القيود، تصفية حسب الشهر والمشروع والنوع والبحث.
//  - تصدير Excel (ورقة تفصيلية + ورقة ملخّص) بأعمدة قبل الضريبة وبعدها.
//  - قراءة الإيصالات بالذكاء الاصطناعي وتعبئة الحقول تلقائياً.
// ════════════════════════════════════════════════════════════════════

// صف القائمة الخفيف — بلا receipt_image_data
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
  has_receipt_image?: boolean
  expense_type: string
  vat_amount?: number
  is_vat_recoverable?: boolean
  notes: string
  created_at: string
}

// حالة نموذج الإدخال — تحمل صورة الإيصال (Data URL) للمعاينة قبل الرفع
interface EntryForm {
  entry_date: string
  description: string
  vendor_name: string
  category: string
  expense_type: string
  amount: number
  payment_method: string
  project_id: string | null
  receipt_url: string
  receipt_image_data: string
  vat_amount: number
  is_vat_recoverable: boolean
  notes: string
}

const CATEGORIES = [
  { value: 'materials', label: 'مواد بناء' },
  { value: 'labor', label: 'عمالة' },
  { value: 'equipment', label: 'معدات' },
  { value: 'transport', label: 'نقل' },
  { value: 'office', label: 'مصروفات مكتبية' },
  { value: 'other', label: 'أخرى' },
]

const EXPENSE_TYPES = [
  { value: 'general', label: 'مصروف عام' },
  { value: 'office', label: 'مصروفات مكتبية' },
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

// أسماء الشهور بالعربية — لبناء قائمة اختيار الشهر وعناوين التصدير
const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))
const EXPENSE_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_TYPES.map(e => [e.value, e.label]))
const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map(m => [m.value, m.label]))

const n = (v: unknown): number => Number(v) || 0
// تقريب إلى ثلاث خانات عشرية (فلوس البحرين) — يمنع أخطاء الفاصلة العائمة في الجمع
const round3 = (v: number): number => Math.round(v * 1000) / 1000

// مفتاح الشهر «YYYY-MM» من تاريخ القيد
const monthKey = (date: string | null | undefined): string => (date ?? '').slice(0, 7)
// تسمية الشهر بالعربية: «2026-01» → «يناير 2026»
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const idx = parseInt(m, 10) - 1
  return `${MONTH_NAMES_AR[idx] ?? m} ${y}`
}

const emptyForm = (): EntryForm => ({
  entry_date: new Date().toISOString().slice(0, 10),
  description: '', vendor_name: '', category: 'materials',
  expense_type: 'general', amount: 0, payment_method: 'cash',
  project_id: null, receipt_url: '', receipt_image_data: '',
  vat_amount: 0, is_vat_recoverable: false, notes: '',
})

// الأعمدة الخفيفة للقائمة — بلا receipt_image_data (كان يضخّم الرد ويبطئ التحميل)
const LIGHT_COLUMNS =
  'id, entry_date, description, vendor_name, category, amount, payment_method, project_id, '
  + 'project_name, receipt_url, has_receipt_image, expense_type, vat_amount, is_vat_recoverable, '
  + 'notes, created_at'

// عرض أعمدة ملف Excel التفصيلي (بالترتيب نفسه للأعمدة أدناه)
const EXPORT_COLS = [
  { wch: 5 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 14 },
  { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 13 }, { wch: 26 },
]

// جلب القيود والمشاريع (مصادر React Query)
async function fetchEntries(): Promise<CashEntry[]> {
  const { data } = await supabase.from('accounts_payable').select(LIGHT_COLUMNS).order('entry_date', { ascending: false })
  return (data ?? []) as unknown as CashEntry[]
}
async function fetchProjectsList(): Promise<Project[]> {
  const { data } = await supabase.from('projects').select('id, project_name').order('project_name')
  return (data ?? []) as Project[]
}
// جلب صورة إيصال قيد واحد عند الطلب فقط — قد تكون مسار Storage أو base64 قديم
async function fetchEntryReceipt(id: string): Promise<string> {
  const { data } = await supabase.from('accounts_payable').select('receipt_image_data').eq('id', id).maybeSingle()
  return (data?.receipt_image_data as string | undefined) ?? ''
}

export default function CashBook() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterProject, setFilterProject] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // حالة التعديل: معرّف القيد قيد التعديل، ووجود إيصال سابق، وهل مُسّت صورة الإيصال
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editHasReceipt, setEditHasReceipt] = useState(false)
  const [receiptTouched, setReceiptTouched] = useState(false)

  const [form, setForm] = useState<EntryForm>(emptyForm())

  // القيود ('accounts-payable') وقائمة المشاريع ('projects-list' — تُشارَك مع صفحات أخرى)
  const { data: entries = [], isLoading } = useQuery({ queryKey: ['accounts-payable'], queryFn: fetchEntries })
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: fetchProjectsList })
  const reload = () => queryClient.invalidateQueries({ queryKey: ['accounts-payable'] })

  // ── قراءة الإيصال بالذكاء الاصطناعي ──
  const handleScan = async (file: File) => {
    if (!hasApiKey()) { toast.error('فعّل مفتاح الذكاء الاصطناعي من الإعدادات أولاً'); return }
    setScanning(true)
    toast.loading('جاري قراءة الإيصال...', { id: 'scan' })
    try {
      // تُحفظ مضغوطة كـ Data URL للمعاينة — الرفع إلى Storage يتم عند حفظ القيد
      const imageData = file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)

      const text = await readDocumentText(file, `هذا إيصال أو فاتورة مصروف (قد يكون صورة أو ممسوح ضوئياً). استخرج البيانات وأرجع JSON فقط بدون شرح:
{
  "vendor_name": "اسم المورد أو المتجر",
  "amount": المبلغ الإجمالي رقم,
  "vat_amount": مبلغ الضريبة إن وُجد رقم أو 0,
  "date": "التاريخ بصيغة YYYY-MM-DD",
  "description": "وصف مختصر للمصروف",
  "category": "التصنيف: materials أو labor أو equipment أو transport أو office أو other"
}
إذا لم تجد قيمة اتركها فارغة أو 0.`)
      const parsed = extractJSON<{ vendor_name?: string; amount?: number; vat_amount?: number; date?: string; description?: string; category?: string }>(text)
      if (!parsed) { toast.error('تعذّرت قراءة الإيصال', { id: 'scan' }); setScanning(false); return }

      const cats = CATEGORIES.map(c => c.value)
      setReceiptTouched(true)
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

  // رفع صورة الإيصال يدوياً (معاينة فورية — الرفع السحابي عند الحفظ)
  const handleManualImage = async (file: File) => {
    try {
      const imageData = file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)
      setReceiptTouched(true)
      setForm(p => ({ ...p, receipt_image_data: imageData }))
      toast.success('تم إرفاق الإيصال')
    } catch {
      toast.error('تعذّر إرفاق الملف')
    }
  }

  // إزالة صورة الإيصال من النموذج (تُعتبر تعديلاً على الإيصال)
  const removeReceipt = () => {
    setReceiptTouched(true)
    setForm(p => ({ ...p, receipt_image_data: '' }))
  }

  // حساب الضريبة تلقائياً من المبلغ
  const autoVAT = () => {
    const { vat } = extractVAT(n(form.amount))
    setForm(p => ({ ...p, vat_amount: vat, is_vat_recoverable: true }))
    toast.success('تم حساب الضريبة (10% من المبلغ الشامل)')
  }

  // فتح النموذج لإضافة قيد جديد
  const openNew = () => {
    setEditingId(null)
    setEditHasReceipt(false)
    setReceiptTouched(false)
    setForm(emptyForm())
    setShowForm(true)
  }

  // فتح النموذج لتعديل قيد قائم — تُملأ الحقول من الصف الخفيف، وتُجلب صورة الإيصال عند الطلب فقط
  const openEdit = (e: CashEntry) => {
    setEditingId(e.id)
    setEditHasReceipt(!!e.has_receipt_image)
    setReceiptTouched(false)
    setForm({
      entry_date: (e.entry_date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      description: e.description ?? '',
      vendor_name: e.vendor_name ?? '',
      category: e.category ?? 'other',
      expense_type: e.expense_type ?? 'general',
      amount: n(e.amount),
      payment_method: e.payment_method ?? 'cash',
      project_id: e.project_id ?? null,
      receipt_url: e.receipt_url ?? '',
      receipt_image_data: '',
      vat_amount: n(e.vat_amount),
      is_vat_recoverable: !!e.is_vat_recoverable,
      notes: e.notes ?? '',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setEditHasReceipt(false)
    setReceiptTouched(false)
  }

  const handleSave = async () => {
    if (!form.description) { toast.error('يجب إدخال الوصف'); return }
    if (!form.amount || n(form.amount) <= 0) { toast.error('يجب إدخال المبلغ'); return }
    setSaving(true)
    try {
      // رفع صورة الإيصال إلى التخزين السحابي — يُحفظ المسار القصير فقط في القاعدة
      let receiptImage = form.receipt_image_data
      if (receiptImage && isDataUrl(receiptImage)) {
        receiptImage = await uploadDataUrl(receiptImage, 'cash-receipts')
      }

      const proj = projects.find(p => p.id === form.project_id)
      // الحقول المشتركة بين الإضافة والتعديل — عدا صورة الإيصال التي تُعالَج بشكل خاص
      const base = {
        entry_date: form.entry_date,
        description: form.description,
        vendor_name: form.vendor_name ?? '',
        category: form.category ?? 'other',
        amount: n(form.amount),
        payment_method: form.payment_method ?? 'cash',
        project_id: form.project_id || null,
        project_name: proj?.project_name ?? '',
        receipt_url: form.receipt_url ?? '',
        expense_type: form.expense_type ?? 'general',
        vat_amount: n(form.vat_amount),
        is_vat_recoverable: !!form.is_vat_recoverable,
        notes: form.notes ?? '',
      }

      if (editingId) {
        // في التعديل: لا نلمس صورة الإيصال إلا إذا غيّرها المستخدم فعلاً (رفع/استبدال/إزالة)
        const payload: Record<string, unknown> = { ...base }
        if (receiptTouched) {
          const old = await fetchEntryReceipt(editingId)
          payload.receipt_image_data = receiptImage
          // تنظيف الملف السحابي القديم عند استبداله أو إزالته
          if (old && !isDataUrl(old) && old !== receiptImage) {
            deleteAttachment(old).catch(() => { /* تنظيف اختياري */ })
          }
        }
        const { error } = await supabase.from('accounts_payable').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success('تم تحديث القيد')
      } else {
        const { error } = await supabase.from('accounts_payable').insert({ ...base, receipt_image_data: receiptImage })
        if (error) throw error
        toast.success('تم تسجيل القيد')
      }

      closeForm()
      setForm(emptyForm())
      reload()
    } catch (e) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const target = entries.find(e => e.id === deleteId)
    // نقرأ مسار الإيصال قبل حذف الصف لتنظيف ملفه من Storage بعد الحذف
    const oldReceipt = target?.has_receipt_image ? await fetchEntryReceipt(deleteId) : ''
    const { error } = await supabase.from('accounts_payable').delete().eq('id', deleteId)
    if (error) { toast.error('تعذّر الحذف'); return }
    if (oldReceipt && !isDataUrl(oldReceipt)) {
      deleteAttachment(oldReceipt).catch(() => { /* تنظيف اختياري */ })
    }
    toast.success('تم الحذف')
    setDeleteId(null)
    reload()
  }

  // معاينة إيصال قيد من القائمة — الجلب عند الطلب فقط (Data URL قديم أو رابط موقّع)
  const openEntryReceipt = async (id: string) => {
    setReceiptLoadingId(id)
    try {
      const raw = await fetchEntryReceipt(id)
      const url = await resolveAttachmentUrl(raw)
      if (url) setPreviewImg(url)
      else toast.error('تعذّر فتح الإيصال')
    } finally {
      setReceiptLoadingId(null)
    }
  }

  // ── التصفية (حسب الشهر والمشروع والنوع والبحث) ──
  const filtered = useMemo(() => {
    return entries.filter(e => {
      const matchSearch = !search ||
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        (e.vendor_name?.toLowerCase() ?? '').includes(search.toLowerCase())
      const matchType = filterType === 'all' || (e.expense_type ?? 'general') === filterType
      const matchProject = filterProject === 'all' ||
        (filterProject === 'none' ? !e.project_id : e.project_id === filterProject)
      const matchMonth = filterMonth === 'all' || monthKey(e.entry_date) === filterMonth
      return matchSearch && matchType && matchProject && matchMonth
    })
  }, [entries, search, filterType, filterProject, filterMonth])

  // إجماليات: الشامل (بعد الضريبة)، والصافي (قبل الضريبة)، والضريبة القابلة للاسترداد
  const { total, totalNet, totalVAT, recoverableVAT } = useMemo(() => {
    const t = filtered.reduce((s, e) => s + n(e.amount), 0)
    const vat = filtered.reduce((s, e) => s + n(e.vat_amount), 0)
    return {
      total: t,
      totalNet: round3(t - vat),
      totalVAT: vat,
      recoverableVAT: filtered.filter(e => e.is_vat_recoverable).reduce((s, e) => s + n(e.vat_amount), 0),
    }
  }, [filtered])

  // قائمة الشهور المتاحة مبنية من البيانات الفعلية (تنازلياً من الأحدث)
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) {
      const k = monthKey(e.entry_date)
      if (k.length === 7) set.add(k)
    }
    const months = Array.from(set).sort((a, b) => b.localeCompare(a))
    return [{ value: 'all', label: 'كل الشهور' }, ...months.map(ym => ({ value: ym, label: monthLabel(ym) }))]
  }, [entries])

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

  // ── تصدير Excel: ورقة تفصيلية (قبل/بعد الضريبة) + ورقة ملخّص حسب النوع ──
  const exportToExcel = async () => {
    if (filtered.length === 0) { toast.error('لا توجد قيود للتصدير'); return }
    setExporting(true)
    try {
      // تحميل مكتبة Excel عند الطلب فقط (تقلّل حجم التحميل الأولي للصفحة)
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      // ── الورقة التفصيلية ──
      const rows: Record<string, string | number>[] = filtered.map((e, i) => {
        const gross = n(e.amount)
        const vat = n(e.vat_amount)
        const net = round3(gross - vat)
        return {
          'م': i + 1,
          'التاريخ': formatDate(e.entry_date),
          'الوصف': e.description ?? '',
          'المورد / الجهة': e.vendor_name ?? '',
          'المشروع': e.project_name || 'مصروف عام',
          'التصنيف': CATEGORY_LABEL[e.category] ?? e.category ?? '',
          'نوع المصروف': EXPENSE_LABEL[e.expense_type ?? 'general'] ?? e.expense_type ?? '',
          'طريقة الدفع': PAYMENT_LABEL[e.payment_method] ?? e.payment_method ?? '',
          'المبلغ قبل الضريبة': net,
          'مبلغ الضريبة': vat,
          'المبلغ بعد الضريبة': gross,
          'قابلة للاسترداد': e.is_vat_recoverable ? 'نعم' : 'لا',
          'ملاحظات': e.notes ?? '',
        }
      })
      // صف الإجمالي
      rows.push({
        'م': '', 'التاريخ': '', 'الوصف': 'الإجمالي', 'المورد / الجهة': '', 'المشروع': '',
        'التصنيف': '', 'نوع المصروف': '', 'طريقة الدفع': '',
        'المبلغ قبل الضريبة': Number(totalNet.toFixed(3)),
        'مبلغ الضريبة': Number(totalVAT.toFixed(3)),
        'المبلغ بعد الضريبة': Number(total.toFixed(3)),
        'قابلة للاسترداد': '', 'ملاحظات': '',
      })
      const periodName = filterMonth === 'all' ? 'كل الشهور' : monthLabel(filterMonth)
      const detailSheet = XLSX.utils.json_to_sheet(rows)
      detailSheet['!cols'] = EXPORT_COLS
      XLSX.utils.book_append_sheet(wb, detailSheet, periodName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'المصروفات')

      // ── ورقة ملخّص حسب نوع المصروف ──
      const typeMap: Record<string, { count: number; net: number; vat: number; gross: number }> = {}
      for (const e of filtered) {
        const key = EXPENSE_LABEL[e.expense_type ?? 'general'] ?? e.expense_type ?? 'أخرى'
        const gross = n(e.amount), vat = n(e.vat_amount)
        const cur = typeMap[key] ?? { count: 0, net: 0, vat: 0, gross: 0 }
        cur.count += 1; cur.gross += gross; cur.vat += vat; cur.net += gross - vat
        typeMap[key] = cur
      }
      const summaryRows: Record<string, string | number>[] = Object.entries(typeMap)
        .sort((a, b) => b[1].gross - a[1].gross)
        .map(([name, v], i) => ({
          'م': i + 1,
          'نوع المصروف': name,
          'عدد القيود': v.count,
          'المبلغ قبل الضريبة': Number(v.net.toFixed(3)),
          'مبلغ الضريبة': Number(v.vat.toFixed(3)),
          'المبلغ بعد الضريبة': Number(v.gross.toFixed(3)),
        }))
      summaryRows.push({
        'م': '', 'نوع المصروف': 'الإجمالي', 'عدد القيود': filtered.length,
        'المبلغ قبل الضريبة': Number(totalNet.toFixed(3)),
        'مبلغ الضريبة': Number(totalVAT.toFixed(3)),
        'المبلغ بعد الضريبة': Number(total.toFixed(3)),
      })
      const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
      summarySheet['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, summarySheet, 'ملخص حسب النوع')

      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const fileTag = filterMonth === 'all' ? 'الكل' : filterMonth
      XLSX.writeFile(wb, `دفتر_الصندوق_${fileTag}_${stamp}.xlsx`)
      toast.success('تم تصدير ملف Excel')
    } catch (e) {
      toast.error('تعذّر التصدير: ' + ((e as Error)?.message ?? ''))
    } finally {
      setExporting(false)
    }
  }

  // نص عنوان النموذج وزر الحفظ حسب الوضع (إضافة/تعديل)
  const isEditing = editingId !== null

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">دفتر الصندوق</h1>
          <p className="text-slate-500 text-sm mt-0.5">المصروفات النقدية وربطها بالمشاريع</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={<Download size={16} />} loading={exporting} onClick={exportToExcel}>تصدير Excel</Button>
          <Button variant="outline" icon={<BarChart3 size={16} />} onClick={() => setShowAnalysis(v => !v)}>تحليل</Button>
          <Button icon={<Plus size={16} />} onClick={openNew}>إضافة قيد</Button>
        </div>
      </div>

      {/* نموذج قيد جديد / تعديل */}
      {showForm && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">{isEditing ? 'تعديل القيد' : 'قيد مصروف جديد'}</h2>
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
            <Input label="المبلغ الإجمالي (د.ب) *" type="number" step="0.001" inputMode="decimal" hint="بالفلوس بثلاث خانات — مثال: 1.252" value={String(form.amount ?? 0)} onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} />
            <Select label="طريقة الدفع" value={form.payment_method ?? 'cash'} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} options={PAYMENT_METHODS} />
            <Select label="المشروع (لربط التكلفة)" value={form.project_id ?? ''} onChange={e => setForm(p => ({ ...p, project_id: e.target.value || null }))} options={projectOptions} />

            {/* ضريبة المشتريات القابلة للاسترداد */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">ضريبة قابلة للاسترداد (د.ب)</label>
              <div className="flex gap-1.5">
                <input type="number" step="0.001" inputMode="decimal" value={String(form.vat_amount ?? 0)}
                  onChange={e => setForm(p => ({ ...p, vat_amount: parseFloat(e.target.value) || 0, is_vat_recoverable: (parseFloat(e.target.value) || 0) > 0 }))}
                  className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm outline-none focus:border-amber-400" placeholder="0.000" />
                <button onClick={autoVAT} type="button" title="حساب 10% تلقائياً"
                  className="px-2.5 rounded-lg border border-amber-300 text-amber-700 text-xs hover:bg-amber-50 whitespace-nowrap">احسب 10%</button>
              </div>
            </div>
          </div>

          {/* المبلغ قبل الضريبة (محسوب لحظياً) */}
          <div className="mt-3 text-xs text-slate-500">
            المبلغ قبل الضريبة:
            <span className="font-semibold text-slate-700 mx-1">{formatCurrency(round3(n(form.amount) - n(form.vat_amount)))}</span>
          </div>

          {/* إرفاق الإيصال */}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-slate-700">صورة الإيصال:</label>
            {form.receipt_image_data ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setPreviewImg(form.receipt_image_data)} className="text-sm text-amber-700 hover:underline flex items-center gap-1">
                  <ReceiptIcon size={14} /> عرض الإيصال
                </button>
                <button onClick={removeReceipt} className="text-xs text-red-500 hover:underline">إزالة</button>
              </div>
            ) : isEditing && editHasReceipt && !receiptTouched ? (
              // في التعديل: يوجد إيصال محفوظ لم يُلمَس — نعرضه ونتيح استبداله دون إعادة رفعه
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => editingId && openEntryReceipt(editingId)} disabled={receiptLoadingId === editingId}
                  className="text-sm text-amber-700 hover:underline flex items-center gap-1 disabled:opacity-50">
                  {receiptLoadingId === editingId ? <Loader2 size={14} className="animate-spin" /> : <ReceiptIcon size={14} />} عرض الإيصال الحالي
                </button>
                <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600">
                  <Upload size={14} /> استبدال
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleManualImage(f); e.target.value = '' }} />
                </label>
                <button onClick={removeReceipt} className="text-xs text-red-500 hover:underline">إزالة الإيصال</button>
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
            <Button loading={saving} onClick={handleSave}>{isEditing ? 'حفظ التعديل' : 'حفظ القيد'}</Button>
            <Button variant="secondary" onClick={closeForm}>إلغاء</Button>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">الإجمالي (بعد الضريبة)</div>
          <div className="text-xl font-bold text-red-600">{formatCurrency(total)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">الصافي (قبل الضريبة)</div>
          <div className="text-xl font-bold text-slate-800">{formatCurrency(totalNet)}</div>
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
        <div className="relative">
          <CalendarDays size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="h-9 pr-8 pl-3 rounded-lg border border-slate-200 text-sm bg-white outline-none focus:border-amber-400">
            {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* فلاتر التصنيف */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {FILTER_TABS.map(tab => (
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
        {isLoading ? (
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
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">قبل الضريبة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">ضريبة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">بعد الضريبة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">إيصال</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">لا توجد قيود</td></tr>
                ) : filtered.map(e => {
                  const gross = n(e.amount)
                  const vat = n(e.vat_amount)
                  const net = round3(gross - vat)
                  return (
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
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatCurrency(net)}</td>
                      <td className="px-4 py-3 text-green-700 text-xs whitespace-nowrap">{vat > 0 ? formatCurrency(vat) : '—'}</td>
                      <td className="px-4 py-3 font-bold text-red-600 whitespace-nowrap">{formatCurrency(gross)}</td>
                      <td className="px-4 py-3">
                        {e.has_receipt_image ? (
                          <button onClick={() => openEntryReceipt(e.id)} disabled={receiptLoadingId === e.id} className="text-amber-600 hover:text-amber-800 disabled:opacity-50">
                            {receiptLoadingId === e.id ? <Loader2 size={15} className="animate-spin" /> : <ReceiptIcon size={15} />}
                          </button>
                        ) : e.receipt_url ? (
                          <button onClick={() => openStoredFile(e.receipt_url)} className="text-primary-600 hover:text-primary-800"><ExternalLink size={14} /></button>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(e)} title="تعديل" className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => setDeleteId(e.id)} title="حذف" className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={4}>الإجمالي</td>
                    <td className="px-4 py-2.5 font-bold text-slate-700">{formatCurrency(totalNet)}</td>
                    <td className="px-4 py-2.5 font-bold text-green-700">{totalVAT > 0 ? formatCurrency(totalVAT) : '—'}</td>
                    <td className="px-4 py-2.5 font-bold text-red-600">{formatCurrency(total)}</td>
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
