import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Plus, Trash2, Sparkles, Loader2, GripVertical } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'
import { readDocumentText, extractJSON, hasApiKey } from '../../lib/ai'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

interface Item {
  id: string
  description: string
  category: string
  quantity: number
  unit: string
  unit_price: number
  total: number
}

interface CustomerOpt { id: string; name: string; phone: string }

const CATEGORIES = ['', 'حفر وأساسات', 'هيكل خرساني', 'بناء ومباني', 'كهرباء', 'سباكة', 'تشطيبات', 'بلاط ورخام', 'دهانات', 'أعمال خارجية', 'أخرى']
const UNITS = ['مقطوعية', 'متر مربع', 'متر طولي', 'متر مكعب', 'قطعة', 'عدد', 'طن', 'يوم', 'شهر']

const newItem = (): Item => ({ id: crypto.randomUUID(), description: '', category: '', quantity: 1, unit: 'مقطوعية', unit_price: 0, total: 0 })

export default function QuotationForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    quote_number: '',
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    project_name: '',
    location: '',
    issue_date: new Date().toISOString().slice(0, 10),
    valid_until: '',
    status: 'draft',
    discount: 0,
    tax_rate: 10,
    notes: '',
    terms: 'العرض ساري المفعول لمدة 30 يوماً من تاريخه. الأسعار شاملة المواد والعمالة ما لم يُذكر خلاف ذلك.',
  })
  const [items, setItems] = useState<Item[]>([newItem()])

  // توليد رقم العرض + تحميل العملاء
  useEffect(() => {
    supabase.from('customers').select('id,name,phone').order('name').then(({ data }) => {
      setCustomers((data ?? []) as CustomerOpt[])
    })

    if (isEdit) {
      const loadQuote = async () => {
        const { data: q } = await supabase.from('quotations').select('*').eq('id', id).single()
        if (q) {
          setForm({
            quote_number: q.quote_number ?? '',
            customer_id: q.customer_id ?? '',
            customer_name: q.customer_name ?? '',
            customer_phone: q.customer_phone ?? '',
            project_name: q.project_name ?? '',
            location: q.location ?? '',
            issue_date: q.issue_date ?? new Date().toISOString().slice(0, 10),
            valid_until: q.valid_until ?? '',
            status: q.status ?? 'draft',
            discount: Number(q.discount) || 0,
            tax_rate: Number(q.tax_rate) || 10,
            notes: q.notes ?? '',
            terms: q.terms ?? '',
          })
        }
        const { data: its } = await supabase.from('quotation_items').select('*').eq('quotation_id', id).order('sort_order')
        if (its && its.length) {
          setItems(its.map(it => ({
            id: it.id, description: it.description ?? '', category: it.category ?? '',
            quantity: Number(it.quantity) || 0, unit: it.unit ?? 'مقطوعية',
            unit_price: Number(it.unit_price) || 0, total: Number(it.total) || 0,
          })))
        }
      }
      loadQuote()
    } else {
      // رقم تلقائي
      supabase.from('quotations').select('quote_number').order('created_at', { ascending: false }).limit(50).then(({ data }) => {
        const year = new Date().getFullYear()
        const nums = (data ?? []).map(q => {
          const m = String(q.quote_number).match(/(\d+)$/)
          return m ? parseInt(m[1]) : 0
        })
        const next = (nums.length ? Math.max(...nums) : 0) + 1
        setForm(f => ({ ...f, quote_number: `QT-${year}-${String(next).padStart(3, '0')}` }))
      })
    }
  }, [id, isEdit])

  // تحديث بند
  const updateItem = (itemId: string, patch: Partial<Item>) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it
      const updated = { ...it, ...patch }
      updated.total = Number((updated.quantity * updated.unit_price).toFixed(3))
      return updated
    }))
  }

  const removeItem = (itemId: string) => setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== itemId) : prev)

  // اختيار عميل
  const onCustomerChange = (cid: string) => {
    const c = customers.find(x => x.id === cid)
    setForm(f => ({ ...f, customer_id: cid, customer_name: c?.name ?? f.customer_name, customer_phone: c?.phone ?? f.customer_phone }))
  }

  // حسابات
  const subtotal = items.reduce((s, it) => s + Number(it.total || 0), 0)
  const afterDiscount = Math.max(0, subtotal - Number(form.discount || 0))
  const taxAmount = Number((afterDiscount * Number(form.tax_rate || 0) / 100).toFixed(3))
  const grandTotal = Number((afterDiscount + taxAmount).toFixed(3))

  // ── قراءة بنود من ملف بالذكاء ──────────────────────────────────────
  const handleScan = async (file: File) => {
    if (!hasApiKey()) { toast.error('فعّل مفتاح الذكاء الاصطناعي من الإعدادات أولاً'); return }
    setScanning(true)
    toast.loading('جاري قراءة البنود...', { id: 'q-scan' })
    try {
      const text = await readDocumentText(file, `هذه قائمة بنود/كميات لمشروع بناء (قد تكون صورة أو ملف أو جدول كميات BOQ، حتى لو ممسوحة ضوئياً). اقرأها بدقة واستخرج البنود. أرجع JSON فقط بهذا الشكل بدون أي شرح:
{
  "items": [
    { "description": "وصف البند", "category": "التصنيف", "quantity": الكمية رقم, "unit": "الوحدة", "unit_price": السعر رقم أو 0 }
  ]
}
الوحدات المتاحة: مقطوعية، متر مربع، متر طولي، متر مكعب، قطعة، عدد، طن. إذا لم يوجد سعر اكتب 0.`)
      const parsed = extractJSON<{ items?: Array<{ description?: string; category?: string; quantity?: number; unit?: string; unit_price?: number }> }>(text)
      if (!parsed?.items?.length) { toast.error('لم يتم العثور على بنود', { id: 'q-scan' }); return }

      const scanned: Item[] = parsed.items.map(it => {
        const qty = Number(it.quantity) || 1
        const price = Number(it.unit_price) || 0
        return {
          id: crypto.randomUUID(),
          description: it.description ?? '',
          category: it.category ?? '',
          quantity: qty,
          unit: it.unit ?? 'مقطوعية',
          unit_price: price,
          total: Number((qty * price).toFixed(3)),
        }
      })
      // استبدل البنود الفارغة، أو أضف للموجود
      setItems(prev => {
        const hasContent = prev.some(p => p.description.trim())
        return hasContent ? [...prev, ...scanned] : scanned
      })
      toast.success(`تمت إضافة ${scanned.length} بند`, { id: 'q-scan' })
    } catch (e) {
      toast.error((e as Error)?.message ?? 'تعذّرت القراءة', { id: 'q-scan' })
    } finally {
      setScanning(false)
    }
  }

  // حفظ
  const handleSave = async () => {
    if (!form.project_name.trim() && !form.customer_name.trim()) { toast.error('أدخل اسم المشروع أو العميل'); return }
    setSaving(true)
    try {
      const payload = {
        quote_number: form.quote_number,
        customer_id: form.customer_id || null,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        project_name: form.project_name,
        location: form.location,
        issue_date: form.issue_date,
        valid_until: form.valid_until || null,
        status: form.status,
        subtotal,
        discount: Number(form.discount) || 0,
        tax_rate: Number(form.tax_rate) || 0,
        tax_amount: taxAmount,
        total: grandTotal,
        notes: form.notes,
        terms: form.terms,
        updated_at: new Date().toISOString(),
      }

      let quoteId = id
      if (isEdit) {
        const { error } = await supabase.from('quotations').update(payload).eq('id', id)
        if (error) throw error
        await supabase.from('quotation_items').delete().eq('quotation_id', id)
      } else {
        const { data, error } = await supabase.from('quotations').insert(payload).select('id').single()
        if (error) throw error
        quoteId = data.id
      }

      const itemsPayload = items.filter(it => it.description.trim()).map((it, i) => ({
        quotation_id: quoteId,
        description: it.description,
        category: it.category,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        total: it.total,
        sort_order: i,
      }))
      if (itemsPayload.length) {
        const { error: itErr } = await supabase.from('quotation_items').insert(itemsPayload)
        if (itErr) throw itErr
      }

      toast.success(isEdit ? 'تم تحديث العرض' : 'تم إنشاء العرض')
      navigate('/quotations')
    } catch (e) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quotations')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ArrowRight size={20} />
          </button>
          <h1 className="text-xl font-bold text-slate-800">{isEdit ? 'تعديل عرض السعر' : 'عرض سعر جديد'}</h1>
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f); e.target.value = '' }} />
          <button onClick={() => fileRef.current?.click()} disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            قراءة بنود من ملف
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* بيانات العرض */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">بيانات العرض</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="رقم العرض" value={form.quote_number} onChange={e => setForm(f => ({ ...f, quote_number: e.target.value }))} />
            <Select label="العميل" value={form.customer_id}
              onChange={e => onCustomerChange(e.target.value)}
              placeholder="اختر عميلاً (أو اكتب الاسم يدوياً)"
              options={customers.map(c => ({ value: c.id, label: c.name }))} />
            <Input label="اسم العميل" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
            <Input label="هاتف العميل" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} />
            <Input label="اسم المشروع" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} placeholder="مثال: فيلا سكنية - سترة" />
            <Input label="الموقع" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            <Input label="تاريخ العرض" type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
            <Input label="صالح حتى" type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
          </div>
        </div>

        {/* البنود */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">بنود العرض</h2>
            <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setItems(prev => [...prev, newItem()])}>إضافة بند</Button>
          </div>

          <div className="space-y-2">
            {/* رؤوس الأعمدة */}
            <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-slate-400 px-2">
              <div className="col-span-4">الوصف</div>
              <div className="col-span-2">التصنيف</div>
              <div className="col-span-1">الكمية</div>
              <div className="col-span-1">الوحدة</div>
              <div className="col-span-2">سعر الوحدة</div>
              <div className="col-span-1">الإجمالي</div>
              <div className="col-span-1"></div>
            </div>

            {items.map((it) => (
              <div key={it.id} className="grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg p-2">
                <div className="col-span-12 md:col-span-4">
                  <input value={it.description} onChange={e => updateItem(it.id, { description: e.target.value })}
                    placeholder="وصف البند" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-400" />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <select value={it.category} onChange={e => updateItem(it.id, { category: e.target.value })}
                    className="w-full h-9 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-400 bg-white">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c || 'بدون'}</option>)}
                  </select>
                </div>
                <div className="col-span-3 md:col-span-1">
                  <input type="number" value={it.quantity} onChange={e => updateItem(it.id, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full h-9 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-400 text-center" />
                </div>
                <div className="col-span-3 md:col-span-1">
                  <select value={it.unit} onChange={e => updateItem(it.id, { unit: e.target.value })}
                    className="w-full h-9 px-1 rounded-lg border border-slate-200 text-xs outline-none focus:border-amber-400 bg-white">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="col-span-4 md:col-span-2">
                  <input type="number" value={it.unit_price} onChange={e => updateItem(it.id, { unit_price: parseFloat(e.target.value) || 0 })}
                    placeholder="0.000" className="w-full h-9 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-400 text-center" />
                </div>
                <div className="col-span-6 md:col-span-1 text-sm font-medium text-slate-700 text-center">
                  {it.total.toFixed(3)}
                </div>
                <div className="col-span-2 md:col-span-1 flex justify-center">
                  <button onClick={() => removeItem(it.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* الإجماليات */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <Select label="حالة العرض" value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              options={[
                { value: 'draft', label: 'مسودة' },
                { value: 'sent', label: 'مُرسل' },
                { value: 'accepted', label: 'مقبول' },
                { value: 'rejected', label: 'مرفوض' },
              ]} />
            <Textarea label="الشروط والأحكام" value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} rows={3} />
            <Textarea label="ملاحظات" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-700 mb-4">ملخّص التكلفة</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">المجموع الفرعي</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">الخصم</span>
                <input type="number" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: parseFloat(e.target.value) || 0 }))}
                  className="w-28 h-8 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-400 text-left" />
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">الضريبة (%)</span>
                <input type="number" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) || 0 }))}
                  className="w-28 h-8 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-400 text-left" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">قيمة الضريبة</span>
                <span className="font-medium">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                <span className="font-semibold text-slate-700">الإجمالي النهائي</span>
                <span className="text-xl font-bold" style={{ color: '#7b4a2d' }}>{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* أزرار */}
        <div className="flex gap-3">
          <Button loading={saving} onClick={handleSave}>{isEdit ? 'حفظ التعديلات' : 'حفظ العرض'}</Button>
          <Button variant="secondary" onClick={() => navigate('/quotations')}>إلغاء</Button>
        </div>
      </div>
    </div>
  )
}
