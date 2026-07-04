import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, PenLine, Eraser, Camera, X, ImagePlus, Wallet, CreditCard, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { VariationOrder, Project } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

const REQUEST_METHODS = [
  { value: '', label: 'طريقة الطلب' },
  { value: 'موقع', label: 'في الموقع (شفهياً)' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'اتصال', label: 'اتصال هاتفي' },
  { value: 'اجتماع', label: 'اجتماع' },
  { value: 'أخرى', label: 'أخرى' },
]

// ═══ لوحة التوقيع الرقمي ═══
function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasDrawn, setHasDrawn] = useState(!!value)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1e293b'
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      img.src = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasDrawn(true)
  }
  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current!
    onChange(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    onChange('')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          <PenLine size={15} className="text-slate-500" /> توقيع العميل (إقرار بالطلب)
        </label>
        {hasDrawn && (
          <button type="button" onClick={clear} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700">
            <Eraser size={13} /> مسح
          </button>
        )}
      </div>
      <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 overflow-hidden" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="w-full cursor-crosshair"
          style={{ height: '180px', display: 'block' }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
      </div>
      <p className="text-xs text-slate-400 mt-1">يوقّع العميل بإصبعه (جوال) أو بالماوس لإثبات موافقته على التغيير</p>
    </div>
  )
}

// ═══ رفع صور (قبل/بعد) ═══
function PhotoUploader({ label, photos, onChange, color }: { label: string; photos: string[]; onChange: (p: string[]) => void; color: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('فشل'))
      reader.readAsDataURL(file)
    })

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    const accepted = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!accepted.length) return
    setUploading(true)
    try {
      const urls = await Promise.all(accepted.map(fileToDataUrl))
      onChange([...photos, ...urls])
    } catch { toast.error('خطأ في الصور') }
    finally { setUploading(false) }
  }

  return (
    <div>
      <label className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
        <Camera size={15} style={{ color }} /> {label}
      </label>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
              className="absolute top-0.5 left-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X size={11} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-slate-400 hover:bg-slate-50 transition-colors">
          {uploading ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <><ImagePlus size={18} /><span className="text-[10px]">إضافة</span></>}
        </button>
      </div>
    </div>
  )
}

