import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Truck, Wrench, Package, ChevronLeft, AlertTriangle, MapPin, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, daysUntil, alertLevel, alertStyles } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

interface Asset {
  id: string
  name: string
  asset_type: string
  plate_number: string
  serial_number: string
  purchase_date: string | null
  purchase_value: number
  current_project_id: string | null
  current_location: string
  status: string
  insurance_expiry: string | null
  registration_expiry: string | null
  notes: string
}

interface Project { id: string; project_name: string }

const TYPE_OPTIONS = [
  { value: 'vehicle', label: 'مركبة' },
  { value: 'equipment', label: 'معدة' },
  { value: 'scaffolding', label: 'سقالات' },
  { value: 'tool', label: 'أداة' },
  { value: 'other', label: 'أخرى' },
]

const STATUS_OPTIONS = [
  { value: 'available', label: 'متاح' },
  { value: 'in_use', label: 'قيد الاستخدام' },
  { value: 'maintenance', label: 'صيانة' },
  { value: 'retired', label: 'خارج الخدمة' },
]

const TYPE_LABEL: Record<string, string> = {
  vehicle: 'مركبة', equipment: 'معدة', scaffolding: 'سقالات', tool: 'أداة', other: 'أخرى',
}
const TYPE_ICON: Record<string, typeof Truck> = {
  vehicle: Truck, equipment: Wrench, scaffolding: Package, tool: Wrench, other: Package,
}
const STATUS_STYLE: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  in_use: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-orange-100 text-orange-700',
  retired: 'bg-slate-100 text-slate-500',
}
const STATUS_LABEL: Record<string, string> = {
  available: 'متاح', in_use: 'قيد الاستخدام', maintenance: 'صيانة', retired: 'خارج الخدمة',
}

const emptyForm = {
  name: '', asset_type: 'equipment', plate_number: '', serial_number: '',
  purchase_date: '', purchase_value: '', current_location: '', status: 'available',
  insurance_expiry: '', registration_expiry: '', notes: '', current_project_id: '',
}

