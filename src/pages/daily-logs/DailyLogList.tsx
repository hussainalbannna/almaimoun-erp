import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Printer, Pencil, Trash2, ImagePlus, X, Camera, ChevronDown, ChevronUp, ShoppingCart, Sparkles, Loader2, Cloud, Users, Eye } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { DailyLog, Project, Worker } from '../../types'
import { formatDate } from '../../lib/utils'
import { readDocumentText, hasApiKey } from '../../lib/ai'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const EMPTY_FORM = (projectId = '') => ({
  project_id: projectId,
  log_date: new Date().toISOString().slice(0, 10),
  description: '',
  material_requests: '',
  inspector_meeting: false,
  additional_notes: '',
  weather: '',
  overtime_amount: '',
  overtime_notes: '',
  photos: [] as string[],
})

const WEATHER_OPTIONS = [
  { value: '', label: 'حالة الطقس' },
  { value: 'مشمس', label: 'مشمس' },
  { value: 'غائم', label: 'غائم' },
  { value: 'حار', label: 'حار جداً' },
  { value: 'ممطر', label: 'ممطر' },
  { value: 'غبار', label: 'غبار / أتربة' },
  { value: 'رطب', label: 'رطوبة عالية' },
]

// ─── Print document generator ──────────────────────────────────────────────

type PrintLog = DailyLog & { project_name?: string; worker_names?: string[] }

