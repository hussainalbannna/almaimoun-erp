import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight, X, Upload, FileText, Wrench, Package, Truck, Building2, Home, Zap,
  Calendar, Wallet, Receipt, Repeat, Clock
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { compressImage, fileToDataUrl, openStoredFile } from '../../lib/ai'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

interface ProjectOption { id: string; project_name: string }

const CATEGORIES = [
  { value: 'equipment', label: 'معدات', icon: <Wrench size={16} /> },
  { value: 'scaffolding', label: 'سقالات', icon: <Package size={16} /> },
  { value: 'vehicle', label: 'مركبة', icon: <Truck size={16} /> },
  { value: 'shop', label: 'محل/مكتب', icon: <Building2 size={16} /> },
  { value: 'housing', label: 'سكن عمال', icon: <Home size={16} /> },
  { value: 'electricity', label: 'كهرباء', icon: <Zap size={16} /> },
  { value: 'other', label: 'أخرى', icon: <Package size={16} /> },
]
const todayISO = () => new Date().toISOString().slice(0, 10)
const isImageData = (data: string) => !!data && data.startsWith('data:image')
const isPdfData = (data: string) => !!data && data.startsWith('data:application/pdf')

export default function RentalForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    category: 'equipment',
    rental_type: 'recurring' as 'temporary' | 'recurring',
    vendor_name: '',
    project_id: '',
    project_name: '',
    cost: '',
    billing_cycle: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'one_time',
    start_date: todayISO(),
    end_date: '',
    due_day: '1',
    status: 'active',
    contract_data: '',
    notes: '',
  })

  useEffect(() => {
    supabase.from('projects').select('id, project_name').order('project_name').then(({ data }) => {
      setProjects((data ?? []) as ProjectOption[])
    })

    if (isEdit) {
      supabase.from('rentals').select('*').eq('id', id).single().then(({ data }) => {
        if (data) {
          setForm({
            name: data.name ?? '',
            category: data.category ?? 'equipment',
            rental_type: data.rental_type ?? 'recurring',
            vendor_name: data.vendor_name ?? '',
            project_id: data.project_id ?? '',
            project_name: data.project_name ?? '',
            cost: String(data.cost ?? ''),
            billing_cycle: data.billing_cycle ?? 'monthly',
            start_date: data.start_date ?? todayISO(),
            end_date: data.end_date ?? '',
            due_day: data.due_day ? String(data.due_day) : '1',
            status: data.status ?? 'active',
            contract_data: data.contract_data ?? '',
            notes: data.notes ?? '',
          })
        }
      })
    }
  }, [id, isEdit])

  const handleProjectChange = (projectId: string) => {
    const p = projects.find(x => x.id === projectId)
    setForm(f => ({ ...f, project_id: projectId, project_name: p?.project_name ?? '' }))
  }

  const uploadContract = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('الحجم أقل من 10 ميجا'); return }
    try {
      const data = file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)
      setForm(f => ({ ...f, contract_data: data }))
    } catch { toast.error('تعذّر رفع الملف') }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم الإيجار'); return }
    if (!form.cost || Number(form.cost) <= 0) { toast.error('أدخل التكلفة'); return }
    if (form.rental_type === 'temporary' && !form.start_date) { toast.error('أدخل تاريخ البداية'); return }
    if (form.rental_type === 'recurring' && (!form.due_day || Number(form.due_day) < 1 || Number(form.due_day) > 31)) { toast.error('أدخل يوم استحقاق صحيح (1-31)'); return }

    setSaving(true)
    const payload = {
      name: form.name,
      category: form.category,
      rental_type: form.rental_type,
      vendor_name: form.vendor_name,
      project_id: form.project_id || null,
      project_name: form.project_name,
      cost: Number(form.cost),
      billing_cycle: form.billing_cycle,
      start_date: form.rental_type === 'temporary' ? (form.start_date || null) : (form.start_date || null),
      end_date: form.rental_type === 'temporary' ? (form.end_date || null) : null,
      due_day: form.rental_type === 'recurring' ? Number(form.due_day) : null,
      status: form.status,
      contract_data: form.contract_data,
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }

    if (isEdit) {
      const { error } = await supabase.from('rentals').update(payload).eq('id', id)
      if (error) { toast.error('فشل الحفظ: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('rentals').insert(payload)
      if (error) { toast.error('فشل الحفظ: ' + error.message); setSaving(false); return }
    }

    toast.success(isEdit ? 'تم تحديث الإيجار' : 'تم تسجيل الإيجار')
    setSaving(false)
    navigate('/rentals')
  }

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-300"

  return (
    <div className="p-6 max-w-3xl mx-auto" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/rentals')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600"><ArrowRight size={20} /></button>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <Receipt size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{isEdit ? 'تعديل إيجار' : 'تسجيل إيجار / مصروف ثابت'}</h1>
            <p className="text-slate-500 text-sm mt-0.5">معدة، سقالات، مركبة، محل، سكن، كهرباء، أو أي مصروف دوري</p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* نوع الإيجار: مؤقت أو دوري */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-4">نوع الإيجار</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setForm(f => ({ ...f, rental_type: 'recurring', billing_cycle: 'monthly' }))}
              className={`p-4 rounded-xl border-2 text-right transition-colors ${form.rental_type === 'recurring' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Repeat size={18} className={form.rental_type === 'recurring' ? 'text-amber-600' : 'text-slate-400'} />
                <span className={`font-bold ${form.rental_type === 'recurring' ? 'text-amber-700' : 'text-slate-600'}`}>دوري ثابت</span>
              </div>
              <p className="text-xs text-slate-500">يتكرر شهرياً (المحل، السكن، الباص، الكهرباء)</p>
            </button>
            <button type="button" onClick={() => setForm(f => ({ ...f, rental_type: 'temporary' }))}
              className={`p-4 rounded-xl border-2 text-right transition-colors ${form.rental_type === 'temporary' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Clock size={18} className={form.rental_type === 'temporary' ? 'text-amber-600' : 'text-slate-400'} />
                <span className={`font-bold ${form.rental_type === 'temporary' ? 'text-amber-700' : 'text-slate-600'}`}>مؤقت</span>
              </div>
              <p className="text-xs text-slate-500">لفترة محددة بتاريخ نهاية (سقالات، معدة لموقع)</p>
            </button>
          </div>
        </div>

        {/* البيانات الأساسية */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-4">البيانات الأساسية</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">اسم الإيجار *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls}
                placeholder="مثال: سقالات موقع سترة، إيجار المحل، باص العمال" />
            </div>

            {/* الفئة */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">الفئة</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {CATEGORIES.map(cat => (
                  <button key={cat.value} type="button" onClick={() => setForm(f => ({ ...f, category: cat.value }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors ${form.category === cat.value ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                    <div className={form.category === cat.value ? 'text-amber-600' : 'text-slate-400'}>{cat.icon}</div>
                    <span className={`text-xs font-medium ${form.category === cat.value ? 'text-amber-700' : 'text-slate-600'}`}>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">الجهة المؤجّرة</label>
                <input type="text" value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} className={inputCls}
                  placeholder="اسم الشركة أو المالك" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><Building2 size={14} className="text-slate-400" /> المشروع المرتبط</label>
                <select value={form.project_id} onChange={e => handleProjectChange(e.target.value)} className={inputCls}>
                  <option value="">— عام (غير مرتبط بمشروع) —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
                <p className="text-xs text-amber-600/80 mt-1">الإيجار المرتبط بمشروع تُحسب دفعاته ضمن مصاريف المشروع</p>
              </div>
            </div>
          </div>
        </div>

        {/* التكلفة والدورية */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Wallet size={17} className="text-amber-600" /> التكلفة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">التكلفة (د.ب) *</label>
              <input type="number" step="0.001" min="0" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} className={inputCls} dir="ltr" placeholder="0.000" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">دورة الاحتساب</label>
              <select value={form.billing_cycle} onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value as typeof form.billing_cycle }))} className={inputCls}>
                <option value="daily">يومي</option>
                <option value="weekly">أسبوعي</option>
                <option value="monthly">شهري</option>
                <option value="one_time">مرة واحدة</option>
              </select>
            </div>
          </div>
        </div>

        {/* تفاصيل التوقيت حسب النوع */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Calendar size={17} className="text-amber-600" /> التوقيت</h2>
          {form.rental_type === 'temporary' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">تاريخ الاستلام/البداية *</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">تاريخ الإرجاع/النهاية</label>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} />
                <p className="text-xs text-slate-400 mt-1">يظهر تنبيه قبل انتهائه بـ 7 أيام</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">يوم الاستحقاق الشهري *</label>
                <input type="number" min="1" max="31" value={form.due_day} onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} className={inputCls} dir="ltr" placeholder="1" />
                <p className="text-xs text-slate-400 mt-1">اليوم من الشهر الذي يُستحق فيه الدفع (1-31)</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">تاريخ بداية العقد</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {/* العقد + الحالة + ملاحظات */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">العقد المرفق (اختياري)</label>
            <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-amber-400 hover:bg-amber-50/40 transition-colors">
              <Upload size={15} className="text-slate-400" /> اختر ملفاً (صورة أو PDF)
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadContract(f); e.target.value = '' }} />
            </label>
            {form.contract_data && (
              <div className="mt-2 relative inline-block">
                {isImageData(form.contract_data) ? (
                  <button type="button" onClick={() => setPreviewImage(form.contract_data)} className="w-24 h-24 rounded-xl border border-slate-200 overflow-hidden block"><img src={form.contract_data} alt="العقد" className="w-full h-full object-cover" /></button>
                ) : (
                  <button type="button" onClick={() => openStoredFile(form.contract_data, isPdfData(form.contract_data) ? 'application/pdf' : '')} className="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1"><FileText size={26} className="text-red-500" /><span className="text-[10px] text-slate-600">عرض الملف</span></button>
                )}
                <button type="button" onClick={() => setForm(f => ({ ...f, contract_data: '' }))} className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md"><X size={13} /></button>
              </div>
            )}
          </div>

          {isEdit && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">حالة الإيجار</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                <option value="active">نشط</option>
                <option value="ended">منتهٍ</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none" placeholder="ملاحظات إضافية..." />
          </div>
        </div>

        {/* الأزرار */}
        <div className="flex gap-3 pt-1">
          <Button onClick={handleSave} loading={saving}>{isEdit ? 'تحديث الإيجار' : 'حفظ الإيجار'}</Button>
          <Button variant="secondary" onClick={() => navigate('/rentals')}>إلغاء</Button>
        </div>
      </div>

      {/* معاينة الصورة */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} className="absolute -top-3 -right-3 bg-white text-slate-700 rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-slate-100"><X size={18} /></button>
            <img src={previewImage} alt="معاينة" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )
}
