import { useState, useRef } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, ScanLine } from 'lucide-react'
import { parseDocument } from '../../lib/document-parser'
import type { ExtractedDocumentData } from '../../types'
import Button from './Button'

interface DocumentUploadProps {
  onExtracted: (data: ExtractedDocumentData, text: string, fileName: string) => void
  accept?: string
}

export default function DocumentUpload({ onExtracted, accept = '.pdf,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg' }: DocumentUploadProps) {
  const [state, setState] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setState('parsing')
    setError('')
    try {
      const { data, text } = await parseDocument(file)
      setState('done')
      onExtracted(data, text, file.name)
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : 'حدث خطأ أثناء قراءة الملف')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const reset = () => {
    setState('idle')
    setFileName('')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <>
      {/* Full-screen OCR processing overlay */}
      {state === 'parsing' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <div className="relative mx-auto w-20 h-20 mb-5">
              <div className="absolute inset-0 rounded-full border-4 border-amber-200 animate-ping opacity-30"></div>
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center">
                <ScanLine size={36} className="text-amber-600 animate-pulse" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">جاري قراءة العقد واستخراج البيانات ضوئياً</h3>
            <p className="text-sm text-slate-500 mb-4">يرجى الانتظار — يتم تحليل الملف باستخدام تقنية OCR</p>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <FileText size={14} />
              <span>{fileName}</span>
            </div>
            <div className="mt-5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-l from-amber-500 to-amber-300 rounded-full animate-[shimmer_2s_ease-in-out_infinite] w-2/3"></div>
            </div>
          </div>
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-primary-400 transition-colors cursor-pointer bg-slate-50 hover:bg-primary-50"
        onClick={() => state !== 'parsing' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {state === 'idle' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
              <Upload size={22} className="text-primary-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">رفع ملف للقراءة التلقائية</p>
              <p className="text-xs text-slate-500 mt-1">PDF, صورة, Excel — يدعم الملفات المسحوحة ضوئياً (Scanned)</p>
            </div>
            <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>
              اختر ملفاً
            </Button>
          </div>
        )}

        {state === 'parsing' && (
          <div className="flex flex-col items-center gap-2 py-2 opacity-50">
            <ScanLine size={24} className="text-amber-600" />
            <p className="text-xs text-slate-500">جاري المعالجة...</p>
          </div>
        )}

        {state === 'done' && (
          <div className="flex flex-col items-center gap-3 py-2">
            <CheckCircle size={28} className="text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-700">تم قراءة الملف بنجاح</p>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center justify-center gap-1">
                <FileText size={12} /> {fileName}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); reset() }}>
              <X size={14} /> مسح وإعادة رفع
            </Button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-3 py-2">
            <AlertCircle size={28} className="text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-700">خطأ في قراءة الملف</p>
              <p className="text-xs text-slate-500 mt-0.5">{error}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); reset() }}>
              حاول مرة أخرى
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