export default function AssetList() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState<Asset[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [aRes, pRes] = await Promise.all([
      supabase.from('assets').select('*').order('name'),
      supabase.from('projects').select('id, project_name').eq('status', 'active'),
    ])
    setAssets((aRes.data ?? []) as Asset[])
    setProjects((pRes.data ?? []) as Project[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم الأصل'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('assets').insert({
        name: form.name,
        asset_type: form.asset_type,
        plate_number: form.plate_number,
        serial_number: form.serial_number,
        purchase_date: form.purchase_date || null,
        purchase_value: Number(form.purchase_value) || 0,
        current_location: form.current_location,
        current_project_id: form.current_project_id || null,
        status: form.status,
        insurance_expiry: form.insurance_expiry || null,
        registration_expiry: form.registration_expiry || null,
        notes: form.notes,
      })
      if (error) throw error
      toast.success('تم إضافة الأصل')
      setShowForm(false)
      setForm(emptyForm)
      load()
    } catch {
      toast.error('حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const filtered = typeFilter === 'all' ? assets : assets.filter(a => a.asset_type === typeFilter)
  const totalValue = assets.reduce((s, a) => s + Number(a.purchase_value), 0)
  const inUse = assets.filter(a => a.status === 'in_use').length

  // تنبيهات انتهاء التأمين/الاستمارة
  const expiringAlerts = assets.filter(a => {
    const ins = a.insurance_expiry ? daysUntil(a.insurance_expiry) : 9999
    const reg = a.registration_expiry ? daysUntil(a.registration_expiry) : 9999
    return ins <= 30 || reg <= 30
  })

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">الأصول والمعدات</h1>
            <p className="text-slate-500 text-sm mt-0.5">مركبات · معدات · سقالات</p>
          </div>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowForm(true)}>إضافة أصل</Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">إجمالي القيمة</div>
          <div className="text-xl font-bold" style={{ color: '#7b4a2d' }}>{formatCurrency(totalValue)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">عدد الأصول</div>
          <div className="text-xl font-bold text-slate-700">{assets.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">{inUse} قيد الاستخدام</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">تنبيهات التأمين/الاستمارة</div>
          <div className={`text-xl font-bold ${expiringAlerts.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {expiringAlerts.length}
          </div>
        </div>
      </div>

      {/* تنبيهات */}
      {expiringAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 text-red-800 font-medium text-sm mb-2">
            <AlertTriangle size={16} /> تنبيهات قرب الانتهاء
          </div>
          <div className="space-y-1">
            {expiringAlerts.map(a => {
              const ins = a.insurance_expiry ? daysUntil(a.insurance_expiry) : 9999
              const reg = a.registration_expiry ? daysUntil(a.registration_expiry) : 9999
              return (
                <div key={a.id} className="text-xs text-red-700">
                  {a.name}: {ins <= 30 && `التأمين ${ins < 0 ? 'منتهي' : `بعد ${ins} يوم`}`}
                  {ins <= 30 && reg <= 30 && ' — '}
                  {reg <= 30 && `الاستمارة ${reg < 0 ? 'منتهية' : `بعد ${reg} يوم`}`}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* فلتر */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setTypeFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${typeFilter === 'all' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
          الكل
        </button>
        {TYPE_OPTIONS.map(o => (
          <button key={o.value} onClick={() => setTypeFilter(o.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${typeFilter === o.value ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {/* نموذج الإضافة */}
      {showForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-5 space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-medium text-amber-900">أصل جديد</div>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="الاسم *" value={form.name} onChange={set('name')} placeholder="بيكاب تويوتا / سقالة" />
            <Select label="النوع" value={form.asset_type} onChange={set('asset_type')} options={TYPE_OPTIONS} />
          </div>
          {form.asset_type === 'vehicle' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="رقم اللوحة" value={form.plate_number} onChange={set('plate_number')} />
              <Input label="تاريخ انتهاء الاستمارة" value={form.registration_expiry} onChange={set('registration_expiry')} type="date" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="قيمة الشراء" value={form.purchase_value} onChange={set('purchase_value')} type="number" />
            <Input label="تاريخ الشراء" value={form.purchase_date} onChange={set('purchase_date')} type="date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="الحالة" value={form.status} onChange={set('status')} options={STATUS_OPTIONS} />
            <Select label="المشروع الحالي" value={form.current_project_id} onChange={set('current_project_id')}
              options={[{ value: '', label: '— المستودع —' }, ...projects.map(p => ({ value: p.id, label: p.project_name }))]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="الموقع الحالي" value={form.current_location} onChange={set('current_location')} placeholder="المستودع / موقع سترة" />
            <Input label="تاريخ انتهاء التأمين" value={form.insurance_expiry} onChange={set('insurance_expiry')} type="date" />
          </div>
          <Textarea label="ملاحظات" value={form.notes} onChange={set('notes')} rows={2} />
          <div className="flex gap-2">
            <Button loading={saving} onClick={handleSave}>حفظ</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      {/* القائمة */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-500 font-medium">لا توجد أصول</p>
          <Button className="mt-4" icon={<Plus size={16} />} onClick={() => setShowForm(true)}>إضافة أصل</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(asset => {
            const Icon = TYPE_ICON[asset.asset_type] ?? Package
            const proj = projects.find(p => p.id === asset.current_project_id)
            return (
              <div key={asset.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <Icon size={18} style={{ color: '#c4925a' }} />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">{asset.name}</div>
                      <div className="text-xs text-slate-500">{TYPE_LABEL[asset.asset_type]}</div>
                      {asset.plate_number && <div className="text-xs text-slate-400 mt-0.5" dir="ltr">{asset.plate_number}</div>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[asset.status]}`}>
                    {STATUS_LABEL[asset.status]}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-slate-500">
                    <MapPin size={11} />
                    <span>{proj?.project_name || asset.current_location || 'المستودع'}</span>
                  </div>
                  {asset.purchase_value > 0 && (
                    <span className="font-medium" style={{ color: '#7b4a2d' }}>{formatCurrency(Number(asset.purchase_value))}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}