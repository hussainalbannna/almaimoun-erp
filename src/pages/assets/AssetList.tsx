import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Truck, MapPin, CreditCard, Wallet, CalendarClock, CheckCircle2, AlertTriangle, Building2,
  Paperclip, Upload, Eye, Download, Trash2, FileText, Image as ImageIcon, Loader2, Star, X, User,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, daysUntilOrNull } from '../../lib/utils'
import { compressImage, fileToDataUrl, openStoredFile } from '../../lib/ai'
import { uploadDataUrl, resolveAttachmentUrl, deleteAttachment } from '../../lib/storage'
import Button from '../../components/ui/Button'
import Badge, { type BadgeColor } from '../../components/ui/Badge'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

interface Asset {
  id: string
  name: string
  asset_type: string
  plate_number: string
  serial_number: string
  purchase_date: string | null
  purchase_value: number
  current_location: string
  status: string
  insurance_expiry: string | null
  registration_expiry: string | null
  notes: string
  cover_image_path: string | null
  custodian: string | null
  inspection_expiry: string | null
  warranty_expiry: string | null
  current_project_id: string | null
  payment_method: string
  bank_name: string
  finance_amount: number
  down_payment: number
  monthly_installment: number
  total_installments: number
  paid_installments: number
  next_installment_date: string | null
}

interface AssetDoc {
  id: string
  name: string
  doc_type: string
  file_type: string
  has_file: boolean
  created_at: string
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  heavy_equipment: 'معدات ثقيلة',
  vehicle: 'مركبة',
  generator: 'مولّدات وطاقة',
  power_tool: 'أدوات كهربائية',
  scaffolding: 'سقالات وقوالب',
  tool: 'أدوات ومساحة / سلامة',
  office_it: 'مكتب وتقنية',
  equipment: 'معدة (عام)',
  other: 'أخرى',
}
const STATUS_COLORS: Record<string, BadgeColor> = { available: 'green', in_use: 'blue', maintenance: 'orange', retired: 'gray' }
const STATUS_LABELS: Record<string, string> = { available: 'متاح', in_use: 'قيد الاستخدام', maintenance: 'صيانة', retired: 'مستبعد' }

const DOC_TYPES = [
  { value: 'photo', label: 'صورة الأصل' },
  { value: 'registration', label: 'استمارة / تسجيل' },
  { value: 'insurance', label: 'بوليصة تأمين' },
  { value: 'purchase_invoice', label: 'فاتورة الشراء' },
  { value: 'finance_contract', label: 'عقد تمويل / أقساط' },
  { value: 'maintenance', label: 'تقرير صيانة' },
  { value: 'warranty', label: 'ضمان' },
  { value: 'other', label: 'أخرى' },
]
const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(DOC_TYPES.map(d => [d.value, d.label]))

// أنواع مصاريف الأصل + طرق الدفع
const ASSET_EXPENSE_TYPES = [
  { value: 'fuel', label: 'بنزين / وقود' },
  { value: 'maintenance', label: 'صيانة وإصلاح' },
  { value: 'tools', label: 'قطع غيار / أدوات' },
  { value: 'insurance', label: 'تأمين / بوليصة' },
  { value: 'government', label: 'رسوم حكومية (تسجيل/تجديد)' },
  { value: 'general', label: 'مصروف عام' },
]
const EXPENSE_TYPE_LABEL: Record<string, string> = {
  ...Object.fromEntries(ASSET_EXPENSE_TYPES.map(e => [e.value, e.label])),
  installment: 'قسط بنكي',
}
const EXPENSE_PAYMENT_METHODS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'cheque', label: 'شيك' },
  { value: 'benefit', label: 'بنفت' },
  { value: 'card', label: 'بطاقة' },
]
const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_PAYMENT_METHODS.map(m => [m.value, m.label]))
const newExpForm = () => ({ entry_date: new Date().toISOString().slice(0, 10), amount: '', expense_type: 'fuel', payment_method: 'cash', description: '' })

interface AssetExpense {
  id: string
  entry_date: string | null
  amount: number
  expense_type: string | null
  payment_method: string | null
  description: string | null
}

interface AssetInstallment {
  id: string
  seq: number
  due_date: string | null
  amount: number
  status: string
  paid_date: string | null
}

const addMonths = (dateStr: string, delta: number): string => {
  const d = dateStr ? new Date(dateStr) : new Date()
  d.setMonth(d.getMonth() + delta)
  return d.toISOString().slice(0, 10)
}

const ASSET_TYPE_OPTIONS = Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => ({ value, label }))
const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))

const emptyForm = {
  name: '', asset_type: 'heavy_equipment', plate_number: '', serial_number: '',
  purchase_date: '', purchase_value: '', current_location: '', status: 'available',
  insurance_expiry: '', registration_expiry: '', notes: '',
  custodian: '', inspection_expiry: '', warranty_expiry: '', current_project_id: '',
  payment_method: 'cash', bank_name: '', finance_amount: '', down_payment: '',
  monthly_installment: '', total_installments: '', paid_installments: '', next_installment_date: '',
}

async function fetchAssets(): Promise<Asset[]> {
  const { data } = await supabase.from('assets').select('*').order('created_at', { ascending: false })
  return (data ?? []) as Asset[]
}

async function fetchDocCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.from('documents').select('related_id').eq('related_type', 'asset')
  const m: Record<string, number> = {}
  for (const r of (data ?? []) as { related_id: string }[]) m[r.related_id] = (m[r.related_id] ?? 0) + 1
  return m
}

