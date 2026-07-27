import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, FileArchive, Upload, ExternalLink, Loader2, Building2, Folder } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { parseDocument } from '../../lib/document-parser'
import { uploadAttachment, resolveAttachmentUrl, deleteAttachment, isDataUrl } from '../../lib/storage'
import type { Document, ExtractedDocumentData } from '../../types'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import { formatDate } from '../../lib/utils'

type Category = 'office' | 'project'

type DocumentRow = Pick<Document, 'id' | 'name' | 'file_type' | 'extracted_data' | 'created_at'> & {
  has_file?: boolean
  related_type?: string | null
  related_id?: string | null
  doc_type?: string | null
}

interface ProjectRow { id: string; project_name: string }

const OFFICE_DOC_TYPES = [
  'سجل تجاري', 'شهادة ضريبة (VAT)', 'رخصة بلدية', 'عقد إيجار المكتب',
  'شهادة غرفة التجارة', 'مستند بنكي', 'وثيقة تأمين', 'هوية / جواز', 'أخرى',
]

async function fetchDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, name, file_type, extracted_data, has_file, created_at, related_type, related_id, doc_type')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRow[]
}

async function fetchProjectsLite(): Promise<ProjectRow[]> {
  const { data } = await supabase.from('projects').select('id, project_name').order('project_name')
  return (data ?? []) as ProjectRow[]
}

