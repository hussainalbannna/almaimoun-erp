import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'

interface CustomerOpt { id: string; name: string; phone: string }

// ════════════════════════════════════════════════════════════════
//  القالب الثابت لعرض السعر — مؤسسة الميمون للمقاولات والتجارة
//  7 بنود ثابتة + بنود اختيارية (حفّار/دفان، جبس/صباغة)
// ════════════════════════════════════════════════════════════════

// البنود السبعة الثابتة (نفس الترتيب دائماً) — عربي + إنجليزي
const FIXED_ITEMS = [
  { ar: 'مواد البناء والأيدي العاملة', en: 'Labors & materials' },
  { ar: 'جميع أعمال الخرسانة (حديد، نجارة، أساسات، قواعد، جسور، أعمدة، أسقف)', en: 'All concrete works including iron, carpentry, foundations, columns, beams, and roofs' },
  { ar: 'جميع أعمال الطابوق', en: 'All block work' },
  { ar: 'جميع أعمال المساح (داخلي وخارجي)', en: 'All plaster work, internal and external' },
  { ar: 'جميع أعمال البلاط (المالك يوفّر البلاط)', en: 'All tiles work, owner provides the tiles' },
  { ar: 'التركيب الأولي للكهرباء', en: 'Initial electrical installation' },
  { ar: 'التركيب الأولي للماء', en: 'Initial plumbing installation' },
]

// البنود الإضافية الاختيارية
const OPTIONAL_ITEMS = [
  { key: 'excavation', ar: 'أعمال الحفر والدفان', en: 'Excavation and backfilling works' },
  { key: 'gypsum', ar: 'أعمال الجبس والصباغة', en: 'Gypsum and painting works' },
]

// قائمة "لا يشمل" الثابتة (15 بند) — عربي + إنجليزي
const EXCLUDED_AR = [
  'جميع أعمال الكهرباء النهائية والإنارة',
  'جميع أعمال السباكة النهائية والأدوات الصحية',
  'جميع أعمال التكييف',
  'جميع أعمال أنظمة مكافحة الحريق',
  'جميع أعمال الألمنيوم والأبواب والنوافذ',
  'جميع أعمال الحديد المشغول',
  'جميع أعمال الخشب والنجارة',
  'جميع أعمال الدهان والجبس',
  'جميع أنظمة الأمن وكاميرات المراقبة والستلايت',
  'جميع أعمال خزائن المطابخ وملحقاتها',
  'جميع أعمال العزل الحراري للأسطح الخرسانية',
  'جميع الأعمال الزراعية وتنسيق الحدائق',
  'جميع أعمال المسابح',
  'جميع أعمال الصرف الصحي والإنشائية الخارجية',
  'كل ما لم يُذكر في هذا العرض',
]
const EXCLUDED_EN = [
  'All final electrical and lighting works',
  'All final plumbing works and sanitary ware',
  'All air conditioning works',
  'All firefighting systems works',
  'All aluminum works, doors, and windows',
  'All wrought iron works',
  'All wood and carpentry work',
  'All painting and gypsum works',
  'All security systems, surveillance cameras and satellite work',
  'All cabinet work for kitchens and accessories',
  'All thermal insulation works for concrete surfaces',
  'All agricultural and landscaping works',
  'All swimming pool works',
  'All drainage and external structural works',
  'All that is not mentioned in this quotation',
]

// الشروط الثلاثة الثابتة — عربي + إنجليزي (قابلة للتعديل)
const DEFAULT_TERMS_AR = `1- يبدأ العمل بعد توقيع العقد ودفع الدفعة المقدمة المتفق عليها.
2- المالك مسؤول عن توفير المخططات والتراخيص اللازمة.
3- أي أعمال إضافية خارج البنود المذكورة تُحتسب بشكل منفصل.`
const DEFAULT_TERMS_EN = `1- Work begins after signing the contract and paying the agreed advance payment.
2- The owner is responsible for providing the necessary drawings and permits.
3- Any additional works outside the mentioned items are calculated separately.`