function buildPrintHTML(logs: PrintLog[]): string {
  const formatArabicDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('ar-SA', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    } catch { return d }
  }

  const photoGrid = (photos: string[]) => {
    if (!photos?.length) return ''
    const items = photos.map(src => `
      <div style="break-inside:avoid;aspect-ratio:1;overflow:hidden;border-radius:6px;border:1px solid #e5d9c8;">
        <img src="${src}" style="width:100%;height:100%;object-fit:cover;" />
      </div>`).join('')
    return `
      <div class="section">
        <div class="section-title">صور الموقع</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px;">
          ${items}
        </div>
      </div>`
  }

  const logCards = logs.map((log, i) => `
    <div class="report-card" ${i > 0 ? 'style="page-break-before:always;"' : ''}>
      <div class="watermark">M</div>
      <div class="corp-header">
        <div class="corp-brand">
          <div class="corp-title">مؤسسة الميمون للمقاولات</div>
          <div class="corp-subtitle">ALMAIMOUN CONSTRUCTION</div>
          <div class="corp-contact">سجل تجاري: 120637-2 &nbsp;|&nbsp; +973 37055576 &nbsp;|&nbsp; info@almaimoun-construction.com</div>
        </div>
        <div class="doc-type">تقرير يومي للموقع</div>
      </div>

      <div class="meta-row">
        <div class="meta-item">
          <span class="meta-label">التاريخ</span>
          <span class="meta-value">${formatArabicDate(log.log_date)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">المشروع / العميل</span>
          <span class="meta-value">${log.project_name ?? '—'}</span>
        </div>
        ${(log as PrintLog & { weather?: string }).weather ? `
        <div class="meta-item">
          <span class="meta-label">الطقس</span>
          <span class="meta-value">${(log as PrintLog & { weather?: string }).weather}</span>
        </div>` : ''}
        ${((log as PrintLog & { workers_count?: number }).workers_count ?? 0) > 0 ? `
        <div class="meta-item">
          <span class="meta-label">عدد العمال</span>
          <span class="meta-value">${(log as PrintLog & { workers_count?: number }).workers_count}</span>
        </div>` : ''}
        ${log.inspector_meeting ? `
        <div class="meta-item">
          <span class="meta-label">الاستشاري</span>
          <span class="meta-value badge">تنسيق موعد فحص</span>
        </div>` : ''}
      </div>

      <div class="section">
        <div class="section-title">وصف الأعمال المنجزة</div>
        <div class="section-body">${(log.description ?? '').replace(/\n/g, '<br/>')}</div>
      </div>

      ${log.material_requests ? `
      <div class="section">
        <div class="section-title">طلبات المواد</div>
        <div class="section-body">${log.material_requests.replace(/\n/g, '<br/>')}</div>
      </div>` : ''}

      ${(log.worker_names?.length ?? 0) > 0 ? `
      <div class="section">
        <div class="section-title">العمال المتواجدون في الموقع (${log.worker_names!.length})</div>
        <div class="workers-grid">
          ${log.worker_names!.map(n => `<div class="worker-chip">${n}</div>`).join('')}
        </div>
      </div>` : ''}

      ${log.additional_notes ? `
      <div class="section">
        <div class="section-title">ملاحظات إضافية</div>
        <div class="section-body notes-body">${log.additional_notes.replace(/\n/g, '<br/>')}</div>
      </div>` : ''}

      ${photoGrid(log.photos ?? [])}

      <div class="footer">
        <div>توقيع مشرف الموقع: ___________________________</div>
        <div>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>
      </div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>تقرير يومي — مؤسسة الميمون للمقاولات</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', 'Segoe UI', Arial, sans-serif;
      direction: rtl;
      background: #f1f5f9;
      color: #1e293b;
      font-size: 13px;
      line-height: 1.6;
    }
    .report-card {
      max-width: 794px;
      margin: 20px auto;
      padding: 36px 40px 40px;
      background: #fff;
      position: relative;
      overflow: hidden;
      box-shadow: 0 1px 8px rgba(0,0,0,0.08);
      border-radius: 8px;
    }
    .report-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      background: linear-gradient(90deg, #c4925a 0%, #7b4a2d 50%, #c4925a 100%);
      z-index: 2;
    }
    .watermark {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-12deg);
      font-size: 320px;
      font-weight: 900;
      color: #7b4a2d;
      opacity: 0.035;
      pointer-events: none;
      font-family: 'Arial Black', sans-serif;
      z-index: 0;
    }
    .report-card > *:not(.watermark) { position: relative; z-index: 1; }
    .corp-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 3px solid #c4925a;
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    .corp-title { font-size: 22px; font-weight: 800; color: #7b4a2d; letter-spacing: -0.5px; }
    .corp-subtitle { font-size: 12px; color: #c4925a; margin-top: 2px; letter-spacing: 2px; font-weight: 700; }
    .corp-contact { font-size: 10px; color: #94a3b8; margin-top: 6px; direction: ltr; text-align: right; }
    .doc-type {
      display: inline-block;
      background: linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      padding: 6px 20px;
      border-radius: 20px;
      white-space: nowrap;
    }
    .meta-row {
      display: flex;
      gap: 0;
      border: 1px solid #e5d9c8;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    .meta-item { flex: 1; display: flex; flex-direction: column; padding: 10px 14px; border-left: 1px solid #e5d9c8; }
    .meta-item:last-child { border-left: none; }
    .meta-label { font-size: 10px; font-weight: 700; color: #b89968; letter-spacing: 0.5px; margin-bottom: 3px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #1e293b; }
    .badge { display: inline-block; background: #f3e9dc; color: #7b4a2d; padding: 1px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; }
    .section { margin-bottom: 18px; }
    .section-title {
      font-size: 11px;
      font-weight: 800;
      color: #7b4a2d;
      letter-spacing: 0.8px;
      border-bottom: 1.5px solid #e5d9c8;
      padding-bottom: 5px;
      margin-bottom: 8px;
    }
    .section-body { font-size: 13px; color: #334155; line-height: 1.75; background: #faf6f1; border-radius: 6px; padding: 10px 14px; }
    .notes-body { background: #fefce8; border-right: 3px solid #eab308; }
    .workers-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .worker-chip { background: #faf6f1; border: 1px solid #e5d9c8; border-radius: 20px; padding: 3px 12px; font-size: 12px; font-weight: 600; color: #374151; }
    .footer { margin-top: 32px; padding-top: 14px; border-top: 1px dashed #d6c3a8; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
    @media print {
      @page { margin: 15mm 12mm; }
      html, body { background: white !important; margin: 0; }
      .report-card { padding: 0; max-width: 100%; margin: 0; box-shadow: none; border-radius: 0; }
      .corp-title { font-size: 20px; }
    }
  </style>
</head>
<body>
  ${logCards}
</body>
</html>`
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DailyLogList() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const prefillProject = searchParams.get('project') ?? ''
  const printRef = useRef<HTMLDivElement>(null)

  const [projects, setProjects] = useState<Project[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [logs, setLogs] = useState<(DailyLog & { project_name?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [filterProject, setFilterProject] = useState(prefillProject)
  const [showForm, setShowForm] = useState(!!prefillProject)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([])
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [scanningMaterials, setScanningMaterials] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const materialScanRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState(EMPTY_FORM(prefillProject))

  const load = async () => {
    setLoading(true)
    const [pRes, wRes, lRes] = await Promise.all([
      supabase.from('projects').select('id, project_name').order('project_name'),
      supabase.from('workers').select('id, name, name_en, branch').eq('status', 'active').order('name'),
      supabase.from('daily_logs').select('*').order('log_date', { ascending: false }).limit(200),
    ])
    const ps = (pRes.data ?? []) as Project[]
    setProjects(ps)
    setWorkers((wRes.data ?? []) as Worker[])
    const logData = (lRes.data ?? []) as DailyLog[]
    setLogs(logData.map(l => ({ ...l, project_name: ps.find(p => p.id === l.project_id)?.project_name })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setForm(EMPTY_FORM(prefillProject))
    setSelectedWorkers([])
    setEditingId(null)
    setShowForm(false)
  }

  const openEdit = async (log: DailyLog) => {
    setForm({
      project_id: log.project_id,
      log_date: log.log_date,
      description: log.description,
      material_requests: log.material_requests ?? '',
      inspector_meeting: log.inspector_meeting ?? false,
      additional_notes: log.additional_notes ?? '',
      weather: (log as DailyLog & { weather?: string }).weather ?? '',
      overtime_amount: (log as DailyLog & { overtime_amount?: number }).overtime_amount ? String((log as DailyLog & { overtime_amount?: number }).overtime_amount) : '',
      overtime_notes: (log as DailyLog & { overtime_notes?: string }).overtime_notes ?? '',
      photos: log.photos ?? [],
    })
    const { data } = await supabase.from('daily_log_workers').select('worker_id').eq('log_id', log.id)
    setSelectedWorkers((data ?? []).map((r: { worker_id: string }) => r.worker_id))
    setEditingId(log.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('فشل قراءة الملف'))
      reader.readAsDataURL(file)
    })

  const handlePhotoFiles = async (files: FileList | File[]) => {
    const accepted = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (accepted.length === 0) return
    setPhotoUploading(true)
    try {
      const dataUrls = await Promise.all(accepted.map(fileToDataUrl))
      setForm(prev => ({ ...prev, photos: [...prev.photos, ...dataUrls] }))
    } catch {
      toast.error('حدث خطأ أثناء معالجة الصور')
    } finally {
      setPhotoUploading(false)
    }
  }

  const removePhoto = (idx: number) => {
    setForm(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== idx) }))
  }

  const handleScanMaterials = async (file: File) => {
    if (!hasApiKey()) {
      toast.error('فعّل مفتاح الذكاء الاصطناعي من الإعدادات أولاً')
      return
    }
    setScanningMaterials(true)
    toast.loading('جاري قراءة طلب المواد...', { id: 'mat-scan' })
    try {
      const text = await readDocumentText(file, 'هذه صورة لطلب مواد بناء مكتوب بخط اليد أو مطبوع (قد يكون ممسوحاً ضوئياً أو غير واضح). اقرأه بدقة واستخرج قائمة المواد المطلوبة بكمياتها. أرجع النص فقط بشكل منظم سطراً لكل مادة بصيغة "المادة - الكمية"، بدون أي مقدمة أو شرح. إذا لم تجد كمية اكتب المادة فقط.')
      if (text) {
        setForm(prev => ({ ...prev, material_requests: prev.material_requests ? `${prev.material_requests}\n${text}` : text }))
        toast.success('تم استخراج طلب المواد', { id: 'mat-scan' })
      } else {
        toast.error('لم يتم العثور على نص', { id: 'mat-scan' })
      }
    } catch (e) {
      toast.error((e as Error)?.message ?? 'تعذّرت القراءة', { id: 'mat-scan' })
    } finally {
      setScanningMaterials(false)
    }
  }

  const convertToLPO = (log: DailyLog & { project_name?: string }) => {
    if (!log.material_requests?.trim()) { toast.error('لا توجد طلبات مواد في هذا التقرير'); return }
    const params = new URLSearchParams({
      project: log.project_id,
      materials: log.material_requests,
      from_log: log.id,
    })
    navigate(`/lpos/new?${params.toString()}`)
  }

  const syncAttendance = async (logId: string, logDate: string, projectId: string, workerIds: string[]) => {
    const projectName = projects.find(p => p.id === projectId)?.project_name ?? ''
    await supabase.from('worker_attendance').delete().eq('log_id', logId)
    if (workerIds.length > 0) {
      const records = workerIds.map(wid => ({
        worker_id: wid,
        attendance_date: logDate,
        status: 'present' as const,
        project_id: projectId,
        project_name: projectName,
        source: 'auto_log' as const,
        log_id: logId,
        notes: '',
      }))
      await supabase.from('worker_attendance').upsert(records, { onConflict: 'worker_id,attendance_date' })
    }
  }

  const handleSave = async () => {
    if (!form.project_id) { toast.error('يجب اختيار المشروع'); return }
    if (!form.description.trim()) { toast.error('يجب إدخال وصف الأعمال'); return }
    setSaving(true)
    try {
      const payload = {
        project_id: form.project_id,
        log_date: form.log_date,
        description: form.description,
        material_requests: form.material_requests,
        inspector_meeting: form.inspector_meeting,
        additional_notes: form.additional_notes,
        weather: form.weather,
        overtime_amount: Number(form.overtime_amount) || 0,
        overtime_notes: form.overtime_notes,
        workers_count: selectedWorkers.length,
        photos: form.photos,
      }
      let logId: string
      if (editingId) {
        const { error } = await supabase.from('daily_logs').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId)
        if (error) throw error
        logId = editingId
        await supabase.from('daily_log_workers').delete().eq('log_id', logId)
      } else {
        const { data, error } = await supabase.from('daily_logs').insert(payload).select().single()
        if (error) throw error
        logId = (data as DailyLog).id
      }
      for (const wid of selectedWorkers) {
        await supabase.from('daily_log_workers').insert({ log_id: logId, worker_id: wid })
      }
      await syncAttendance(logId, form.log_date, form.project_id, selectedWorkers)
      toast.success(editingId ? 'تم تحديث التقرير' : 'تم تسجيل التقرير اليومي')
      resetForm()
      load()
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeletingId(deleteTarget)
    setDeleteTarget(null)
    const { error } = await supabase.from('daily_logs').delete().eq('id', deleteTarget)
    if (error) {
      toast.error('حدث خطأ أثناء الحذف')
    } else {
      toast.success('تم حذف التقرير')
      setLogs(prev => prev.filter(l => l.id !== deleteTarget))
    }
    setDeletingId(null)
  }

  const resolveWorkerNames = async (logId: string): Promise<string[]> => {
    const { data } = await supabase
      .from('daily_log_workers')
      .select('worker_id')
      .eq('log_id', logId)
    if (!data?.length) return []
    const ids = data.map((r: { worker_id: string }) => r.worker_id)
    return workers.filter(w => ids.includes(w.id)).map(w => (w as Worker & { name_en?: string }).name_en || w.name)
  }

  // معاينة: تفتح التقرير في تبويب جديد للاستعراض (مع زر طباعة عائم)
  const openPreviewWindow = (html: string) => {
    const win = window.open('', '_blank')
    if (!win) {
      toast.error('فعّل النوافذ المنبثقة للمعاينة، أو استخدم زر الطباعة')
      return
    }
    const previewBar = `
      <div id="__preview_bar__" style="position:fixed;top:0;left:0;right:0;background:#7b4a2d;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;z-index:9999;font-family:Cairo,Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        <span style="font-weight:700;font-size:14px;">معاينة التقرير اليومي</span>
        <div style="display:flex;gap:8px;">
          <button onclick="window.print()" style="background:#c4925a;color:#fff;border:0;padding:8px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px;">طباعة / حفظ PDF</button>
          <button onclick="window.close()" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;">إغلاق</button>
        </div>
      </div>
      <style>
        body { padding-top: 56px !important; }
        @media print { #__preview_bar__ { display: none !important; } body { padding-top: 0 !important; } }
      </style>`
    const htmlWithBar = html.replace('<body>', `<body>${previewBar}`)
    win.document.open()
    win.document.write(htmlWithBar)
    win.document.close()
  }

  const openPrintWindow = (html: string) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }

    doc.open()
    doc.write(html)
    doc.close()

    const cleanup = () => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe)
    }

    const parentStyle = document.createElement('style')
    parentStyle.id = '__print_guard__'
    parentStyle.textContent = `@media print { body > *:not(iframe[aria-hidden]) { display: none !important; } }`
    document.head.appendChild(parentStyle)

    const removeGuard = () => {
      document.getElementById('__print_guard__')?.remove()
    }

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()

        const iframeWin = iframe.contentWindow
        if (iframeWin) {
          const onAfter = () => { cleanup(); removeGuard(); iframeWin.removeEventListener('afterprint', onAfter) }
          iframeWin.addEventListener('afterprint', onAfter)
        }
        setTimeout(() => { cleanup(); removeGuard() }, 120_000)
      } catch {
        cleanup()
        removeGuard()
      }
    }
  }

  const handlePreviewSingle = async (log: DailyLog & { project_name?: string }) => {
    const worker_names = await resolveWorkerNames(log.id)
    openPreviewWindow(buildPrintHTML([{ ...log, worker_names }]))
  }

  const handlePrintSingle = async (log: DailyLog & { project_name?: string }) => {
    const worker_names = await resolveWorkerNames(log.id)
    openPrintWindow(buildPrintHTML([{ ...log, worker_names }]))
  }

  const handlePreviewAll = async () => {
    const logsWithWorkers = await Promise.all(
      filtered.map(async log => ({ ...log, worker_names: await resolveWorkerNames(log.id) }))
    )
    openPreviewWindow(buildPrintHTML(logsWithWorkers))
  }

  const handlePrintAll = async () => {
    const logsWithWorkers = await Promise.all(
      filtered.map(async log => ({ ...log, worker_names: await resolveWorkerNames(log.id) }))
    )
    openPrintWindow(buildPrintHTML(logsWithWorkers))
  }

  const filtered = logs.filter(l => !filterProject || l.project_id === filterProject)

  const projectOptions = [
    { value: '', label: 'جميع المشاريع' },
    ...projects.map(p => ({ value: p.id, label: p.project_name }))
  ]

  return (
    <>
      <div className="p-6" ref={printRef}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">التقارير اليومية</h1>
            <p className="text-slate-500 text-sm mt-0.5">متابعة الموقع اليومية لجميع المشاريع</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={<Eye size={16} />} onClick={handlePreviewAll} disabled={filtered.length === 0}>
              معاينة الكل
            </Button>
            <Button variant="outline" icon={<Printer size={16} />} onClick={handlePrintAll} disabled={filtered.length === 0}>
              طباعة الكل
            </Button>
            <Button icon={<Plus size={16} />} onClick={() => { setEditingId(null); setForm(EMPTY_FORM(prefillProject)); setSelectedWorkers([]); setShowForm(true) }}>
              تسجيل تقرير جديد
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #7b4a2d 0%, #c4925a 100%)' }}>
              <h2 className="text-white font-semibold text-base">
                {editingId ? 'تعديل التقرير اليومي' : 'تقرير يومي جديد'}
              </h2>
              <button onClick={resetForm} className="text-white/60 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label="المشروع *" value={form.project_id}
                  onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))}
                  options={[{ value: '', label: 'اختر المشروع' }, ...projects.map(p => ({ value: p.id, label: p.project_name }))]} />
                <Input label="التاريخ" type="date" value={form.log_date} onChange={e => setForm(p => ({ ...p, log_date: e.target.value }))} />
                <Select label="حالة الطقس" value={form.weather} onChange={e => setForm(p => ({ ...p, weather: e.target.value }))} options={WEATHER_OPTIONS} />
              </div>

              <Textarea label="وصف الأعمال المنجزة اليوم *" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-700">طلبات المواد</label>
                  <input ref={materialScanRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleScanMaterials(f); e.target.value = '' }} />
                  <button type="button" onClick={() => materialScanRef.current?.click()} disabled={scanningMaterials}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg text-white font-medium transition-opacity disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
                    {scanningMaterials ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    قراءة من صورة
                  </button>
                </div>
                <Textarea label="" value={form.material_requests} onChange={e => setForm(p => ({ ...p, material_requests: e.target.value }))} rows={2}
                  placeholder="اكتب أو صوّر طلب المواد المكتوب بخط اليد..." />
              </div>

              <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={form.inspector_meeting}
                  onChange={e => setForm(p => ({ ...p, inspector_meeting: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300" style={{ accentColor: '#7b4a2d' }} />
                التنسيق مع الاستشاري لموعد الفحص
              </label>

              {/* الأوفر تايم */}
              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                <label className="block text-sm font-semibold text-amber-800 mb-2">أوفر تايم (اختياري)</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">المبلغ الإجمالي (د.ب)</label>
                    <input type="number" step="0.001" min="0" value={form.overtime_amount} dir="ltr"
                      onChange={e => setForm(p => ({ ...p, overtime_amount: e.target.value }))}
                      placeholder="0.000"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">السبب / التفاصيل</label>
                    <input type="text" value={form.overtime_notes}
                      onChange={e => setForm(p => ({ ...p, overtime_notes: e.target.value }))}
                      placeholder="مثال: عمل يوم الجمعة، ساعات إضافية..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                  </div>
                </div>
                <p className="text-xs text-amber-600/70 mt-1.5">يُضاف لتكلفة العمالة في حساب ربح المشروع المرتبط</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">العمال المتواجدون في الموقع</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-3 bg-slate-50 rounded-lg border border-slate-200">
                  {workers.map(w => (
                    <label key={w.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={selectedWorkers.includes(w.id)}
                        onChange={e => setSelectedWorkers(prev => e.target.checked ? [...prev, w.id] : prev.filter(x => x !== w.id))}
                        className="rounded" style={{ accentColor: '#7b4a2d' }} />
                      <span className="text-slate-700 truncate">{(w as Worker & { name_en?: string }).name_en || w.name}</span>
                    </label>
                  ))}
                </div>
                {selectedWorkers.length > 0 && <p className="text-xs text-slate-500 mt-1">{selectedWorkers.length} عامل محدد</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <Camera size={15} className="text-slate-500" />
                  صور الموقع
                </label>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handlePhotoFiles(e.dataTransfer.files) }}
                  onClick={() => photoInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
                    ${dragOver ? 'border-amber-500 bg-amber-50' : 'border-slate-300 hover:border-amber-400 hover:bg-amber-50/50'}`}>
                  <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => e.target.files && handlePhotoFiles(e.target.files)} />
                  {photoUploading ? (
                    <div className="flex flex-col items-center gap-2 py-2">
                      <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-slate-500">جاري معالجة الصور...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-1">
                      <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                        <ImagePlus size={20} className="text-amber-600" />
                      </div>
                      <p className="text-sm font-medium text-slate-700">إضافة صورة</p>
                      <p className="text-xs text-slate-400">اسحب الصور هنا أو انقر للاختيار</p>
                    </div>
                  )}
                </div>

                {form.photos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mt-3">
                    {form.photos.map((url, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button onClick={e => { e.stopPropagation(); removePhoto(idx) }}
                          className="absolute top-1 left-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Textarea label="ملاحظات إضافية" value={form.additional_notes} onChange={e => setForm(p => ({ ...p, additional_notes: e.target.value }))} rows={2}
                placeholder="أي ملاحظات إدارية أو تعليمات للموقع..." />

              <div className="flex gap-3 pt-1">
                <Button loading={saving} onClick={handleSave}>{editingId ? 'حفظ التعديلات' : 'حفظ التقرير'}</Button>
                <Button variant="secondary" onClick={resetForm}>إلغاء</Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mb-4">
          <div className="w-64">
            <Select label="" value={filterProject} onChange={e => setFilterProject(e.target.value)} options={projectOptions} />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Camera size={28} className="text-slate-300" />
            </div>
            <p className="text-slate-400 font-medium">لا توجد تقارير</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(log => {
              const isExpanded = expandedLog === log.id
              const isDeleting = deletingId === log.id
              return (
                <div key={log.id}
                  className={`bg-white rounded-xl border transition-all ${isExpanded ? 'border-amber-300 shadow-sm' : 'border-slate-200 hover:border-amber-300'}`}>
                  <div className="flex items-start justify-between p-4 cursor-pointer" onClick={() => setExpandedLog(isExpanded ? null : log.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-slate-800 text-sm">{formatDate(log.log_date)}</span>
                        {log.project_name && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{log.project_name}</span>
                        )}
                        {log.inspector_meeting && (
                          <span className="text-xs px-2 py-0.5 rounded-full border" style={{ background: '#f3e9dc', color: '#7b4a2d', borderColor: '#e5d9c8' }}>تنسيق استشاري</span>
                        )}
                        {(log.photos?.length ?? 0) > 0 && (
                          <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Camera size={10} /> {log.photos.length} صورة
                          </span>
                        )}
                        {(log as DailyLog & { weather?: string }).weather && (
                          <span className="text-xs bg-sky-50 text-sky-600 border border-sky-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Cloud size={10} /> {(log as DailyLog & { weather?: string }).weather}
                          </span>
                        )}
                        {((log as DailyLog & { workers_count?: number }).workers_count ?? 0) > 0 && (
                          <span className="text-xs bg-violet-50 text-violet-600 border border-violet-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Users size={10} /> {(log as DailyLog & { workers_count?: number }).workers_count} عامل
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 text-sm leading-relaxed line-clamp-2">{log.description}</p>
                      {log.material_requests && (
                        <p className="text-amber-700 text-xs mt-1 truncate">طلبات مواد: {log.material_requests}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 mr-3 shrink-0" onClick={e => e.stopPropagation()}>
                      {log.material_requests?.trim() && (
                        <button onClick={() => convertToLPO(log)}
                          className="p-1.5 text-amber-600 hover:text-white hover:bg-amber-600 rounded-lg transition-colors"
                          title="تحويل طلبات المواد إلى أمر شراء">
                          <ShoppingCart size={15} />
                        </button>
                      )}
                      <button onClick={() => handlePreviewSingle(log)}
                        className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                        title="معاينة هذا التقرير">
                        <Eye size={15} />
                      </button>
                      <button onClick={() => handlePrintSingle(log)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        title="طباعة هذا التقرير">
                        <Printer size={15} />
                      </button>
                      <button onClick={() => openEdit(log)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        title="تعديل">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setDeleteTarget(log.id)} disabled={isDeleting}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        title="حذف">
                        <Trash2 size={15} />
                      </button>
                      <button onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
                      {log.description && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">الأعمال المنجزة</p>
                          <p className="text-slate-700 text-sm whitespace-pre-wrap">{log.description}</p>
                        </div>
                      )}
                      {log.material_requests && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">طلبات المواد</p>
                          <p className="text-slate-700 text-sm whitespace-pre-wrap">{log.material_requests}</p>
                        </div>
                      )}
                      {log.additional_notes && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">ملاحظات إضافية</p>
                          <p className="text-slate-700 text-sm whitespace-pre-wrap">{log.additional_notes}</p>
                        </div>
                      )}
                      {(log.photos?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">صور الموقع</p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                            {log.photos.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                className="block aspect-square rounded-lg overflow-hidden border border-slate-200 hover:opacity-90 transition-opacity">
                                <img src={url} alt="" className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف التقرير"
        message="هل أنت متأكد من حذف هذا التقرير اليومي؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
