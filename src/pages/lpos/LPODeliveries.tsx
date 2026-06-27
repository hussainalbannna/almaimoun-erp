import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Truck, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { LPO, LPOItem, LPODelivery, LPODeliveryItem } from '../../types'
import { formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

export default function LPODeliveries() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lpo, setLpo] = useState<LPO | null>(null)
  const [items, setItems] = useState<LPOItem[]>([])
  const [deliveries, setDeliveries] = useState<(LPODelivery & { items: LPODeliveryItem[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ delivery_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const load = async () => {
    setLoading(true)
    const [lpoRes, itemsRes, delRes] = await Promise.all([
      supabase.from('lpos').select('*').eq('id', id).single(),
      supabase.from('lpo_items').select('*').eq('lpo_id', id).order('sort_order'),
      supabase.from('lpo_deliveries').select('*').eq('lpo_id', id).order('delivery_number'),
    ])
    const lpoData = lpoRes.data as LPO
    const itemsData = (itemsRes.data ?? []) as LPOItem[]
    setLpo(lpoData)
    setItems(itemsData)

    const dels = (delRes.data ?? []) as LPODelivery[]
    const delsWithItems = await Promise.all(dels.map(async d => {
      const { data: diData } = await supabase.from('lpo_delivery_items').select('*').eq('delivery_id', d.id)
      return { ...d, items: (diData ?? []) as LPODeliveryItem[] }
    }))
    setDeliveries(delsWithItems)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const getDeliveredQty = (itemId: string) =>
    deliveries.flatMap(d => d.items).filter(di => di.lpo_item_id === itemId).reduce((s, di) => s + Number(di.quantity_delivered), 0)

  const getProgress = () => {
    if (items.length === 0) return 0
    const totalOrdered = items.reduce((s, i) => s + Number(i.quantity), 0)
    const totalDelivered = items.reduce((s, i) => s + getDeliveredQty(i.id!), 0)
    return totalOrdered > 0 ? Math.min(100, (totalDelivered / totalOrdered) * 100) : 0
  }

  const progress = getProgress()
  const isComplete = progress >= 100

  const handleAddDelivery = async () => {
    const hasQty = Object.values(quantities).some(q => q > 0)
    if (!hasQty) { toast.error('يجب إدخال كمية واحدة على الأقل'); return }
    setSaving(true)
    try {
      const delNum = deliveries.length + 1
      const { data: del, error } = await supabase.from('lpo_deliveries').insert({
        lpo_id: id, delivery_number: delNum,
        delivery_date: form.delivery_date, notes: form.notes,
      }).select().single()
      if (error) throw error

      for (const [itemId, qty] of Object.entries(quantities)) {
        if (qty > 0) {
          const item = items.find(i => i.id === itemId)
          await supabase.from('lpo_delivery_items').insert({
            delivery_id: (del as LPODelivery).id,
            lpo_item_id: itemId,
            description: item?.description ?? '',
            quantity_delivered: qty,
          })
        }
      }
      // Check if all delivered
      const newProgress = getProgress()
      if (newProgress >= 99) {
        await supabase.from('lpos').update({ status: 'received' }).eq('id', id)
      }
      toast.success(`تم تسجيل التسليم رقم ${delNum}`)
      setShowForm(false)
      setQuantities({})
      load()
    } catch (e: unknown) {
      toast.error('حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
  if (!lpo) return <div className="p-12 text-center text-slate-400">أمر الشراء غير موجود</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">سجل التسليم — {lpo.lpo_number}</h1>
          <p className="text-slate-500 text-sm">{lpo.supplier_name}</p>
        </div>
      </div>

      {/* Progress */}
      <div className={`rounded-xl border p-4 mb-6 ${isComplete ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-slate-700">نسبة الاستلام</span>
          <span className={`font-bold text-lg ${isComplete ? 'text-green-700' : 'text-amber-700'}`}>{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: isComplete ? '#16a34a' : '#c4925a' }} />
        </div>
        {isComplete && (
          <div className="flex items-center gap-2 mt-2 text-green-700 font-semibold text-sm">
            <CheckCircle size={16} /> تم توصيل الطلب بالكامل
          </div>
        )}
      </div>

      {/* Items summary */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-700 text-sm">ملخص العناصر</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-right font-semibold text-slate-600">الصنف</th>
              <th className="px-4 py-2 text-center font-semibold text-slate-600">الكمية المطلوبة</th>
              <th className="px-4 py-2 text-center font-semibold text-slate-600">المستلمة</th>
              <th className="px-4 py-2 text-center font-semibold text-slate-600">المتبقية</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(item => {
              const delivered = getDeliveredQty(item.id!)
              const remaining = Number(item.quantity) - delivered
              return (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 text-slate-800">{item.description}</td>
                  <td className="px-4 py-2.5 text-center">{item.quantity} {item.unit}</td>
                  <td className="px-4 py-2.5 text-center text-green-700 font-medium">{delivered}</td>
                  <td className={`px-4 py-2.5 text-center font-medium ${remaining > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{remaining}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Delivery history */}
      <div className="space-y-3 mb-6">
        {deliveries.map(del => (
          <div key={del.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Truck size={16} className="text-amber-600" />
              <span className="font-semibold text-slate-700">تسليم رقم {del.delivery_number}</span>
              <span className="text-slate-400 text-sm">— {formatDate(del.delivery_date)}</span>
            </div>
            {del.notes && <p className="text-sm text-slate-500 mb-2">{del.notes}</p>}
            <div className="space-y-1">
              {del.items.map(di => (
                <div key={di.id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{di.description || items.find(i => i.id === di.lpo_item_id)?.description}</span>
                  <span className="font-medium text-green-700">+{di.quantity_delivered}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add delivery form */}
      {showForm ? (
        <div className="bg-white rounded-xl border border-amber-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4">تسجيل تسليم جديد</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Input label="تاريخ التسليم" type="date" value={form.delivery_date} onChange={e => setForm(p => ({ ...p, delivery_date: e.target.value }))} />
          </div>
          <div className="space-y-3 mb-4">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-4">
                <span className="flex-1 text-sm text-slate-700">{item.description}</span>
                <Input
                  label={`كمية (من ${Number(item.quantity) - getDeliveredQty(item.id!)} متبقية)`}
                  type="number"
                  value={String(quantities[item.id!] ?? 0)}
                  onChange={e => setQuantities(p => ({ ...p, [item.id!]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            ))}
          </div>
          <Textarea label="ملاحظات" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
          <div className="flex gap-3 mt-4">
            <Button loading={saving} onClick={handleAddDelivery}>تسجيل التسليم</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </div>
      ) : (
        !isComplete && (
          <Button icon={<Plus size={16} />} onClick={() => setShowForm(true)}>تسجيل تسليم جزئي</Button>
        )
      )}
    </div>
  )
}