export default function VOForm() {
  const { projectId, id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id
  const [project, setProject] = useState<Project | null>(null)
  const [saving, setSaving] = useState(false)
  const [resolvedPid, setResolvedPid] = useState<string | undefined>(projectId)
  const [form, setForm] = useState<Partial<VariationOrder> & {
    requested_by?: string; request_method?: string; duration_impact_days?: number
    client_signature?: string; photos_before?: string[]; photos_after?: string[]
  }>({
    description: '', amount: 0, billable: false, status: 'pending',
    request_date: new Date().toISOString().slice(0, 10), notes: '',
    requested_by: '', request_method: '', duration_impact_days: 0,
    client_signature: '', photos_before: [], photos_after: [],
  })

  useEffect(() => {
    if (isEdit && id) {
      supabase.from('variation_orders').select('*').eq('id', id).single().then(({ data }) => {
        if (data) {
          const d = data as VariationOrder & Record<string, unknown>
          setForm({
            ...d,
            photos_before: Array.isArray(d.photos_before) ? d.photos_before as string[] : [],
            photos_after: Array.isArray(d.photos_after) ? d.photos_after as string[] : [],
          })
          if (d.project_id) {
            setResolvedPid(d.project_id as string)
            supabase.from('projects').select('*').eq('id', d.project_id as string).single().then(({ data: p }) => setProject(p as Project))
          }
        }
      })
    } else if (projectId) {
      setResolvedPid(projectId)
      supabase.from('projects').select('*').eq('id', projectId).single().then(({ data }) => setProject(data as Project))
      supabase.from('variation_orders').select('vo_number').eq('project_id', projectId).then(({ data }) => {
        const count = (data ?? []).length + 1
        setForm(prev => ({ ...prev, vo_number: `VO-${String(count).padStart(3, '0')}` }))
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, id, isEdit])

  const handleSave = async () => {
    if (!form.description) { toast.error('يجب إدخال وصف التغيير'); return }
    setSaving(true)
    try {
      const payload = {
        vo_number: form.vo_number,
        description: form.description,
        amount: form.billable ? (Number(form.amount) || 0) : 0,
        billable: form.billable,
        status: form.status,
        request_date: form.request_date,
        notes: form.notes,
        requested_by: form.requested_by || '',
        request_method: form.request_method || '',
        duration_impact_days: Number(form.duration_impact_days) || 0,
        client_signature: form.client_signature || '',
        signed_at: form.client_signature ? new Date().toISOString() : null,
        photos_before: form.photos_before || [],
        photos_after: form.photos_after || [],
      }
      if (isEdit && id) {
        const { error } = await supabase.from('variation_orders').update(payload).eq('id', id)
        if (error) throw error
        toast.success('تم تحديث أمر التغيير')
      } else {
        const { error } = await supabase.from('variation_orders').insert({ ...payload, project_id: resolvedPid })
        if (error) throw error
        toast.success('تم إضافة أمر التغيير')
      }
      // أمر التغيير يؤثّر على ربحية المشروع → تحديث كاش صفحة المشروع
      queryClient.invalidateQueries({ queryKey: ['project-detail', resolvedPid] })
      navigate(`/projects/${resolvedPid}`)
    } catch (e) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  const billable = !!form.billable

  return (
    <div className="p-6 max-w-2xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{isEdit ? 'تعديل أمر التغيير' : 'إضافة أمر تغيير'}</h1>
          {project && <p className="text-slate-500 text-sm">{project.project_name}</p>}
        </div>
      </div>

      <div className="space-y-5">
        {/* بيانات الأمر */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-700">بيانات أمر التغيير</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input label="رقم أمر التغيير" value={form.vo_number ?? ''} onChange={e => setForm(p => ({ ...p, vo_number: e.target.value }))} dir="ltr" />
            <Input label="تاريخ الطلب" type="date" value={form.request_date ?? ''} onChange={e => setForm(p => ({ ...p, request_date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="مقدّم الطلب (العميل)" value={form.requested_by ?? ''} onChange={e => setForm(p => ({ ...p, requested_by: e.target.value }))} placeholder="اسم العميل" />
            <Select label="طريقة الطلب" value={form.request_method ?? ''} onChange={e => setForm(p => ({ ...p, request_method: e.target.value }))} options={REQUEST_METHODS} />
          </div>
          <Textarea label="وصف التغيير المطلوب *" value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3}
            placeholder="اشرح التغيير الذي طلبه العميل بالتفصيل..." />
        </div>

        {/* التكلفة والمدة */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-700">التكلفة والمدة</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setForm(p => ({ ...p, billable: false, amount: 0 }))}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-colors ${!billable ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
              <Wallet size={18} className={!billable ? 'text-green-600' : 'text-slate-400'} />
              <span className={`font-medium ${!billable ? 'text-green-700' : 'text-slate-500'}`}>تغيير بسيط (مجاني)</span>
            </button>
            <button type="button" onClick={() => setForm(p => ({ ...p, billable: true }))}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-colors ${billable ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
              <CreditCard size={18} className={billable ? 'text-amber-600' : 'text-slate-400'} />
              <span className={`font-medium ${billable ? 'text-amber-700' : 'text-slate-500'}`}>بتكلفة إضافية</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {billable && (
              <Input label="المبلغ الإضافي (د.ب)" type="number" value={String(form.amount ?? 0)} onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} dir="ltr" />
            )}
            <div className={billable ? '' : 'col-span-2'}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Clock size={14} className="text-slate-500" /> تأثير على المدة (أيام إضافية)
              </label>
              <input type="number" value={String(form.duration_impact_days ?? 0)}
                onChange={e => setForm(p => ({ ...p, duration_impact_days: parseInt(e.target.value) || 0 }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-400" dir="ltr" placeholder="0" />
            </div>
          </div>
          <Select label="حالة الموافقة" value={form.status ?? 'pending'}
            onChange={e => setForm(p => ({ ...p, status: e.target.value as VariationOrder['status'] }))}
            options={[
              { value: 'pending', label: 'بانتظار موافقة العميل' },
              { value: 'approved', label: 'موافق عليه' },
              { value: 'rejected', label: 'مرفوض' },
            ]} />
        </div>

        {/* التوثيق البصري */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-700">التوثيق البصري (قبل / بعد)</h2>
          <PhotoUploader label="صور قبل التغيير" photos={form.photos_before ?? []} onChange={ph => setForm(p => ({ ...p, photos_before: ph }))} color="#ef4444" />
          <PhotoUploader label="صور بعد التغيير" photos={form.photos_after ?? []} onChange={ph => setForm(p => ({ ...p, photos_after: ph }))} color="#16a34a" />
        </div>

        {/* التوقيع الرقمي */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <SignaturePad value={form.client_signature ?? ''} onChange={s => setForm(p => ({ ...p, client_signature: s }))} />
        </div>

        {/* ملاحظات */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <Textarea label="ملاحظات إضافية" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
        </div>

        <div className="flex gap-3">
          <Button loading={saving} onClick={handleSave}>{isEdit ? 'حفظ التعديلات' : 'حفظ أمر التغيير'}</Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>إلغاء</Button>
        </div>
      </div>
    </div>
  )
}