// المشاريع النشطة (لربط الأصل بمشروع حالي)
async function fetchActiveProjects(): Promise<{ id: string; project_name: string }[]> {
  const { data } = await supabase.from('projects').select('id, project_name').order('project_name')
  return (data ?? []) as { id: string; project_name: string }[]
}

const fileToData = async (f: File): Promise<string> => (f.type.startsWith('image/') ? compressImage(f) : fileToDataUrl(f))

export default function AssetList() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [docs, setDocs] = useState<AssetDoc[]>([])
  const [docBusy, setDocBusy] = useState(false)
  const [docType, setDocType] = useState('photo')
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [coverPath, setCoverPath] = useState<string | null>(null)
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  // ── المصاريف المرتبطة بالأصل ──
  const [expenses, setExpenses] = useState<AssetExpense[]>([])
  const [showExpForm, setShowExpForm] = useState(false)
  const [expBusy, setExpBusy] = useState(false)
  const [expForm, setExpForm] = useState(newExpForm())
  const [payingId, setPayingId] = useState<string | null>(null) // منع النقر المزدوج على تسجيل القسط
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [installments, setInstallments] = useState<AssetInstallment[]>([])
  const [instBusy, setInstBusy] = useState(false)

  const { data: assets = [], isLoading } = useQuery({ queryKey: ['assets'], queryFn: fetchAssets })
  const { data: docCounts = {} } = useQuery({ queryKey: ['asset-doc-counts'], queryFn: fetchDocCounts })
  const { data: projects = [] } = useQuery({ queryKey: ['assets-projects'], queryFn: fetchActiveProjects })
  const projectOptions = useMemo(() => [{ value: '', label: '— بدون مشروع —' }, ...projects.map(p => ({ value: p.id, label: p.project_name }))], [projects])
  const projectName = (id: string | null) => projects.find(p => p.id === id)?.project_name ?? ''
  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ['assets'] })
    queryClient.invalidateQueries({ queryKey: ['asset-doc-counts'] })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const withCover = assets.filter(a => a.cover_image_path)
      const entries = await Promise.all(
        withCover.map(async a => [a.id, await resolveAttachmentUrl(a.cover_image_path)] as const)
      )
      if (!cancelled) setCoverUrls(Object.fromEntries(entries.filter(([, u]) => !!u) as [string, string][]))
    })()
    return () => { cancelled = true }
  }, [assets])

  const loadDocs = async (assetId: string) => {
    const { data } = await supabase.from('documents')
      .select('id, name, doc_type, file_type, has_file, created_at')
      .eq('related_id', assetId).eq('related_type', 'asset')
      .order('created_at', { ascending: false })
    setDocs((data ?? []) as AssetDoc[])
  }

  // جلب مصاريف أصل معيّن (من دفتر المصاريف المرتبطة به)
  const loadExpenses = async (assetId: string) => {
    const { data } = await supabase.from('accounts_payable')
      .select('id, entry_date, amount, expense_type, payment_method, description')
      .eq('asset_id', assetId)
      .order('entry_date', { ascending: false })
    setExpenses((data ?? []) as AssetExpense[])
  }

  const loadInstallments = async (assetId: string) => {
    const { data } = await supabase.from('asset_installments')
      .select('id, seq, due_date, amount, status, paid_date')
      .eq('asset_id', assetId).order('seq')
    setInstallments((data ?? []) as AssetInstallment[])
  }

  const openNew = () => { setEditId(null); setForm(emptyForm); setDocs([]); setExpenses([]); setInstallments([]); setShowExpForm(false); setExpForm(newExpForm()); setCoverPath(null); setDocType('photo'); setShowForm(true) }
  const openEdit = (a: Asset) => {
    setEditId(a.id)
    setCoverPath(a.cover_image_path ?? null)
    setForm({
      name: a.name ?? '', asset_type: a.asset_type ?? 'heavy_equipment', plate_number: a.plate_number ?? '',
      serial_number: a.serial_number ?? '', purchase_date: a.purchase_date ?? '', purchase_value: a.purchase_value ? String(a.purchase_value) : '',
      current_location: a.current_location ?? '', status: a.status ?? 'available',
      insurance_expiry: a.insurance_expiry ?? '', registration_expiry: a.registration_expiry ?? '', notes: a.notes ?? '',
      custodian: a.custodian ?? '', inspection_expiry: a.inspection_expiry ?? '', warranty_expiry: a.warranty_expiry ?? '', current_project_id: a.current_project_id ?? '',
      payment_method: a.payment_method ?? 'cash', bank_name: a.bank_name ?? '',
      finance_amount: a.finance_amount ? String(a.finance_amount) : '', down_payment: a.down_payment ? String(a.down_payment) : '',
      monthly_installment: a.monthly_installment ? String(a.monthly_installment) : '', total_installments: a.total_installments ? String(a.total_installments) : '',
      paid_installments: a.paid_installments ? String(a.paid_installments) : '', next_installment_date: a.next_installment_date ?? '',
    })
    setDocType('photo')
    setDocs([])
    setExpenses([])
    setInstallments([])
    setShowExpForm(false)
    setExpForm(newExpForm())
    loadDocs(a.id)
    loadExpenses(a.id)
    loadInstallments(a.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم الأصل'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name, asset_type: form.asset_type, plate_number: form.plate_number, serial_number: form.serial_number,
        current_location: form.current_location, status: form.status, notes: form.notes,
        custodian: form.custodian || null,
        current_project_id: form.current_project_id || null,
        purchase_value: Number(form.purchase_value) || 0,
        purchase_date: form.purchase_date || null,
        insurance_expiry: form.insurance_expiry || null,
        registration_expiry: form.registration_expiry || null,
        inspection_expiry: form.inspection_expiry || null,
        warranty_expiry: form.warranty_expiry || null,
        payment_method: form.payment_method,
        bank_name: form.payment_method === 'installment' ? form.bank_name : '',
        finance_amount: form.payment_method === 'installment' ? (Number(form.finance_amount) || 0) : 0,
        down_payment: form.payment_method === 'installment' ? (Number(form.down_payment) || 0) : 0,
        monthly_installment: form.payment_method === 'installment' ? (Number(form.monthly_installment) || 0) : 0,
        total_installments: form.payment_method === 'installment' ? (Number(form.total_installments) || 0) : 0,
        paid_installments: form.payment_method === 'installment' ? (Number(form.paid_installments) || 0) : 0,
        next_installment_date: form.payment_method === 'installment' ? (form.next_installment_date || null) : null,
      }
      if (editId) {
        const { error } = await supabase.from('assets').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('تم تحديث الأصل')
      } else {
        const { error } = await supabase.from('assets').insert(payload)
        if (error) throw error
        toast.success('تم إضافة الأصل — افتحه من القائمة لإرفاق المستندات')
      }
      setShowForm(false); setForm(emptyForm); setEditId(null); setDocs([]); setExpenses([]); setInstallments([]); setShowExpForm(false); setCoverPath(null); reload()
    } catch (e) { toast.error('حدث خطأ: ' + ((e as Error)?.message ?? '')) }
    finally { setSaving(false) }
  }

  const handleUpload = async (files: FileList) => {
    if (!editId) { toast.error('احفظ الأصل أولاً ثم أرفق المستندات'); return }
    setDocBusy(true)
    try {
      for (const f of Array.from(files)) {
        const dataUrl = await fileToData(f)
        const path = await uploadDataUrl(dataUrl, 'assets')
        const { error } = await supabase.from('documents').insert({
          name: f.name || DOC_TYPE_LABEL[docType] || 'مستند',
          doc_type: docType,
          file_url: path,
          file_type: f.type || '',
          related_id: editId,
          related_type: 'asset',
          has_file: true,
        })
        if (error) throw error
      }
      toast.success('تم رفع المستند')
      await loadDocs(editId)
      queryClient.invalidateQueries({ queryKey: ['asset-doc-counts'] })
    } catch (e) { toast.error('تعذّر الرفع: ' + ((e as Error)?.message ?? '')) }
    finally { setDocBusy(false) }
  }

  const getDocUrl = async (docId: string): Promise<string | null> => {
    const { data } = await supabase.from('documents').select('file_url').eq('id', docId).maybeSingle()
    const fileUrl = (data as { file_url?: string } | null)?.file_url
    return resolveAttachmentUrl(fileUrl ?? '')
  }

  const viewDoc = async (doc: AssetDoc) => {
    const url = await getDocUrl(doc.id)
    if (!url) { toast.error('تعذّر فتح المستند'); return }
    if (doc.file_type?.startsWith('image/')) setPreviewImg(url)
    else openStoredFile(url, doc.file_type)
  }

  const downloadDoc = async (doc: AssetDoc) => {
    try {
      const url = await getDocUrl(doc.id)
      if (!url) { toast.error('تعذّر تحميل المستند'); return }
      const res = await fetch(url)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = doc.name || 'مستند'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(objUrl)
    } catch { toast.error('تعذّر التحميل') }
  }

  const deleteDoc = async (doc: AssetDoc) => {
    try {
      const { data } = await supabase.from('documents').select('file_url').eq('id', doc.id).maybeSingle()
      const fileUrl = (data as { file_url?: string } | null)?.file_url
      if (fileUrl) await deleteAttachment(fileUrl)
      await supabase.from('documents').delete().eq('id', doc.id)
      if (editId && fileUrl && fileUrl === coverPath) {
        await supabase.from('assets').update({ cover_image_path: null }).eq('id', editId)
        setCoverPath(null)
      }
      toast.success('تم حذف المستند')
      if (editId) await loadDocs(editId)
      reload()
    } catch { toast.error('تعذّر الحذف') }
  }

  const setAsCover = async (doc: AssetDoc) => {
    if (!editId) return
    const { data } = await supabase.from('documents').select('file_url').eq('id', doc.id).maybeSingle()
    const fileUrl = (data as { file_url?: string } | null)?.file_url
    if (!fileUrl) return
    const { error } = await supabase.from('assets').update({ cover_image_path: fileUrl }).eq('id', editId)
    if (error) { toast.error('تعذّر تعيين الغلاف'); return }
    setCoverPath(fileUrl)
    toast.success('تم تعيين صورة الغلاف')
    queryClient.invalidateQueries({ queryKey: ['assets'] })
  }

  // إضافة مصروف مرتبط بالأصل (يُسجَّل في دفتر المصاريف accounts_payable)
  const addExpense = async () => {
    if (!editId) return
    const amt = Number(expForm.amount)
    if (!amt || amt <= 0) { toast.error('أدخل مبلغ المصروف'); return }
    setExpBusy(true)
    try {
      const { error } = await supabase.from('accounts_payable').insert({
        asset_id: editId,
        project_id: null,
        entry_date: expForm.entry_date || new Date().toISOString().slice(0, 10),
        amount: amt,
        category: 'equipment',
        expense_type: expForm.expense_type,
        payment_method: expForm.payment_method,
        description: expForm.description || EXPENSE_TYPE_LABEL[expForm.expense_type] || 'مصروف أصل',
      })
      if (error) throw error
      toast.success('تم تسجيل المصروف')
      setExpForm(newExpForm()); setShowExpForm(false)
      await loadExpenses(editId)
    } catch (e) { toast.error('تعذّر التسجيل: ' + ((e as Error)?.message ?? '')) }
    finally { setExpBusy(false) }
  }

  const deleteExpense = async (id: string) => {
    const { error } = await supabase.from('accounts_payable').delete().eq('id', id)
    if (error) { toast.error('تعذّر الحذف'); return }
    toast.success('تم حذف المصروف')
    if (editId) await loadExpenses(editId)
  }

  // حذف الأصل: يحذف مستنداته ومرفقاتها من التخزين. مصاريفه في accounts_payable تبقى سجلاً مالياً (asset_id=null تلقائياً)
  const deleteAsset = async () => {
    if (!editId) return
    setDeleting(true)
    try {
      const { data: docRows } = await supabase.from('documents').select('id, file_url').eq('related_id', editId).eq('related_type', 'asset')
      const rows = (docRows ?? []) as { id: string; file_url: string | null }[]
      const paths = rows.map(r => r.file_url).filter(Boolean) as string[]
      if (paths.length) await deleteAttachment(paths)
      if (rows.length) await supabase.from('documents').delete().eq('related_id', editId).eq('related_type', 'asset')
      const { error } = await supabase.from('assets').delete().eq('id', editId)
      if (error) throw error
      toast.success('تم حذف الأصل ومستنداته')
      setConfirmDelete(false)
      setShowForm(false); setEditId(null); setDocs([]); setExpenses([]); setShowExpForm(false); setCoverPath(null)
      reload()
    } catch (e) { toast.error('تعذّر الحذف: ' + ((e as Error)?.message ?? '')) }
    finally { setDeleting(false) }
  }

  // توليد جدول أقساط تفصيلي من خطة التمويل (يمسح القديم ويعيد التوليد)
  const generateSchedule = async () => {
    if (!editId) return
    const total = Number(form.total_installments) || 0
    const monthly = Number(form.monthly_installment) || 0
    const paid = Number(form.paid_installments) || 0
    if (total <= 0 || monthly <= 0) { toast.error('أدخل عدد الأقساط والقسط الشهري أولاً'); return }
    const anchor = form.next_installment_date || new Date().toISOString().slice(0, 10)
    setInstBusy(true)
    try {
      const rows = Array.from({ length: total }, (_, i) => {
        const seq = i + 1
        return {
          asset_id: editId,
          seq,
          due_date: addMonths(anchor, seq - (paid + 1)),
          amount: monthly,
          status: seq <= paid ? 'paid' : 'pending',
          paid_date: null as string | null,
        }
      })
      await supabase.from('asset_installments').delete().eq('asset_id', editId)
      const { error } = await supabase.from('asset_installments').insert(rows)
      if (error) throw error
      toast.success('تم توليد جدول الأقساط')
      await loadInstallments(editId)
    } catch (e) { toast.error('تعذّر التوليد: ' + ((e as Error)?.message ?? '')) }
    finally { setInstBusy(false) }
  }

  // تسجيل دفع قسط مجدول: قيد المصروف + تعليم القسط مدفوعاً + مزامنة ملخّص الأصل
  const payScheduleRow = async (row: AssetInstallment) => {
    if (!editId || instBusy) return
    setInstBusy(true)
    const today = new Date().toISOString().slice(0, 10)
    try {
      const { data: exp, error: expErr } = await supabase.from('accounts_payable').insert({
        asset_id: editId,
        project_id: null,
        entry_date: today,
        amount: Number(row.amount),
        category: 'equipment',
        expense_type: 'installment',
        payment_method: 'bank_transfer',
        description: `قسط بنكي — ${form.name}${form.bank_name ? ' / ' + form.bank_name : ''} (قسط ${row.seq})`,
      }).select('id').single()
      if (expErr) { toast.error('تعذّر قيد القسط في المصاريف'); return }
      const { error: updErr } = await supabase.from('asset_installments')
        .update({ status: 'paid', paid_date: today, expense_id: (exp as { id: string }).id }).eq('id', row.id)
      if (updErr) { toast.error('تعذّر تحديث القسط'); return }
      const { data: after } = await supabase.from('asset_installments').select('due_date, status').eq('asset_id', editId).order('seq')
      const rows2 = (after ?? []) as { due_date: string | null; status: string }[]
      const paidCount = rows2.filter(r => r.status === 'paid').length
      const nextPending = rows2.find(r => r.status !== 'paid')
      await supabase.from('assets').update({ paid_installments: paidCount, next_installment_date: nextPending?.due_date ?? null }).eq('id', editId)
      setForm(f => ({ ...f, paid_installments: String(paidCount), next_installment_date: nextPending?.due_date ?? '' }))
      toast.success('تم تسجيل دفع القسط وقيده في المصاريف')
      await loadInstallments(editId); await loadExpenses(editId); reload()
    } catch (e) { toast.error('حدث خطأ: ' + ((e as Error)?.message ?? '')) }
    finally { setInstBusy(false) }
  }

  // تسجيل دفع قسط: زيادة المدفوع + تحديث التاريخ القادم + قيد صرف حقيقي في المصاريف
  // محميّ من النقر المزدوج (payingId)، ويتراجع عن العدّاد إن فشل قيد المصروف
  const payInstallment = async (a: Asset) => {
    if (payingId) return
    if (a.paid_installments >= a.total_installments) { toast.error('تم سداد جميع الأقساط'); return }
    setPayingId(a.id)
    try {
      const nextDate = a.next_installment_date ? new Date(a.next_installment_date) : new Date()
      nextDate.setMonth(nextDate.getMonth() + 1)
      const today = new Date().toISOString().slice(0, 10)
      const { error } = await supabase.from('assets').update({
        paid_installments: a.paid_installments + 1,
        next_installment_date: nextDate.toISOString().slice(0, 10),
      }).eq('id', a.id)
      if (error) { toast.error('تعذّر تحديث الأصل'); return }
      if (Number(a.monthly_installment) > 0) {
        const { error: expErr } = await supabase.from('accounts_payable').insert({
          asset_id: a.id,
          project_id: null,
          entry_date: today,
          amount: Number(a.monthly_installment),
          category: 'equipment',
          expense_type: 'installment',
          payment_method: 'bank_transfer',
          description: `قسط بنكي — ${a.name}${a.bank_name ? ' / ' + a.bank_name : ''}`,
        })
        if (expErr) {
          await supabase.from('assets').update({
            paid_installments: a.paid_installments,
            next_installment_date: a.next_installment_date,
          }).eq('id', a.id)
          toast.error('تعذّر قيد القسط في المصاريف — أُلغيت العملية')
          return
        }
      }
      toast.success('تم تسجيل دفع القسط وقيده في المصاريف')
      if (editId === a.id) await loadExpenses(a.id)
      reload()
    } finally {
      setPayingId(null)
    }
  }

  const filtered = useMemo(() =>
    assets.filter(a =>
      (a.name || '').includes(search) || (a.plate_number || '').includes(search) || (a.current_location || '').includes(search)
    ),
    [assets, search],
  )

  const { installmentAssets, totalRemaining, dueSoon } = useMemo(() => {
    const installmentAssets = assets.filter(a => a.payment_method === 'installment')
    const totalRemaining = installmentAssets.reduce((s, a) => {
      const remaining = (a.total_installments - a.paid_installments) * a.monthly_installment
      return s + (remaining > 0 ? remaining : 0)
    }, 0)
    const dueSoon = installmentAssets.filter(a => {
      const d = daysUntilOrNull(a.next_installment_date)
      return a.paid_installments < a.total_installments && d !== null && d <= 7
    })
    return { installmentAssets, totalRemaining, dueSoon }
  }, [assets])

  if (isLoading) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>

  const isInst = form.payment_method === 'installment'

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">الأصول والمعدات</h1>
          <p className="text-slate-500 text-sm">{assets.length} أصل مسجل</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openNew}>إضافة أصل</Button>
      </div>

      {installmentAssets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl border border-purple-200 p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center"><CreditCard size={22} className="text-purple-600" /></div>
            <div>
              <div className="text-xs text-purple-700">أصول بالأقساط</div>
              <div className="text-xl font-bold text-purple-900">{installmentAssets.length}</div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-white rounded-xl border border-red-200 p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center"><Wallet size={22} className="text-red-600" /></div>
            <div>
              <div className="text-xs text-red-700">إجمالي المتبقي</div>
              <div className="text-xl font-bold text-red-900" dir="ltr">{formatCurrency(totalRemaining)}</div>
            </div>
          </div>
          <div className={`bg-gradient-to-br rounded-xl border p-4 flex items-center gap-3 ${dueSoon.length > 0 ? 'from-amber-50 to-white border-amber-300' : 'from-green-50 to-white border-green-200'}`}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${dueSoon.length > 0 ? 'bg-amber-100' : 'bg-green-100'}`}>
              {dueSoon.length > 0 ? <AlertTriangle size={22} className="text-amber-600" /> : <CheckCircle2 size={22} className="text-green-600" />}
            </div>
            <div>
              <div className={`text-xs ${dueSoon.length > 0 ? 'text-amber-700' : 'text-green-700'}`}>أقساط مستحقة قريباً</div>
              <div className={`text-xl font-bold ${dueSoon.length > 0 ? 'text-amber-900' : 'text-green-900'}`}>{dueSoon.length}</div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-4">
          <div className="font-semibold text-slate-700 mb-2">{editId ? 'تعديل الأصل' : 'أصل جديد'}</div>
          <div className="grid grid-cols-3 gap-3">
            <Input placeholder="اسم الأصل *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Select options={ASSET_TYPE_OPTIONS} value={form.asset_type} onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))} />
            <Select options={STATUS_OPTIONS} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input placeholder="رقم اللوحة" value={form.plate_number} onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))} dir="ltr" />
            <Input placeholder="الرقم التسلسلي" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} dir="ltr" />
            <Input placeholder="الموقع الحالي" value={form.current_location} onChange={e => setForm(f => ({ ...f, current_location: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="تاريخ الشراء" type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
            <Input label="قيمة الشراء الكلية (د.ب)" type="number" value={form.purchase_value} onChange={e => setForm(f => ({ ...f, purchase_value: e.target.value }))} dir="ltr" />
            <Input label="انتهاء التأمين" type="date" value={form.insurance_expiry} onChange={e => setForm(f => ({ ...f, insurance_expiry: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="انتهاء التسجيل / الاستمارة" type="date" value={form.registration_expiry} onChange={e => setForm(f => ({ ...f, registration_expiry: e.target.value }))} />
            <Input label="انتهاء الفحص الدوري" type="date" value={form.inspection_expiry} onChange={e => setForm(f => ({ ...f, inspection_expiry: e.target.value }))} />
            <Input label="انتهاء الضمان" type="date" value={form.warranty_expiry} onChange={e => setForm(f => ({ ...f, warranty_expiry: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="مسؤول العهدة (من بحوزته الأصل)" value={form.custodian} onChange={e => setForm(f => ({ ...f, custodian: e.target.value }))} />
            <Select label="المشروع الحالي" options={projectOptions} value={form.current_project_id} onChange={e => setForm(f => ({ ...f, current_project_id: e.target.value }))} />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="text-sm font-semibold text-slate-700 mb-2 block">طريقة الشراء</label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <button type="button" onClick={() => setForm(f => ({ ...f, payment_method: 'cash' }))}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-colors ${!isInst ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                <Wallet size={18} className={!isInst ? 'text-green-600' : 'text-slate-400'} />
                <span className={`font-medium ${!isInst ? 'text-green-700' : 'text-slate-500'}`}>نقدي</span>
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, payment_method: 'installment' }))}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-colors ${isInst ? 'border-purple-500 bg-purple-50' : 'border-slate-200 bg-slate-50'}`}>
                <CreditCard size={18} className={isInst ? 'text-purple-600' : 'text-slate-400'} />
                <span className={`font-medium ${isInst ? 'text-purple-700' : 'text-slate-500'}`}>أقساط بنكية</span>
              </button>
            </div>

            {isInst && (
              <div className="bg-purple-50/50 rounded-xl border border-purple-200 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="اسم البنك" placeholder="مثال: بنك البحرين الوطني" value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} />
                  <Input label="مبلغ التمويل الكلي (د.ب)" type="number" value={form.finance_amount} onChange={e => setForm(f => ({ ...f, finance_amount: e.target.value }))} dir="ltr" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="الدفعة المقدمة (د.ب)" type="number" value={form.down_payment} onChange={e => setForm(f => ({ ...f, down_payment: e.target.value }))} dir="ltr" />
                  <Input label="القسط الشهري (د.ب)" type="number" value={form.monthly_installment} onChange={e => setForm(f => ({ ...f, monthly_installment: e.target.value }))} dir="ltr" />
                  <Input label="تاريخ القسط القادم" type="date" value={form.next_installment_date} onChange={e => setForm(f => ({ ...f, next_installment_date: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="عدد الأقساط الكلي" type="number" value={form.total_installments} onChange={e => setForm(f => ({ ...f, total_installments: e.target.value }))} dir="ltr" />
                  <Input label="الأقساط المدفوعة" type="number" value={form.paid_installments} onChange={e => setForm(f => ({ ...f, paid_installments: e.target.value }))} dir="ltr" />
                </div>
                {Number(form.monthly_installment) > 0 && Number(form.total_installments) > 0 && (
                  <div className="bg-white rounded-lg p-3 border border-purple-200 text-sm">
                    <div className="flex justify-between text-slate-600"><span>المتبقي من الأقساط:</span>
                      <span className="font-bold text-red-600" dir="ltr">{formatCurrency((Number(form.total_installments) - Number(form.paid_installments)) * Number(form.monthly_installment))}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 mt-1"><span>عدد الأقساط المتبقية:</span>
                      <span className="font-medium" dir="ltr">{Number(form.total_installments) - Number(form.paid_installments)} قسط</span>
                    </div>
                  </div>
                )}

                <div className="border-t border-purple-200 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-purple-900">جدول الأقساط التفصيلي</span>
                    {editId && (
                      <button type="button" onClick={generateSchedule} disabled={instBusy}
                        className="text-xs text-purple-700 hover:text-purple-900 flex items-center gap-1 disabled:opacity-60">
                        {installments.length > 0 ? 'إعادة توليد' : 'توليد الجدول'}
                      </button>
                    )}
                  </div>
                  {!editId ? (
                    <div className="text-xs text-slate-500 bg-white rounded-lg p-2 border border-purple-100">احفظ الأصل أولاً ثم ولّد الجدول.</div>
                  ) : installments.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-3 border border-dashed border-purple-200 rounded-lg bg-white">لا يوجد جدول بعد — اضغط «توليد الجدول»</div>
                  ) : (
                    <div className="bg-white border border-purple-100 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-purple-50 text-purple-700">
                          <tr>
                            <th className="px-2 py-1.5 text-right font-medium">#</th>
                            <th className="px-2 py-1.5 text-right font-medium">الاستحقاق</th>
                            <th className="px-2 py-1.5 text-right font-medium">المبلغ</th>
                            <th className="px-2 py-1.5 text-right font-medium">الحالة</th>
                            <th className="px-2 py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-purple-50">
                          {installments.map((row, idx) => {
                            const isNextPending = row.status !== 'paid' && installments.findIndex(r => r.status !== 'paid') === idx
                            return (
                              <tr key={row.id} className={row.status === 'paid' ? 'bg-green-50/40' : ''}>
                                <td className="px-2 py-1.5 text-slate-600">{row.seq}</td>
                                <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{row.due_date ? formatDate(row.due_date) : '—'}</td>
                                <td className="px-2 py-1.5 font-medium text-slate-700 whitespace-nowrap" dir="ltr">{formatCurrency(Number(row.amount || 0))}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  {row.status === 'paid'
                                    ? <span className="text-green-700">مدفوع{row.paid_date ? ` · ${formatDate(row.paid_date)}` : ''}</span>
                                    : <span className="text-amber-700">مستحق</span>}
                                </td>
                                <td className="px-2 py-1.5 text-left">
                                  {isNextPending && (
                                    <button type="button" onClick={() => payScheduleRow(row)} disabled={instBusy}
                                      className="text-xs font-medium text-white px-2 py-1 rounded-md disabled:opacity-60"
                                      style={{ background: 'linear-gradient(135deg, #a855f7, #7b4a2d)' }}>
                                      {instBusy ? '...' : 'تسجيل الدفع'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <Textarea rows={2} placeholder="ملاحظات" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />

          {/* ═══ المصاريف على الأصل ═══ */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-amber-600" />
                <span className="text-sm font-semibold text-slate-700">المصاريف على الأصل</span>
              </div>
              {editId && (
                <button type="button" onClick={() => setShowExpForm(v => !v)} className="text-xs text-amber-700 hover:text-amber-800 flex items-center gap-1">
                  <Plus size={13} /> إضافة مصروف
                </button>
              )}
            </div>
            {!editId ? (
              <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">احفظ الأصل أولاً لتسجيل مصاريفه.</div>
            ) : (
              <>
                <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 mb-2 flex items-center justify-between">
                  <span className="text-sm text-amber-800">إجمالي المصروف على هذا الأصل (تشغيلي + أقساط مسجّلة)</span>
                  <span className="font-bold text-amber-900" dir="ltr">{formatCurrency(expenses.reduce((s, e) => s + Number(e.amount || 0), 0))}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 flex items-center justify-between">
                  <span className="text-sm text-slate-600">إجمالي تكلفة الملكية (قيمة الشراء + المصاريف)</span>
                  <span className="font-bold text-slate-800" dir="ltr">{formatCurrency((Number(form.purchase_value) || 0) + expenses.reduce((s, e) => s + Number(e.amount || 0), 0))}</span>
                </div>
                {showExpForm && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="التاريخ" type="date" value={expForm.entry_date} onChange={e => setExpForm(p => ({ ...p, entry_date: e.target.value }))} />
                      <Input label="المبلغ (د.ب)" type="number" value={expForm.amount} onChange={e => setExpForm(p => ({ ...p, amount: e.target.value }))} dir="ltr" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select label="نوع المصروف" options={ASSET_EXPENSE_TYPES} value={expForm.expense_type} onChange={e => setExpForm(p => ({ ...p, expense_type: e.target.value }))} />
                      <Select label="طريقة الدفع" options={EXPENSE_PAYMENT_METHODS} value={expForm.payment_method} onChange={e => setExpForm(p => ({ ...p, payment_method: e.target.value }))} />
                    </div>
                    <Input label="وصف (اختياري)" value={expForm.description} onChange={e => setExpForm(p => ({ ...p, description: e.target.value }))} />
                    <div className="flex gap-2">
                      <Button loading={expBusy} onClick={addExpense}>تسجيل المصروف</Button>
                      <Button variant="secondary" onClick={() => { setShowExpForm(false); setExpForm(newExpForm()) }}>إلغاء</Button>
                    </div>
                  </div>
                )}
                {expenses.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">لا توجد مصاريف مسجّلة على هذا الأصل</div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                          <th className="px-3 py-2 text-right font-medium">النوع</th>
                          <th className="px-3 py-2 text-right font-medium">المبلغ</th>
                          <th className="px-3 py-2 text-right font-medium">الطريقة</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expenses.map(e => (
                          <tr key={e.id} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{e.entry_date ? formatDate(e.entry_date) : '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{EXPENSE_TYPE_LABEL[e.expense_type ?? ''] ?? e.expense_type ?? '—'}{e.description ? <span className="text-xs text-slate-400"> · {e.description}</span> : ''}</td>
                            <td className="px-3 py-2 font-bold text-red-600 whitespace-nowrap" dir="ltr">{formatCurrency(Number(e.amount || 0))}</td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{PAYMENT_LABEL[e.payment_method ?? ''] ?? e.payment_method ?? '—'}</td>
                            <td className="px-3 py-2 text-left">
                              <button type="button" onClick={() => deleteExpense(e.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip size={16} className="text-amber-600" />
              <span className="text-sm font-semibold text-slate-700">المستندات والصور</span>
              {docs.length > 0 && <span className="text-xs text-slate-400">({docs.length})</span>}
            </div>

            {!editId ? (
              <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
                احفظ الأصل أولاً، ثم افتحه من القائمة لإرفاق المستندات والصور.
              </div>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
                  onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = '' }} />
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <div className="w-52">
                    <Select options={DOC_TYPES} value={docType} onChange={e => setDocType(e.target.value)} />
                  </div>
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={docBusy}
                    className="flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #c4925a, #7b4a2d)' }}>
                    {docBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    رفع مستند / صورة
                  </button>
                  <span className="text-xs text-slate-400">صور أو PDF — يمكن اختيار عدة ملفات</span>
                </div>

                {docs.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg">لا توجد مستندات مرفقة بعد</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {docs.map(doc => {
                      const isImage = doc.file_type?.startsWith('image/')
                      return (
                        <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:border-amber-300 transition-colors">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: isImage ? '#eff6ff' : '#fef2f2' }}>
                            {isImage ? <ImageIcon size={16} className="text-blue-500" /> : <FileText size={16} className="text-red-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 truncate">{doc.name}</div>
                            <div className="text-xs text-slate-400">{DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type} · {formatDate(doc.created_at)}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isImage && (
                              <button type="button" title="تعيين كغلاف" onClick={() => setAsCover(doc)}
                                className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50"><Star size={15} /></button>
                            )}
                            <button type="button" title="عرض" onClick={() => viewDoc(doc)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"><Eye size={15} /></button>
                            <button type="button" title="تحميل" onClick={() => downloadDoc(doc)}
                              className="p-1.5 text-slate-400 hover:text-green-600 rounded-lg hover:bg-green-50"><Download size={15} /></button>
                            <button type="button" title="حذف" onClick={() => deleteDoc(doc)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button loading={saving} onClick={handleSave}>{editId ? 'حفظ التعديلات' : 'حفظ'}</Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditId(null); setDocs([]); setExpenses([]); setInstallments([]); setShowExpForm(false); setCoverPath(null) }}>إغلاق</Button>
            {editId && (
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="mr-auto flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50">
                <Trash2 size={15} /> حذف الأصل
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mb-4">
        <input className="w-full max-w-sm h-9 px-4 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          placeholder="بحث بالاسم أو اللوحة أو الموقع..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Truck size={48} className="mx-auto mb-3 opacity-40" />
          <p>لا توجد أصول مسجلة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(asset => {
            const isInstAsset = asset.payment_method === 'installment'
            const remaining = (asset.total_installments - asset.paid_installments) * asset.monthly_installment
            const progress = asset.total_installments > 0 ? (asset.paid_installments / asset.total_installments) * 100 : 0
            const isPaidOff = asset.paid_installments >= asset.total_installments && asset.total_installments > 0
            const dDays = daysUntilOrNull(asset.next_installment_date)
            const isDue = !isPaidOff && dDays !== null && dDays <= 7
            const cover = coverUrls[asset.id]
            const docCount = docCounts[asset.id] ?? 0

            return (
              <div key={asset.id} className="bg-white rounded-xl border border-slate-200 hover:shadow-md transition-shadow cursor-pointer overflow-hidden" onClick={() => openEdit(asset)}>
                {cover && (
                  <div className="h-32 w-full bg-slate-100 relative">
                    <img src={cover} alt={asset.name} className="w-full h-full object-cover" />
                    {docCount > 0 && (
                      <span className="absolute top-2 left-2 flex items-center gap-1 text-xs bg-black/55 text-white px-2 py-0.5 rounded-full">
                        <Paperclip size={11} /> {docCount}
                      </span>
                    )}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        {asset.name}
                        {isInstAsset && <CreditCard size={13} className="text-purple-500" />}
                      </div>
                      <div className="text-xs text-slate-500">{ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!cover && docCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-slate-400"><Paperclip size={12} /> {docCount}</span>
                      )}
                      <Badge color={STATUS_COLORS[asset.status] || 'gray'}>{STATUS_LABELS[asset.status] || asset.status}</Badge>
                    </div>
                  </div>
                  {asset.plate_number && <div className="text-sm text-slate-600 mb-1" dir="ltr" style={{ textAlign: 'right' }}>اللوحة: {asset.plate_number}</div>}
                  {asset.current_location && (
                    <div className="flex items-center gap-1 text-sm text-slate-500"><MapPin size={12} /> {asset.current_location}</div>
                  )}
                  {asset.purchase_value > 0 && (
                    <div className="text-sm text-slate-600 mt-2">القيمة الكلية: <span dir="ltr">{formatCurrency(asset.purchase_value)}</span></div>
                  )}

                  {isInstAsset && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      {asset.bank_name && (
                        <div className="flex items-center gap-1.5 text-xs text-purple-700 mb-2">
                          <Building2 size={12} /> {asset.bank_name}
                        </div>
                      )}
                      <div className="mb-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">{asset.paid_installments} من {asset.total_installments} قسط</span>
                          <span className="font-medium text-purple-600">{progress.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: isPaidOff ? '#16a34a' : 'linear-gradient(90deg, #a855f7, #7b4a2d)' }} />
                        </div>
                      </div>

                      {isPaidOff ? (
                        <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded-lg p-2">
                          <CheckCircle2 size={14} /> تم سداد كامل الأقساط
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between text-xs text-slate-600 mb-1">
                            <span>القسط الشهري:</span><span className="font-medium" dir="ltr">{formatCurrency(asset.monthly_installment)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-600 mb-2">
                            <span>المتبقي:</span><span className="font-bold text-red-600" dir="ltr">{formatCurrency(remaining)}</span>
                          </div>
                          {asset.next_installment_date && (
                            <div className={`flex items-center gap-1.5 text-xs rounded-lg p-2 mb-2 ${isDue ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>
                              <CalendarClock size={13} />
                              القسط القادم: {formatDate(asset.next_installment_date)}
                              {isDue && dDays !== null && <span className="font-bold mr-1">({dDays <= 0 ? 'مستحق الآن!' : `خلال ${dDays} يوم`})</span>}
                            </div>
                          )}
                          <button onClick={e => { e.stopPropagation(); payInstallment(asset) }} disabled={payingId === asset.id}
                            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-white py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #a855f7, #7b4a2d)' }}>
                            <CheckCircle2 size={14} /> {payingId === asset.id ? 'جارٍ التسجيل...' : 'تسجيل دفع قسط'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {asset.insurance_expiry && !isInstAsset && (
                    <div className="text-xs text-slate-400 mt-1">التأمين: {formatDate(asset.insurance_expiry)}</div>
                  )}
                  {asset.custodian && (
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1"><User size={11} /> {asset.custodian}</div>
                  )}
                  {projectName(asset.current_project_id) && (
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Building2 size={11} /> {projectName(asset.current_project_id)}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog open={confirmDelete} title="حذف الأصل"
        message="سيتم حذف الأصل ومستنداته وصوره نهائياً. مصاريفه المسجّلة تبقى في دفتر المصاريف كسجل مالي. متابعة؟"
        confirmLabel={deleting ? 'جارٍ الحذف...' : 'حذف'} danger onConfirm={deleteAsset} onCancel={() => setConfirmDelete(false)} />

      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -right-3 bg-white text-slate-700 rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-slate-100">
              <X size={18} />
            </button>
            <img src={previewImg} alt="معاينة" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )
}
