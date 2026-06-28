import { useEffect, useState } from 'react'
import { Plus, Truck, MapPin } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
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
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  equipment: 'معدة',
  vehicle: 'مركبة',
  tool: 'أداة',
  scaffolding: 'سقالات',
  generator: 'مولد',
  other: 'أخرى',
}

const STATUS_COLORS: Record<string, string> = {
  available: 'green',
  in_use: 'blue',
  maintenance: 'orange',
  retired: 'gray',
}

const STATUS_LABELS: Record<string, string> = {
  available: 'متاح',
  in_use: 'قيد الاستخدام',
  maintenance: 'صيانة',
  retired: 'مستبعد',
}

export default function AssetList() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '', asset_type: 'equipment', plate_number: '', serial_number: '',
    purchase_date: '', purchase_value: '', current_location: '', status: 'available',
    insurance_expiry: '', registration_expiry: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('assets').select('*').order('created_at', { ascending: false })
    setAssets((data ?? []) as Asset[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم الأصل'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('assets').insert({
        ...form,
        purchase_value: Number(form.purchase_value) || 0,
        purchase_date: form.purchase_date || null,
        insurance_expiry: form.insurance_expiry || null,
        registration_expiry: form.registration_expiry || null,
      })
      if (error) throw error
      toast.success('تم إضافة الأصل')
      setShowForm(false)
      setForm({ name: '', asset_type: 'equipment', plate_number: '', serial_number: '', purchase_date: '', purchase_value: '', current_location: '', status: 'available', insurance_expiry: '', registration_expiry: '', notes: '' })
      load()
    } catch { toast.error('حدث خطأ') }
    finally { setSaving(false) }
  }

  const filtered = assets.filter(a =>
    a.name.includes(search) || a.plate_number.includes(search) || a.current_location.includes(search)
  )

  if (loading) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">الأصول والمعدات</h1>
          <p className="text-slate-500 text-sm">{assets.length} أصل مسجل</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowForm(true)}>إضافة أصل</Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-4">
          <div className="font-semibold text-slate-700 mb-2">أصل جديد</div>
          <div className="grid grid-cols-3 gap-3">
            <input className="input-field" placeholder="اسم الأصل *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <select className="input-field" value={form.asset_type} onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))}>
              {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="input-field" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input className="input-field" placeholder="رقم اللوحة" value={form.plate_number} onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))} />
            <input className="input-field" placeholder="الرقم التسلسلي" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
            <input className="input-field" placeholder="الموقع الحالي" value={form.current_location} onChange={e => setForm(f => ({ ...f, current_location: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-slate-500">تاريخ الشراء</label><input className="input-field" type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
            <div><label className="text-xs text-slate-500">قيمة الشراء</label><input className="input-field" type="number" value={form.purchase_value} onChange={e => setForm(f => ({ ...f, purchase_value: e.target.value }))} /></div>
            <div><label className="text-xs text-slate-500">انتهاء التأمين</label><input className="input-field" type="date" value={form.insurance_expiry} onChange={e => setForm(f => ({ ...f, insurance_expiry: e.target.value }))} /></div>
          </div>
          <textarea className="input-field w-full" rows={2} placeholder="ملاحظات" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex gap-2">
            <Button loading={saving} onClick={handleSave}>حفظ</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      <div className="mb-4">
        <input
          className="w-full max-w-sm h-9 px-4 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          placeholder="بحث بالاسم أو اللوحة أو الموقع..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Truck size={48} className="mx-auto mb-3 opacity-40" />
          <p>لا توجد أصول مسجلة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(asset => (
            <div key={asset.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-slate-800">{asset.name}</div>
                  <div className="text-xs text-slate-500">{ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}</div>
                </div>
                <Badge color={(STATUS_COLORS[asset.status] || 'gray') as any}>{STATUS_LABELS[asset.status] || asset.status}</Badge>
              </div>
              {asset.plate_number && <div className="text-sm text-slate-600 mb-1">اللوحة: {asset.plate_number}</div>}
              {asset.current_location && (
                <div className="flex items-center gap-1 text-sm text-slate-500">
                  <MapPin size={12} /> {asset.current_location}
                </div>
              )}
              {asset.purchase_value > 0 && (
                <div className="text-sm text-slate-600 mt-2">القيمة: {formatCurrency(asset.purchase_value)}</div>
              )}
              {asset.insurance_expiry && (
                <div className="text-xs text-slate-400 mt-1">التأمين: {formatDate(asset.insurance_expiry)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`.input-field { height: 36px; padding: 0 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; width: 100%; outline: none; transition: border-color 0.2s; } .input-field:focus { border-color: #c4925a; box-shadow: 0 0 0 3px rgba(196,146,90,0.1); }`}</style>
    </div>
  )
}
