import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Printer, Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ════════════════════════════════════════════════════════════════
//  صفحة عرض/طباعة عرض السعر — القالب الثابت (عربي/إنجليزي)
//  مؤسسة الميمون للمقاولات والتجارة — CR 120637-2
// ════════════════════════════════════════════════════════════════

interface Quotation {
  id: string
  quote_number: string
  customer_name: string
  customer_address: string
  customer_phone: string
  project_name: string
  location: string
  area: string
  issue_date: string
  language: string
  total: number
  terms_ar: string
  terms_en: string
}

interface QItem {
  description: string
  description_en: string
  unit_price: number
  category: string
  sort_order: number
}

// قائمة "لا يشمل" الثابتة
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

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export default function QuotationView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [quote, setQuote] = useState<Quotation | null>(null)
  const [items, setItems] = useState<QItem[]>([])
  const [lang, setLang] = useState<'ar' | 'en'>('en')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: q } = await supabase.from('quotations').select('*').eq('id', id).single()
      const { data: its } = await supabase.from('quotation_items').select('*').eq('quotation_id', id).order('sort_order')
      if (q) {
        setQuote(q as Quotation)
        setLang((q.language as 'ar' | 'en') ?? 'en')
      }
      setItems((its ?? []) as QItem[])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
  if (!quote) return <div className="p-12 text-center text-slate-400">العرض غير موجود</div>

  const isAr = lang === 'ar'
  const dir = isAr ? 'rtl' : 'ltr'
  const align = isAr ? 'right' : 'left'

  // البنود المعروضة (الثابتة + الإضافية)
  const displayItems = items.filter(it => it.category !== 'optional' || it.unit_price >= 0)
  const hasGypsum = items.some(it => it.category === 'optional' && (it.description.includes('جبس') || it.description_en?.includes('Gypsum')))

  // قائمة لا يشمل (نحذف الدهان/الجبس لو مضاف كبند)
  const excluded = (isAr ? EXCLUDED_AR : EXCLUDED_EN).filter(ex => {
    if (hasGypsum && (ex.includes('الدهان') || ex.includes('painting'))) return false
    return true
  })

  const t = {
    title: isAr ? 'عرض سعر' : 'QUOTATION',
    company: isAr ? 'مؤسسة الميمون للمقاولات والتجارة' : 'ALMAIMOUN CONSTRUCTION & TRADING',
    cr: 'CR 120637-2',
    quoteNo: isAr ? 'رقم العرض' : 'Quote No',
    date: isAr ? 'التاريخ' : 'Date',
    to: isAr ? 'إلى' : 'To',
    phone: isAr ? 'الهاتف' : 'Phone',
    project: isAr ? 'المشروع' : 'Project',
    location: isAr ? 'الموقع' : 'Location',
    area: isAr ? 'المساحة' : 'Area',
    scope: isAr ? 'يشمل العرض' : 'Scope of Work',
    no: isAr ? 'م' : 'No',
    desc: isAr ? 'البيان' : 'Description',
    amount: isAr ? 'المبلغ (د.ب)' : 'Amount (BHD)',
    grandTotal: isAr ? 'الإجمالي الكلي' : 'GRAND TOTAL',
    terms: isAr ? 'الشروط' : 'Terms & Conditions',
    excludes: isAr ? 'لا يشمل العرض' : 'This quotation does not include',
    validity: isAr ? 'هذا العرض صالح لمدة 14 يوماً من تاريخه' : 'This quotation is valid for 14 days from its date',
    acceptance: isAr ? 'قبول العميل' : 'Customer Acceptance',
    signature: isAr ? 'التوقيع' : 'Signature',
    name: isAr ? 'الاسم' : 'Name',
    villa: isAr ? 'فيلا دورين' : 'Two-story villa',
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      {/* أزرار التحكم (تختفي عند الطباعة) */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between px-4 print:hidden">
        <button onClick={() => navigate('/quotations')} className="flex items-center gap-2 text-slate-600 hover:text-slate-800 text-sm">
          <ArrowRight size={18} /> رجوع
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-slate-200">
            <Globe size={14} className="text-slate-400 mr-1" />
            <button onClick={() => setLang('ar')} className={`px-3 py-1 text-xs rounded-lg font-medium ${isAr ? 'bg-amber-100 text-amber-700' : 'text-slate-500'}`}>عربي</button>
            <button onClick={() => setLang('en')} className={`px-3 py-1 text-xs rounded-lg font-medium ${!isAr ? 'bg-amber-100 text-amber-700' : 'text-slate-500'}`}>English</button>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#c4925a' }}>
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      {/* ورقة العرض */}
      <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none p-10 print:p-8" dir={dir} style={{ minHeight: '1000px' }}>
        {/* الترويسة */}
        <div className="flex items-start justify-between border-b-2 pb-5 mb-6" style={{ borderColor: '#c4925a' }}>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#7b4a2d' }}>{t.company}</h1>
            <div className="text-sm text-slate-500 mt-1" dir="ltr" style={{ textAlign: align }}>{t.cr} &nbsp;|&nbsp; +973 37055576</div>
            <div className="text-sm text-slate-500" dir="ltr" style={{ textAlign: align }}>Info@AlMaimounConst.com</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold px-4 py-2 rounded-lg" style={{ background: '#faf6f1', color: '#7b4a2d' }}>{t.title}</div>
          </div>
        </div>

        {/* رقم العرض والتاريخ */}
        <div className="flex justify-between mb-6 text-sm">
          <div><span className="text-slate-400">{t.quoteNo}: </span><span className="font-bold" dir="ltr">{quote.quote_number}</span></div>
          <div><span className="text-slate-400">{t.date}: </span><span className="font-medium" dir="ltr">{quote.issue_date}</span></div>
        </div>

        {/* بيانات العميل */}
        <div className="bg-slate-50 rounded-lg p-4 mb-6 text-sm space-y-1">
          <div><span className="text-slate-400">{t.to}: </span><span className="font-semibold">{quote.customer_name}</span></div>
          {quote.customer_address && <div><span className="text-slate-400">{isAr ? 'العنوان' : 'Address'}: </span>{quote.customer_address}</div>}
          {quote.customer_phone && <div><span className="text-slate-400">{t.phone}: </span><span dir="ltr">{quote.customer_phone}</span></div>}
          <div><span className="text-slate-400">{t.project}: </span>{quote.project_name || t.villa}{quote.location && ` — ${quote.location}`}{quote.area && ` — ${quote.area} ${isAr ? 'م²' : 'm²'}`}</div>
        </div>

        {/* جدول البنود */}
        <div className="mb-6">
          <h3 className="font-bold text-slate-700 mb-2">{t.scope}:</h3>
          <table className="w-full text-sm border border-slate-200">
            <thead>
              <tr style={{ background: '#faf6f1' }}>
                <th className="border border-slate-200 px-2 py-2 w-10">{t.no}</th>
                <th className="border border-slate-200 px-3 py-2" style={{ textAlign: align }}>{t.desc}</th>
                <th className="border border-slate-200 px-3 py-2 w-32">{t.amount}</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((it, i) => (
                <tr key={i}>
                  <td className="border border-slate-200 px-2 py-2 text-center">{i + 1}</td>
                  <td className="border border-slate-200 px-3 py-2" style={{ textAlign: align }}>{isAr ? it.description : (it.description_en || it.description)}</td>
                  <td className="border border-slate-200 px-3 py-2 text-center" dir="ltr">{Number(it.unit_price) > 0 ? fmt(it.unit_price) : '—'}</td>
                </tr>
              ))}
              <tr style={{ background: '#7b4a2d' }} className="text-white">
                <td colSpan={2} className="border border-slate-200 px-3 py-2.5 font-bold" style={{ textAlign: align }}>{t.grandTotal}</td>
                <td className="border border-slate-200 px-3 py-2.5 text-center font-bold" dir="ltr">{fmt(quote.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* الشروط */}
        {(isAr ? quote.terms_ar : quote.terms_en) && (
          <div className="mb-5">
            <h3 className="font-bold text-slate-700 mb-2">{t.terms}:</h3>
            <div className="text-sm text-slate-600 whitespace-pre-line bg-slate-50 rounded-lg p-3">{isAr ? quote.terms_ar : quote.terms_en}</div>
          </div>
        )}

        {/* لا يشمل */}
        <div className="mb-6">
          <h3 className="font-bold text-slate-700 mb-2">{t.excludes}:</h3>
          <div className="text-xs text-slate-600 grid grid-cols-1 gap-0.5">
            {excluded.map((ex, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-slate-400 shrink-0">{i + 1}.</span>
                <span>{ex}</span>
              </div>
            ))}
          </div>
        </div>

        {/* الصلاحية */}
        <div className="text-sm font-medium text-center py-2 rounded-lg mb-6" style={{ background: '#faf6f1', color: '#7b4a2d' }}>
          {t.validity}
        </div>

        {/* خانة التوقيع */}
        <div className="border-t border-slate-200 pt-5 mt-8">
          <div className="font-bold text-slate-700 mb-3 text-sm">{t.acceptance}:</div>
          <div className="grid grid-cols-2 gap-8 text-sm">
            <div>
              <div className="text-slate-400 mb-6">{t.name}:</div>
              <div className="border-b border-slate-300"></div>
            </div>
            <div>
              <div className="text-slate-400 mb-6">{t.signature}:</div>
              <div className="border-b border-slate-300"></div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@media print { @page { size: A4; margin: 0; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
    </div>
  )
}
