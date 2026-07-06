import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Truck, MapPin, CreditCard, Wallet, CalendarClock, CheckCircle2, AlertTriangle, Building2, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Badge, { type BadgeColor } from '../../components/ui/Badge'
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
  // الأقساط
  payment_method: string
  bank_name: string
  finance_amount: number
  down_payment: number
  monthly_installment: number
  total_installments: number
  paid_installments: number
  next_installment_date: string | null
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  equipment: 'معدة', vehicle: 'مركبة', tool: 'أداة',
  scaffolding: 'سقالات', generator: 'مولد', other: 'أخرى',
}
const STATUS_COLORS: Record<string, BadgeColor> = { available: 'green', in_use: 'blue', maintenance: 'orange', retired: 'gray' }
const STATUS_LABELS: Record<string, string> = { available: 'متاح', in_use: 'قيد الاستخدام', maintenance: 'صيانة', retired: 'مستبعد' }

const emptyForm = {
  name: '', asset_type: 'equipment', plate_number: '', serial_number: '',
  purchase_date: '', purchase_value: '', current_location: '', status: 'available',
  insurance_expiry: '', registration_expiry: '', notes: '',
  payment_method: 'cash', bank_name: '', finance_amount: '', down_payment: '',
  monthly_installment: '', total_installments: '', paid_installments: '', next_installment_date: '',
}

// حساب أيام حتى تاريخ
const daysUntil = (date: string | null) => {
  if (!date) return null
  const diff = new Date(date).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / 86400000)
}

// جلب الأصول (مصدر React Query)
async function fetchAssets(): Promise<Asset[]> {
  const { data } = await supabase.from('assets').select('*').order('created_at', { ascending: false })
  return (data ?? []) as Asset[]
}

