import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Globe, Building2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import toast from 'react-hot-toast'

interface CustomerOpt { id: string; name: string; phone: string }

// ════════════════════════════════════════════════════════════════
//  نموذج إدخال عرض السعر — القالب الثابت
//  السعر الإجمالي فقط + خيار نوع البناء (داخلي) + بنود إضافية
// ════════════════════════════════════════════════════════════════

// البنود الإضافية الاختيارية (تُضاف للجدول وتُحذف من "لا تشمل")
const OPTIONAL_ITEMS = [
  {
    key: 'excavation',
    ar: 'أعمال الحفر والدفان', en: 'Excavation and backfilling works',
    detailAr: 'تنفيذ أعمال الحفر والردم ودمك التربة.', detailEn: 'Excavation, backfilling, and soil compaction.',
  },
  {
    key: 'gypsum',
    ar: 'أعمال الجبس', en: 'Gypsum board works',
    detailAr: 'توريد وتنفيذ أعمال الجبس بورد للأسقف الداخلية.', detailEn: 'Supply and installation of gypsum board for internal ceilings.',
  },
  {
    key: 'painting',
    ar: 'أعمال الصباغة', en: 'Painting works',
    detailAr: 'تجهيز الأسطح وتنفيذ أعمال الدهان الداخلي والخارجي بالدهانات المعتمدة.', detailEn: 'Surface preparation and execution of internal and external painting with approved paints.',
  },
  {
    key: 'insulation',
    ar: 'أعمال العزل المائي والحراري', en: 'Waterproofing and thermal insulation works',
    detailAr: 'توريد وتنفيذ أعمال العزل المائي والحراري للأسطح والحمامات والمناطق الرطبة بالمواد المعتمدة.', detailEn: 'Supply and application of waterproofing and thermal insulation for roofs, bathrooms, and wet areas using approved materials.',
  },
]