export default function QuotationForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id && id !== 'new'
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<CustomerOpt[]>([])

  const [form, setForm] = useState({
    quote_number: '',
    customer_id: '',
    customer_name: '',
    customer_address: '',
    customer_phone: '',
    project_name: '',
    location: '',
    area: '',
    issue_date: new Date().toISOString().slice(0, 10),
    language: 'en' as 'ar' | 'en',  // لغة العرض/الطباعة
    status: 'draft',
    grand_total: '',
    terms_ar: DEFAULT_TERMS_AR,
    terms_en: DEFAULT_TERMS_EN,
    notes: '',
  })

  // مبالغ البنود السبعة (اختياري — يمكن ترك الإجمالي فقط)
  const [itemPrices, setItemPrices] = useState<number[]>(FIXED_ITEMS.map(() => 0))
  // البنود الإضافية المفعّلة + أسعارها
  const [optionals, setOptionals] = useState<Record<string, { enabled: boolean; price: number }>>({
    excavation: { enabled: false, price: 0 },
    gypsum: { enabled: false, price: 0 },
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
            project_name: q.project_name ?? '',
            location: q.location ?? '',
            area: q.area ?? '',
            issue_date: q.issue_date ?? new Date().toISOString().slice(0, 10),
            language: (q.language as 'ar' | 'en') ?? 'en',
            status: q.status ?? 'draft',
            grand_total: q.total ? String(q.total) : '',
            terms_ar: q.terms_ar ?? DEFAULT_TERMS_AR,
            terms_en: q.terms_en ?? DEFAULT_TERMS_EN,
            notes: q.notes ?? '',
          }))
          // تحميل أسعار البنود
          const { data: its } = await supabase.from('quotation_items').select('*').eq('quotation_id', id).order('sort_order')
          if (its && its.length) {
            const prices = FIXED_ITEMS.map((_, i) => {
              const found = its.find(it => it.sort_order === i)
              return found ? Number(found.unit_price) || 0 : 0
            })
            setItemPrices(prices)
            // البنود الإضافية (sort_order >= 100)
            const newOpt = { ...optionals }
            OPTIONAL_ITEMS.forEach((opt, i) => {
              const found = its.find(it => it.sort_order === 100 + i)
              if (found) newOpt[opt.key] = { enabled: true, price: Number(found.unit_price) || 0 }
            })
            setOptionals(newOpt)
          }
        }
      }
      loadQuote()
    } else {
      // رقم تلقائي بصيغة الميمون: تسلسلي/يوم/شهر/سنة
      supabase.from('quotations').select('quote_number').order('created_at', { ascending: false }).limit(50).then(({ data }) => {
        const nums = (data ?? []).map(q => {
          const m = String(q.quote_number).match(/^(\d+)/)
          return m ? parseInt(m[1]) : 0
        })
        const next = (nums.length ? Math.max(...nums) : 631) + 1
        const d = new Date()
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yyyy = d.getFullYear()
        setForm(f => ({ ...f, quote_number: `${next}/${dd}/${mm}/${yyyy}` }))
      })
    }
  }, [id, isEdit])

  const onCustomerChange = (cid: string) => {
    const c = customers.find(x => x.id === cid)
    setForm(f => ({ ...f, customer_id: cid, customer_name: c?.name ?? f.customer_name, customer_phone: c?.phone ?? f.customer_phone }))
  }

  // حساب الإجمالي: مجموع البنود السبعة + الإضافية، أو القيمة اليدوية
  const itemsSum = itemPrices.reduce((s, p) => s + Number(p || 0), 0)
  const optSum = Object.entries(optionals).reduce((s, [, v]) => s + (v.enabled ? Number(v.price || 0) : 0), 0)
  const calculatedTotal = itemsSum + optSum
  // الإجمالي النهائي: لو فيه أسعار بنود نستخدم المحسوب، وإلا اليدوي
  const grandTotal = calculatedTotal > 0 ? calculatedTotal : (Number(form.grand_total) || 0)

  const handleSave = async () => {
    if (!form.customer_name.trim()) { toast.error('أدخل اسم العميل'); return }
    if (grandTotal <= 0) { toast.error('أدخل الإجمالي أو أسعار البنود'); return }
    setSaving(true)
    try {
      const payload = {
        quote_number: form.quote_number,
        customer_id: form.customer_id || null,
        customer_name: form.customer_name,
        customer_address: form.customer_address,
        customer_phone: form.customer_phone,
        project_name: form.project_name,
        location: form.location,
        area: form.area,
        issue_date: form.issue_date,
        language: form.language,
        status: form.status,
        subtotal: grandTotal,
        discount: 0,
        tax_rate: 0,       // معفى — صفر
        tax_amount: 0,
        total: grandTotal,
        terms_ar: form.terms_ar,
        terms_en: form.terms_en,
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

      // حفظ البنود السبعة الثابتة
      const itemsPayload = FIXED_ITEMS.map((it, i) => ({
        quotation_id: quoteId,
        description: it.ar,
        description_en: it.en,
        category: 'fixed',
        quantity: 1,
        unit: 'مقطوعية',
        unit_price: itemPrices[i] || 0,
        total: itemPrices[i] || 0,
        sort_order: i,
      }))
      // البنود الإضافية المفعّلة
      OPTIONAL_ITEMS.forEach((opt, i) => {
        if (optionals[opt.key].enabled) {
          itemsPayload.push({
            quotation_id: quoteId,
            description: opt.ar,
            description_en: opt.en,
            category: 'optional',
            quantity: 1,
            unit: 'مقطوعية',
            unit_price: optionals[opt.key].price || 0,
            total: optionals[opt.key].price || 0,
            sort_order: 100 + i,
          })
        }
      })
      const { error: itErr } = await supabase.from('quotation_items').insert(itemsPayload)
      if (itErr) throw itErr

      toast.success(isEdit ? 'تم تحديث العرض' : 'تم إنشاء العرض')
      navigate('/quotations')
    } catch (e) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quotations')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ArrowRight size={20} />
          </button>
          <h1 className="text-xl font-bold text-slate-800">{isEdit ? 'تعديل عرض السعر' : 'عرض سعر جديد'}</h1>
        </div>
        {/* اختيار لغة العرض والطباعة */}
        <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
          <Globe size={15} className="text-slate-400 mr-1" />
          <button onClick={() => setForm(f => ({ ...f, language: 'ar' }))}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${form.language === 'ar' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
            عربي
          </button>
          <button onClick={() => setForm(f => ({ ...f, language: 'en' }))}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${form.language === 'en' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
            English
          </button>
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
            <Input label="عنوان العميل" value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} />
            <Input label="هاتف العميل" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} dir="ltr" />
            <Input label="المشروع (فيلا دورين)" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} placeholder="فيلا دورين" />
            <Input label="الموقع" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="سترة" />
            <Input label="المساحة (م²)" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} dir="ltr" />
          </div>
        </div>

        {/* البنود السبعة الثابتة */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-1">البنود الثابتة (السبعة)</h2>
          <p className="text-xs text-slate-400 mb-4">أدخل سعر كل بند (اختياري — أو اترك الكل صفر وأدخل الإجمالي بالأسفل)</p>
          <div className="space-y-2">
            {FIXED_ITEMS.map((it, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold shrink-0">{i + 1}</div>
                <div className="flex-1 text-sm text-slate-700">{form.language === 'ar' ? it.ar : it.en}</div>
                <input type="number" value={itemPrices[i] || ''} placeholder="0.000"
                  onChange={e => { const v = parseFloat(e.target.value) || 0; setItemPrices(prev => prev.map((p, idx) => idx === i ? v : p)) }}
                  className="w-32 h-9 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-400 text-center" dir="ltr" />
              </div>
            ))}
          </div>
        </div>

        {/* البنود الإضافية الاختيارية */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-1">بنود إضافية (اختيارية)</h2>
          <p className="text-xs text-slate-400 mb-4">فعّل البند لإضافته للعرض (يُحذف تلقائياً من قائمة "لا يشمل")</p>
          <div className="space-y-2">
            {OPTIONAL_ITEMS.map(opt => (
              <div key={opt.key} className={`flex items-center gap-3 rounded-lg p-3 border transition-colors ${optionals[opt.key].enabled ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                <input type="checkbox" checked={optionals[opt.key].enabled}
                  onChange={e => setOptionals(prev => ({ ...prev, [opt.key]: { ...prev[opt.key], enabled: e.target.checked } }))}
                  className="w-4 h-4 accent-green-600" />
                <div className="flex-1 text-sm text-slate-700">{form.language === 'ar' ? opt.ar : opt.en}</div>
                {optionals[opt.key].enabled && (
                  <input type="number" value={optionals[opt.key].price || ''} placeholder="0.000"
                    onChange={e => { const v = parseFloat(e.target.value) || 0; setOptionals(prev => ({ ...prev, [opt.key]: { ...prev[opt.key], price: v } })) }}
                    className="w-32 h-9 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-green-400 text-center" dir="ltr" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* الإجمالي + الشروط */}
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
            <Textarea label={form.language === 'ar' ? 'الشروط (عربي)' : 'Terms (English)'}
              value={form.language === 'ar' ? form.terms_ar : form.terms_en}
              onChange={e => setForm(f => form.language === 'ar' ? ({ ...f, terms_ar: e.target.value }) : ({ ...f, terms_en: e.target.value }))}
              rows={4} dir={form.language === 'ar' ? 'rtl' : 'ltr'} />
            <Textarea label="ملاحظات (داخلية)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-700 mb-4">الإجمالي</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">مجموع البنود السبعة</span>
                <span className="font-medium" dir="ltr">{fmt(itemsSum)}</span>
              </div>
              {optSum > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">البنود الإضافية</span>
                  <span className="font-medium" dir="ltr">{fmt(optSum)}</span>
                </div>
              )}
              {calculatedTotal === 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">الإجمالي اليدوي</span>
                  <input type="number" value={form.grand_total} placeholder="0.000"
                    onChange={e => setForm(f => ({ ...f, grand_total: e.target.value }))}
                    className="w-32 h-9 px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-400 text-center" dir="ltr" />
                </div>
              )}
              <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2">الضريبة: معفى (صفر)</div>
              <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                <span className="font-semibold text-slate-700">الإجمالي (د.ب)</span>
                <span className="text-xl font-bold" dir="ltr" style={{ color: '#c4925a' }}>{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* معاينة قائمة لا يشمل */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 mb-3 text-sm">قائمة "لا يشمل" (تظهر في العرض تلقائياً)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
            {(form.language === 'ar' ? EXCLUDED_AR : EXCLUDED_EN)
              .filter(ex => {
                // إخفاء الجبس/الصباغة من "لا يشمل" لو البند الإضافي مفعّل
                if (optionals.gypsum.enabled && (ex.includes('الدهان') || ex.includes('painting'))) return false
                return true
              })
              .map((ex, i) => (
                <div key={i} className="flex gap-1.5">
                  <span className="text-slate-400">{i + 1}.</span>
                  <span>{ex}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button loading={saving} onClick={handleSave}>{isEdit ? 'حفظ التعديلات' : 'حفظ العرض'}</Button>
          <Button variant="secondary" onClick={() => navigate('/quotations')}>إلغاء</Button>
        </div>
      </div>
    </div>
  )
}
