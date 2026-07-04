import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Trash2, FileArchive, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { parseDocument } from '../../lib/document-parser'
import type { Document, ExtractedDocumentData } from '../../types'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import { formatDate } from '../../lib/utils'

// جلب المستندات (مصدر React Query)
async function fetchDocuments(): Promise<Document[]> {
  const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
  return (data ?? []) as Document[]
}

// أيقونة حسب نوع الملف
function fileIcon(type: string): string {
  if (type === 'pdf') return '📄'
  if (['xlsx', 'xls', 'csv'].includes(type)) return '📊'
  if (['png', 'jpg', 'jpeg', 'webp'].includes(type)) return '🖼️'
  return '📁'
}

// تسميات حقول البيانات المستخرجة (ثابتة — لا تُعاد إنشاؤها في كل رندر)
const FIELD_LABELS: Record<string, string> = {
  name: 'الاسم', company_name: 'الشركة', email: 'البريد', phone: 'الهاتف',
  address: 'العنوان', tax_number: 'رقم الضريبة', invoice_number: 'رقم الفاتورة',
  lpo_number: 'رقم أمر الشراء', date: 'التاريخ', amount: 'المبلغ',
  bank_iban: 'IBAN', payment_terms: 'شروط الدفع',
}

export default function DocumentsPage() {
  const queryClient = useQueryClient()
  const [parsing, setParsing] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<{ data: ExtractedDocumentData; text: string; name: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: documents = [], isLoading } = useQuery({ queryKey: ['documents'], queryFn: fetchDocuments })
  const reload = () => queryClient.invalidateQueries({ queryKey: ['documents'] })

  const handleFile = async (file: File) => {
    setParsing(true)
    try {
      const { data, text } = await parseDocument(file)
      setExtracted({ data, text, name: file.name })
      // Save to documents table
      await supabase.from('documents').insert({
        name: file.name,
        file_type: file.name.split('.').pop() ?? '',
        extracted_text: text.slice(0, 5000),
        extracted_data: data,
      })
      toast.success('تم قراءة الملف وحفظ البيانات المستخرجة')
      reload()
    } catch {
      toast.error('حدث خطأ أثناء قراءة الملف')
    } finally {
      setParsing(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('documents').delete().eq('id', deleteId)
    toast.success('تم حذف المستند')
    setDeleteId(null)
    reload()
  }

  return (
    <div className="space-y-5">
      {/* Upload area */}
      <div
        className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer bg-white hover:bg-primary-50"
        onClick={() => inputRef.current?.click()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onDragOver={e => e.preventDefault()}
      >
        <input ref={inputRef} type="file" className="hidden"
          accept=".pdf,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {parsing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
            <p className="text-sm text-slate-600">جاري قراءة وتحليل الملف...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center">
              <Upload size={24} className="text-primary-600" />
            </div>
            <div>
              <p className="font-medium text-slate-700">رفع مستند لاستخراج البيانات تلقائياً</p>
              <p className="text-sm text-slate-500 mt-1">يدعم: PDF, Excel, CSV, صور — يتم استخراج البيانات بدقة عالية</p>
            </div>
            <Button variant="outline" size="sm">اختر ملفاً</Button>
          </div>
        )}
      </div>

      {/* Extracted data preview */}
      {extracted && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h3 className="font-semibold text-green-800 mb-3">البيانات المستخرجة من: {extracted.name}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {Object.entries(extracted.data).map(([key, val]) => {
              if (!val || key === 'items') return null
              return (
                <div key={key} className="bg-white rounded-lg p-2 border border-green-100">
                  <p className="text-xs text-slate-500">{FIELD_LABELS[key] ?? key}</p>
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

      {/* Documents list */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
          <FileArchive size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">لا توجد مستندات محفوظة</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 text-sm">المستندات المحفوظة ({documents.length})</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <span className="text-2xl">{fileIcon(doc.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{doc.name}</p>
                  <p className="text-xs text-slate-500">{formatDate(doc.created_at)}</p>
                  {doc.extracted_data && Object.keys(doc.extracted_data as object).length > 0 && (
                    <p className="text-xs text-green-600 mt-0.5">
                      تم استخراج {Object.keys(doc.extracted_data as object).filter(k => (doc.extracted_data as Record<string, unknown>)[k]).length} حقل
                    </p>
                  )}
                </div>
                <button onClick={() => setDeleteId(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
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
        message="هل أنت متأكد من حذف هذا المستند؟"
        confirmLabel="حذف"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  )
}