export default function DocumentsPage() {
  const queryClient = useQueryClient()
  const [parsing, setParsing] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<{ data: ExtractedDocumentData; text: string; name: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<Category>('office')
  const [uploadCat, setUploadCat] = useState<Category>('office')
  const [uploadProjectId, setUploadProjectId] = useState('')
  const [uploadDocType, setUploadDocType] = useState('')

  const { data: documents = [], isLoading: loading } = useQuery({ queryKey: ['documents'], queryFn: fetchDocuments })
  const { data: projects = [] } = useQuery({ queryKey: ['documents-projects'], queryFn: fetchProjectsLite })
  const reload = () => queryClient.invalidateQueries({ queryKey: ['documents'] })

  const projectName = useMemo(() => {
    const m = new Map(projects.map(p => [p.id, p.project_name]))
    return (id?: string | null): string => (id ? (m.get(id) ?? 'مشروع محذوف') : '')
  }, [projects])

  const projectDocs = documents.filter(d => d.related_type === 'project')
  const officeDocs = documents.filter(d => d.related_type !== 'project')
  const shown = tab === 'project' ? projectDocs : officeDocs

  const handleFile = async (file: File) => {
    if (uploadCat === 'project' && !uploadProjectId) { toast.error('اختر المشروع أولاً قبل رفع مستند مشروع'); return }
    setParsing(true)
    let uploadedPath = ''
    try {
      uploadedPath = await uploadAttachment(file, 'documents')

      let data: ExtractedDocumentData = {} as ExtractedDocumentData
      let text = ''
      try {
        const result = await parseDocument(file)
        data = result.data
        text = result.text
        setExtracted({ data, text, name: file.name })
      } catch {
        toast('تم حفظ الملف سحابياً، وتعذّر استخراج البيانات تلقائياً', { icon: 'ℹ️' })
      }

      const { error } = await supabase.from('documents').insert({
        name: file.name,
        file_type: file.name.split('.').pop() ?? '',
        file_url: uploadedPath,
        extracted_text: text.slice(0, 5000),
        extracted_data: data,
        related_type: uploadCat === 'project' ? 'project' : 'office',
        related_id: uploadCat === 'project' ? uploadProjectId : null,
        doc_type: uploadCat === 'office' ? (uploadDocType.trim() || null) : null,
      })
      if (error) throw error
      toast.success('تم حفظ المستند سحابياً وقراءة بياناته')
      setTab(uploadCat)
      setUploadDocType('')
      reload()
    } catch (e) {
      if (uploadedPath) await deleteAttachment(uploadedPath).catch(() => {})
      toast.error('حدث خطأ أثناء حفظ الملف: ' + ((e as Error)?.message ?? ''))
    } finally {
      setParsing(false)
    }
  }

  const openDocument = async (id: string) => {
    setOpeningId(id)
    try {
      const { data } = await supabase.from('documents').select('file_url').eq('id', id).maybeSingle()
      const url = await resolveAttachmentUrl((data?.file_url as string | undefined) ?? '')
      if (url) window.open(url, '_blank', 'noopener')
      else toast.error('تعذّر فتح الملف')
    } finally {
      setOpeningId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { data: row } = await supabase.from('documents').select('file_url').eq('id', deleteId).maybeSingle()
    const { error } = await supabase.from('documents').delete().eq('id', deleteId)
    if (error) { toast.error('تعذّر حذف المستند'); return }
    const path = (row?.file_url as string | undefined) ?? ''
    if (path && !isDataUrl(path)) {
      deleteAttachment(path).catch(() => { /* تنظيف اختياري */ })
    }
    toast.success('تم حذف المستند')
    setDeleteId(null)
    reload()
  }

  const fileIcon = (type: string) => {
    if (type === 'pdf') return '📄'
    if (['xlsx', 'xls', 'csv'].includes(type)) return '📊'
    if (['png', 'jpg', 'jpeg', 'webp'].includes(type)) return '🖼️'
    return '📁'
  }

  const catChip = (c: Category, label: string, count: number, Icon: typeof Building2) => (
    <button
      onClick={() => setUploadCat(c)}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
        uploadCat === c ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon size={15} /> {label} <span className="text-xs text-slate-400">({count})</span>
    </button>
  )

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-medium text-slate-700">إلى أين تريد رفع المستند؟</p>
        <div className="flex flex-wrap gap-2">
          {catChip('office', 'مستندات المكتب', officeDocs.length, Building2)}
          {catChip('project', 'مستندات المشاريع', projectDocs.length, Folder)}
        </div>

        {uploadCat === 'project' ? (
          <div>
            <label className="block text-xs text-slate-500 mb-1">اختر المشروع</label>
            <select value={uploadProjectId} onChange={e => setUploadProjectId(e.target.value)}
              className="w-full sm:w-80 h-9 px-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none">
              <option value="">— اختر مشروعًا —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-500 mb-1">نوع المستند (اختياري)</label>
            <input list="office-doc-types" value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}
              placeholder="مثل: سجل تجاري، شهادة ضريبة..."
              className="w-full sm:w-80 h-9 px-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none" />
            <datalist id="office-doc-types">
              {OFFICE_DOC_TYPES.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>
        )}
      </div>

      <div
        className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer bg-white hover:bg-primary-50"
        onClick={() => inputRef.current?.click()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onDragOver={e => e.preventDefault()}
      >
        <input ref={inputRef} type="file" className="hidden"
          accept=".pdf,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        {parsing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
            <p className="text-sm text-slate-600">جاري حفظ الملف سحابياً وتحليله...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center">
              <Upload size={24} className="text-primary-600" />
            </div>
            <div>
              <p className="font-medium text-slate-700">
                رفع مستند إلى {uploadCat === 'project' ? 'مستندات المشاريع' : 'مستندات المكتب'}
              </p>
              <p className="text-sm text-slate-500 mt-1">يدعم: PDF, Excel, CSV, صور — يُحفظ في السحابة وتُستخرج بياناته بدقة عالية</p>
            </div>
            <Button variant="outline" size="sm">اختر ملفاً</Button>
          </div>
        )}
      </div>

      {extracted && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h3 className="font-semibold text-green-800 mb-3">البيانات المستخرجة من: {extracted.name}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {Object.entries(extracted.data).map(([key, val]) => {
              if (!val || key === 'items') return null
              const labels: Record<string, string> = {
                name: 'الاسم', company_name: 'الشركة', email: 'البريد', phone: 'الهاتف',
                address: 'العنوان', tax_number: 'رقم الضريبة', invoice_number: 'رقم الفاتورة',
                lpo_number: 'رقم أمر الشراء', date: 'التاريخ', amount: 'المبلغ',
                bank_iban: 'IBAN', payment_terms: 'شروط الدفع',
              }
              return (
                <div key={key} className="bg-white rounded-lg p-2 border border-green-100">
                  <p className="text-xs text-slate-500">{labels[key] ?? key}</p>
                  <p className="font-medium text-slate-800 truncate">{String(val)}</p>
                </div>
              )
            })}
          </div>
          {extracted.data.items && extracted.data.items.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-green-700 mb-1">البنود المستخرجة ({extracted.data.items.length})</p>
              {extracted.data.items.map((item, i) => (
                <div key={i} className="text-sm bg-white rounded p-2 mb-1 border border-green-100">
                  {item.description} — الكمية: {item.quantity} — السعر: {item.unit_price}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setExtracted(null)} className="mt-3 text-xs text-green-700 hover:underline">إخفاء</button>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setTab('office')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
            tab === 'office' ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}>
          <Building2 size={15} /> مستندات المكتب ({officeDocs.length})
        </button>
        <button onClick={() => setTab('project')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
            tab === 'project' ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}>
          <Folder size={15} /> مستندات المشاريع ({projectDocs.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
          <FileArchive size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">
            {tab === 'project' ? 'لا توجد مستندات مشاريع بعد' : 'لا توجد مستندات مكتب بعد'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700 text-sm">
              {tab === 'project' ? 'مستندات المشاريع' : 'مستندات المكتب'} ({shown.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {shown.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <span className="text-2xl">{fileIcon(doc.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{doc.name}</p>
                  <div className="flex items-center flex-wrap gap-2 mt-0.5">
                    <span className="text-xs text-slate-500">{formatDate(doc.created_at)}</span>
                    {tab === 'project' && doc.related_id && (
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                        {projectName(doc.related_id)}
                      </span>
                    )}
                    {tab === 'office' && doc.doc_type && (
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                        {doc.doc_type}
                      </span>
                    )}
                  </div>
                  {doc.extracted_data && Object.keys(doc.extracted_data as object).length > 0 && (
                    <p className="text-xs text-green-600 mt-0.5">
                      تم استخراج {Object.keys(doc.extracted_data as object).filter(k => (doc.extracted_data as Record<string, unknown>)[k]).length} حقل
                    </p>
                  )}
                </div>
                {doc.has_file && (
                  <button onClick={() => openDocument(doc.id)} disabled={openingId === doc.id}
                    className="p-1.5 rounded-lg hover:bg-primary-50 text-slate-400 hover:text-primary-600 disabled:opacity-50" title="فتح / تنزيل">
                    {openingId === doc.id ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
                  </button>
                )}
                <button onClick={() => setDeleteId(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500" title="حذف">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="حذف المستند"
        message="هل أنت متأكد من حذف هذا المستند؟ سيُحذف الملف من التخزين السحابي أيضاً."
        confirmLabel="حذف"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  )
}