export default function AssetList() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const { data: assets = [], isLoading } = useQuery({ queryKey: ['assets'], queryFn: fetchAssets })
  // بعد أي تعديل: إبطال الكاش فيتحدّث كل مستهلِك لهذا المفتاح تلقائياً
  const reload = () => queryClient.invalidateQueries({ queryKey: ['assets'] })

  const openNew = () => { setEditId(null); setForm(emptyForm); setShowForm(true) }
  const openEdit = (a: Asset) => {
    setEditId(a.id)
    setForm({
      name: a.name ?? '', asset_type: a.asset_type ?? 'equipment', plate_number: a.plate_number ?? '',
      serial_number: a.serial_number ?? '', purchase_date: a.purchase_date ?? '', purchase_value: a.purchase_value ? String(a.purchase_value) : '',
      current_location: a.current_location ?? '', status: a.status ?? 'available',
      insurance_expiry: a.insurance_expiry ?? '', registration_expiry: a.registration_expiry ?? '', notes: a.notes ?? '',
      payment_method: a.payment_method ?? 'cash', bank_name: a.bank_name ?? '',
      finance_amount: a.finance_amount ? String(a.finance_amount) : '', down_payment: a.down_payment ? String(a.down_payment) : '',
      monthly_installment: a.monthly_installment ? String(a.monthly_installment) : '', total_installments: a.total_installments ? String(a.total_installments) : '',
      paid_installments: a.paid_installments ? String(a.paid_installments) : '', next_installment_date: a.next_installment_date ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم الأصل'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name, asset_type: form.asset_type, plate_number: form.plate_number, serial_number: form.serial_number,
        current_location: form.current_location, status: form.status, notes: form.notes,
        purchase_value: Number(form.purchase_value) || 0,
        purchase_date: form.purchase_date || null,
        insurance_expiry: form.insurance_expiry || null,
        registration_expiry: form.registration_expiry || null,
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
        toast.success('تم إضافة الأصل')
      }
      setShowForm(false); setForm(emptyForm); setEditId(null); reload()
    } catch (e) { toast.error('حدث خطأ: ' + ((e as Error)?.message ?? '')) }
    finally { setSaving(false) }
  }

  // تسجيل دفع قسط (زيادة المدفوع + تحديث التاريخ القادم شهر)
  const payInstallment = async (a: Asset) => {
    if (a.paid_installments >= a.total_installments) { toast.error('تم سداد جميع الأقساط'); return }
    const nextDate = a.next_installment_date ? new Date(a.next_installment_date) : new Date()
    nextDate.setMonth(nextDate.getMonth() + 1)
    const { error } = await supabase.from('assets').update({
      paid_installments: a.paid_installments + 1,
      next_installment_date: nextDate.toISOString().slice(0, 10),
    }).eq('id', a.id)
    if (error) { toast.error('حدث خطأ'); return }
    toast.success('تم تسجيل دفع القسط')
    reload()
  }

  const filtered = useMemo(() =>
    assets.filter(a =>
      (a.name || '').includes(search) || (a.plate_number || '').includes(search) || (a.current_location || '').includes(search)
    ),
    [assets, search],
  )

  // إحصائيات الأقساط — تُحسب فقط عند تغيّر الأصول (لا عند كل رندر/كتابة في النموذج)
  const { installmentAssets, totalRemaining, dueSoon } = useMemo(() => {
    const installmentAssets = assets.filter(a => a.payment_method === 'installment')
    const totalRemaining = installmentAssets.reduce((s, a) => {
      const remaining = (a.total_installments - a.paid_installments) * a.monthly_installment
      return s + (remaining > 0 ? remaining : 0)
    }, 0)
    const dueSoon = installmentAssets.filter(a => {
      const d = daysUntil(a.next_installment_date)
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

      {/* بطاقات إحصائية للأقساط */}
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
            <Select value={form.asset_type} onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))}
              options={Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
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

          {/* ═══ طريقة الشراء: نقدي / أقساط ═══ */}
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

            {/* حقول الأقساط */}
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
                {/* ملخص حسابي مباشر */}
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
              </div>
            )}
          </div>

          <Textarea placeholder="ملاحظات" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex gap-2">
            <Button loading={saving} onClick={handleSave}>{editId ? 'حفظ التعديلات' : 'حفظ'}</Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditId(null) }}>إلغاء</Button>
          </div>
        </div>
      )}

      <div className="mb-4 max-w-sm">
        <Input placeholder="بحث بالاسم أو اللوحة أو الموقع..." value={search} onChange={e => setSearch(e.target.value)} />
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
            const dDays = daysUntil(asset.next_installment_date)
            const isDue = !isPaidOff && dDays !== null && dDays <= 7

            return (
              <div key={asset.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => openEdit(asset)}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      {asset.name}
                      {isInstAsset && <CreditCard size={13} className="text-purple-500" />}
                    </div>
                    <div className="text-xs text-slate-500">{ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}</div>
                  </div>
                  <Badge color={STATUS_COLORS[asset.status] || 'gray'}>{STATUS_LABELS[asset.status] || asset.status}</Badge>
                </div>
                {asset.plate_number && <div className="text-sm text-slate-600 mb-1" dir="ltr" style={{ textAlign: 'right' }}>اللوحة: {asset.plate_number}</div>}
                {asset.current_location && (
                  <div className="flex items-center gap-1 text-sm text-slate-500"><MapPin size={12} /> {asset.current_location}</div>
                )}
                {asset.purchase_value > 0 && (
                  <div className="text-sm text-slate-600 mt-2">القيمة الكلية: <span dir="ltr">{formatCurrency(asset.purchase_value)}</span></div>
                )}

                {/* ═══ قسم الأقساط ═══ */}
                {isInstAsset && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    {asset.bank_name && (
                      <div className="flex items-center gap-1.5 text-xs text-purple-700 mb-2">
                        <Building2 size={12} /> {asset.bank_name}
                      </div>
                    )}
                    {/* شريط التقدّم */}
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
                        {/* تنبيه القسط القادم */}
                        {asset.next_installment_date && (
                          <div className={`flex items-center gap-1.5 text-xs rounded-lg p-2 mb-2 ${isDue ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>
                            <CalendarClock size={13} />
                            القسط القادم: {formatDate(asset.next_installment_date)}
                            {isDue && dDays !== null && <span className="font-bold mr-1">({dDays <= 0 ? 'مستحق الآن!' : `خلال ${dDays} يوم`})</span>}
                          </div>
                        )}
                        <button onClick={e => { e.stopPropagation(); payInstallment(asset) }}
                          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-white py-2 rounded-lg transition-opacity hover:opacity-90"
                          style={{ background: 'linear-gradient(135deg, #a855f7, #7b4a2d)' }}>
                          <CheckCircle2 size={14} /> تسجيل دفع قسط
                        </button>
                      </>
                    )}
                  </div>
                )}

                {asset.insurance_expiry && !isInstAsset && (
                  <div className="text-xs text-slate-400 mt-1">التأمين: {formatDate(asset.insurance_expiry)}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}