export default function QuotationForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id && id !== 'new'
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<CustomerOpt[]>([])

  const [form, setForm] = useState({
    quote_number: '',
    customer_id: '',
    customer_name: '',
    customer_address: '',
    customer_phone: '',
    project_desc_ar: 'بناء فيلا من طابقين',
    project_desc_en: 'construction for two story villa',
    location: '',
    area: '',
    issue_date: new Date().toISOString().slice(0, 10),
    language: 'en' as 'ar' | 'en',
    building_type: 'precast' as 'post_tension' | 'precast',  // داخلي — لا يظهر للعميل
    status: 'draft',
    grand_total: '',
    price_per_meter: '',  // داخلي — لحساب الإجمالي تلقائياً
    notes: '',
  })

  // البنود الإضافية المفعّلة + أسعارها
  const [optionals, setOptionals] = useState<Record<string, { enabled: boolean; price: number }>>({
    excavation: { enabled: false, price: 0 },
    gypsum: { enabled: false, price: 0 },
    painting: { enabled: false, price: 0 },
    insulation: { enabled: false, price: 0 },
  })

  useEffect(() => {
    supabase.from('customers').select('id,name,phone').order('name').then(({ data }) => {
      setCustomers((data ?? []) as CustomerOpt[])
    })

    if (isEdit) {
      const loadQuote = async () => {
        const { data: q } = await supabase.from('quotations').select('*').eq('id', id).single()
        if (q) {
          setForm(f => ({
            ...f,
            quote_number: q.quote_number ?? '',
            customer_id: q.customer_id ?? '',
            customer_name: q.customer_name ?? '',
            customer_address: q.customer_address ?? '',
            customer_phone: q.customer_phone ?? '',
            project_desc_ar: q.project_desc_ar ?? 'بناء فيلا من طابقين',
            project_desc_en: q.project_desc_en ?? 'construction for two story villa',
            location: q.location ?? '',
            area: q.area ?? '',
            issue_date: q.issue_date ?? new Date().toISOString().slice(0, 10),
            language: (q.language as 'ar' | 'en') ?? 'en',
            building_type: (q.building_type as 'post_tension' | 'precast') ?? 'precast',
            price_per_meter: q.price_per_meter ? String(q.price_per_meter) : '',
            status: q.status ?? 'draft',
            grand_total: q.total ? String(q.total) : '',
            notes: q.notes ?? '',
          }))
          const { data: its } = await supabase.from('quotation_items').select('*').eq('quotation_id', id).order('sort_order')
          if (its && its.length) {
            const newOpt = { excavation: { enabled: false, price: 0 }, gypsum: { enabled: false, price: 0 }, painting: { enabled: false, price: 0 }, insulation: { enabled: false, price: 0 } }
            its.filter(it => it.category === 'optional').forEach(it => {
              const d = (it.description || '') + ' ' + (it.description_en || '').toLowerCase()
              let k: keyof typeof newOpt = 'excavation'
              if (d.includes('جبس') || d.includes('gypsum')) k = 'gypsum'
              else if (d.includes('صباغة') || d.includes('دهان') || d.includes('painting')) k = 'painting'
              else if (d.includes('عزل') || d.includes('waterproof') || d.includes('insulation') || d.includes('thermal')) k = 'insulation'
              newOpt[k] = { enabled: true, price: Number(it.unit_price) || 0 }
            })
            setOptionals(newOpt)
          }
        }
      }
      loadQuote()
    } else {
      // رقم تلقائي بصيغة QT-2026-001
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

  const onCustomerChange = (cid: string) => {
    const c = customers.find(x => x.id === cid)
    setForm(f => ({ ...f, customer_id: cid, customer_name: c?.name ?? f.customer_name, customer_phone: c?.phone ?? f.customer_phone }))
  }

  const { optSum, areaNum, ppmNum, calculatedFromMeter, grandTotal } = useMemo(() => {
    const optSum = Object.entries(optionals).reduce((s, [, v]) => s + (v.enabled ? Number(v.price || 0) : 0), 0)
    // حساب الإجمالي من سعر المتر × المساحة (أداة داخلية)
    const areaNum = parseFloat(form.area) || 0
    const ppmNum = parseFloat(form.price_per_meter) || 0
    const calculatedFromMeter = Math.round(areaNum * ppmNum)
    // لو فيه سعر متر ومساحة، نحسب تلقائياً؛ وإلا نستخدم الإجمالي اليدوي
    const grandTotal = calculatedFromMeter > 0 ? calculatedFromMeter : (Number(form.grand_total) || 0)
    return { optSum, areaNum, ppmNum, calculatedFromMeter, grandTotal }
  }, [optionals, form.area, form.price_per_meter, form.grand_total])

  // تحديث الإجمالي تلقائياً عند تغيير سعر المتر أو المساحة
  useEffect(() => {
    if (calculatedFromMeter > 0) {
      setForm(f => ({ ...f, grand_total: String(calculatedFromMeter) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.price_per_meter, form.area])

  const handleSave = async () => {
    if (!form.customer_name.trim()) { toast.error('أدخل اسم العميل'); return }
    if (grandTotal <= 0) { toast.error('أدخل السعر الإجمالي'); return }
    setSaving(true)
    try {
      const payload = {
        quote_number: form.quote_number,
        customer_id: form.customer_id || null,
        customer_name: form.customer_name,
        customer_address: form.customer_address,
        customer_phone: form.customer_phone,
        project_name: form.project_desc_ar,
        project_desc_ar: form.project_desc_ar,
        project_desc_en: form.project_desc_en,
        location: form.location,
        area: form.area,
        issue_date: form.issue_date,
        language: form.language,
        building_type: form.building_type,
        price_per_meter: parseFloat(form.price_per_meter) || 0,
        status: form.status,
        subtotal: grandTotal,
        discount: 0,
        tax_rate: 0,
        tax_amount: 0,
        total: grandTotal,
        notes: form.notes,
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

      // حفظ البنود الإضافية المفعّلة فقط (البنود السبعة ثابتة في صفحة العرض)
      const itemsPayload: Array<Record<string, unknown>> = []
      OPTIONAL_ITEMS.forEach((opt, i) => {
        if (optionals[opt.key].enabled) {
          itemsPayload.push({
            quotation_id: quoteId,
            description: opt.ar,
            description_en: opt.en,
            detail: opt.detailAr,
            detail_en: opt.detailEn,
            category: 'optional',
            quantity: 1,
            unit: 'مقطوعية',
            unit_price: optionals[opt.key].price || 0,
            total: optionals[opt.key].price || 0,
            sort_order: 100 + i,
          })
        }
      })
      if (itemsPayload.length) {
        const { error: itErr } = await supabase.from('quotation_items').insert(itemsPayload)
        if (itErr) throw itErr
      }

      queryClient.invalidateQueries({ queryKey: ['quotations-list'] })
      toast.success(isEdit ? 'تم تحديث العرض' : 'تم إنشاء العرض')
      navigate(`/quotations/${quoteId}`)
    } catch (e) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <div className="p-6 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quotations')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ArrowRight size={20} />
          </button>
          <h1 className="text-xl font-bold text-slate-800">{isEdit ? 'تعديل عرض السعر' : 'عرض سعر جديد'}</h1>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <Globe size={15} className="text-slate-400 mr-1" />
          <button onClick={() => setForm(f => ({ ...f, language: 'ar' }))}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${form.language === 'ar' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>عربي</button>
          <button onClick={() => setForm(f => ({ ...f, language: 'en' }))}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${form.language === 'en' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>English</button>
        </div>
      </div>

      <div className="space-y-5">
        {/* بيانات العرض والعميل */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">بيانات العرض والعميل</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="رقم العرض" value={form.quote_number} onChange={e => setForm(f => ({ ...f, quote_number: e.target.value }))} dir="ltr" />
            <Input label="تاريخ العرض" type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
            <Select label="العميل" value={form.customer_id}
              onChange={e => onCustomerChange(e.target.value)}
              placeholder="اختر عميلاً (أو اكتب يدوياً)"
              options={customers.map(c => ({ value: c.id, label: c.name }))} />
            <Input label="اسم العميل *" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
            <Input label="عنوان العميل" value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} placeholder="مدينة سترة" />
            <Input label="هاتف العميل" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} dir="ltr" />
            <Input label="الموقع" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="مدينة سترة" />
            <Input label="مساحة البناء (م²)" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} dir="ltr" placeholder="470.61" />
          </div>
          {/* وصف المشروع المتغيّر (عربي + إنجليزي) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
            <Input label="وصف المشروع (عربي)" value={form.project_desc_ar} onChange={e => setForm(f => ({ ...f, project_desc_ar: e.target.value }))} placeholder="بناء فيلا من طابقين" />
            <Input label="وصف المشروع (إنجليزي)" value={form.project_desc_en} onChange={e => setForm(f => ({ ...f, project_desc_en: e.target.value }))} dir="ltr" placeholder="construction for two story villa" />
          </div>
          <p className="text-xs text-slate-400 mt-3">وصف المشروع متغيّر (فيلا طابق/طابقين، مبنى تجاري...). يظهر في سطر الموضوع + الموقع + المساحة.</p>
        </div>

        {/* نوع البناء (داخلي — لا يظهر للعميل) */}
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={18} className="text-amber-600" />
            <h2 className="font-semibold text-amber-900">نوع البناء (داخلي — لا يظهر للعميل)</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setForm(f => ({ ...f, building_type: 'post_tension' }))}
              className={`p-4 rounded-xl border-2 text-center transition-colors ${form.building_type === 'post_tension' ? 'border-amber-500 bg-white' : 'border-slate-200 bg-slate-50'}`}>
              <div className="font-bold text-slate-800">بوست تنشن</div>
              <div className="text-xs text-slate-500 mt-1">Post-Tension</div>
              <div className="text-[11px] text-amber-600 mt-1.5">✓ تُرفق صفحات خطوات العمل</div>
            </button>
            <button type="button" onClick={() => setForm(f => ({ ...f, building_type: 'precast' }))}
              className={`p-4 rounded-xl border-2 text-center transition-colors ${form.building_type === 'precast' ? 'border-amber-500 bg-white' : 'border-slate-200 bg-slate-50'}`}>
              <div className="font-bold text-slate-800">بريكاست</div>
              <div className="text-xs text-slate-500 mt-1">Precast</div>
              <div className="text-[11px] text-slate-400 mt-1.5">بدون صفحات إضافية</div>
            </button>
          </div>
        </div>

        {/* بنود إضافية اختيارية */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-1">بنود إضافية (اختيارية)</h2>
          <p className="text-xs text-slate-400 mb-4">فعّل البند لإضافته للعرض (يُحذف تلقائياً من قائمة "لا تشمل")</p>
          <div className="space-y-2">
            {OPTIONAL_ITEMS.map(opt => (
              <div key={opt.key} className={`flex items-center gap-3 rounded-lg p-3 border transition-colors ${optionals[opt.key].enabled ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                <input type="checkbox" checked={optionals[opt.key].enabled}
                  onChange={e => setOptionals(prev => ({ ...prev, [opt.key]: { ...prev[opt.key], enabled: e.target.checked } }))}
                  className="w-4 h-4 accent-green-600" />
                <div className="flex-1 text-sm text-slate-700">{form.language === 'ar' ? opt.ar : opt.en}</div>
                {optionals[opt.key].enabled && (
                  <input type="number" value={optionals[opt.key].price || ''} placeholder="السعر"
                    onChange={e => { const v = parseFloat(e.target.value) || 0; setOptionals(prev => ({ ...prev, [opt.key]: { ...prev[opt.key], price: v } })) }}
                    className="w-28 h-9 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-green-400 text-center" dir="ltr" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* حاسبة سعر المتر (داخلي — لا يظهر للعميل) */}
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={18} className="text-blue-600" />
            <h2 className="font-semibold text-blue-900">حاسبة سعر المتر (داخلي — لا يظهر للعميل)</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">سعر المتر (د.ب)</label>
              <input type="number" value={form.price_per_meter} placeholder="110"
                onChange={e => setForm(f => ({ ...f, price_per_meter: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-blue-200 text-sm outline-none focus:border-blue-400 text-center" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">المساحة (م²)</label>
              <input type="number" value={form.area} placeholder="470.61" disabled
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-center text-slate-500" dir="ltr" />
            </div>
          </div>
          {calculatedFromMeter > 0 && (
            <div className="flex justify-between items-center bg-white rounded-lg p-3 border border-blue-200">
              <span className="text-sm text-slate-600">{ppmNum} × {areaNum} = </span>
              <span className="font-bold text-blue-700" dir="ltr">{fmt(calculatedFromMeter)} د.ب</span>
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-2">عند إدخال سعر المتر، يُحسب الإجمالي تلقائياً (سعر المتر × المساحة). لتجاوزه، اكتب الإجمالي يدوياً بالأسفل.</p>
        </div>

        {/* السعر الإجمالي */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">السعر الإجمالي</h2>
          <div className="space-y-3">
            {optSum > 0 && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>البنود الإضافية المضافة</span>
                <span dir="ltr">{fmt(optSum)} د.ب</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <label className="font-medium text-slate-700">السعر الإجمالي للعرض (د.ب) *</label>
              <input type="number" value={form.grand_total} placeholder="51767"
                onChange={e => setForm(f => ({ ...f, grand_total: e.target.value, price_per_meter: '' }))}
                className="w-40 h-11 px-3 rounded-xl border-2 border-slate-200 text-lg font-bold outline-none focus:border-amber-400 text-center" dir="ltr" />
            </div>
            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2">السعر الإجمالي فقط يظهر في العرض (بدون سعر لكل بند). الضريبة: معفى (صفر).</div>
            <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
              <span className="font-semibold text-slate-700">الإجمالي النهائي</span>
              <span className="text-2xl font-bold" dir="ltr" style={{ color: '#c4925a' }}>{fmt(grandTotal)} <span className="text-base">د.ب</span></span>
            </div>
          </div>
        </div>

        <Select label="حالة العرض" value={form.status}
          onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          options={[
            { value: 'draft', label: 'مسودة' },
            { value: 'sent', label: 'مُرسل' },
            { value: 'accepted', label: 'مقبول' },
            { value: 'rejected', label: 'مرفوض' },
          ]} />

        <div className="flex gap-3">
          <Button loading={saving} onClick={handleSave}>{isEdit ? 'حفظ التعديلات' : 'حفظ وعرض'}</Button>
          <Button variant="secondary" onClick={() => navigate('/quotations')}>إلغاء</Button>
        </div>
      </div>
    </div>
  )
}
