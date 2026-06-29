import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Printer, Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ════════════════════════════════════════════════════════════════
//  صفحة عرض/طباعة عرض السعر — القالب الرسمي (عربي/إنجليزي)
//  مؤسسة الميمون للمقاولات — CR 120637-2
//  للبناء بوست تنشن: تُرفق صفحات خطوات العمل تلقائياً بعد التسعيرة
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
  building_type: string   // post_tension | precast (داخلي — لا يظهر للعميل)
  total: number
}

interface QItem {
  description: string
  description_en: string
  detail: string          // الشرح تحت البند (عربي)
  detail_en: string       // الشرح تحت البند (إنجليزي)
  category: string
  sort_order: number
}

// ── البنود السبعة الثابتة بالشروحات الكاملة (حرفياً من النماذج) ──
const FIXED_ITEMS = [
  {
    ar: 'مواد البناء والأيدي العاملة', en: 'LABORS AND MATERIALS',
    detailAr: 'جميع المواد والأيدي العاملة.', detailEn: 'ALL MATERIALS AND MANPOWER.',
  },
  {
    ar: 'جميع أعمال الخرسانة', en: 'COMPLETE ALL CONCRETE WORKS',
    detailAr: 'أعمال تسليح الحديد - أعمال النجارة - أعمال الأساسات والقواعد - أعمال الجسور والأعمدة - أعمال الأسقف.',
    detailEn: 'INCLUDES ALL IRON - CARPENTRY - CONCRETE - FOUNDATIONS - COLUMNS AND BEAMS WORKS.',
  },
  {
    ar: 'جميع أعمال الطابوق', en: 'COMPLETE ALL BLOCK INSTALLATION WORK',
    detailAr: 'جميع الطابوق المستخدم حسب الرسومات الهندسية والمواصفات المعيارية.',
    detailEn: 'ALL BLOCKS USED AS PER THE DRAWINGS AND STANDARD SPECS.',
  },
  {
    ar: 'جميع أعمال المساح', en: 'COMPLETE ALL PLASTER WORK',
    detailAr: 'المساح الداخلي والخارجي.', detailEn: 'INTERNAL AND EXTERNAL.',
  },
  {
    ar: 'جميع أعمال البلاط', en: 'COMPLETE ALL TILES WORK',
    detailAr: 'تركيب البلاط للجدران والأرضيات (على المالك توفير البلاط بالكامل).',
    detailEn: 'FOR WALL AND FLOORS (THE OWNER SHALL PROVIDE THE TILES IN FULL).',
  },
  {
    ar: 'أعمال التركيب الأولي للكهرباء', en: 'INITIAL ELECTRICAL INSTALLATION WORKS',
    detailAr: 'التركيب الأولي هو توفير وتركيب كل ما هو داخل الجدران من أنابيب وبوكسات، أما بالنسبة إلى ما يقع خارج الجدران من اكسسوارات كهربائية يتحمل المالك توفيره والمقاول التركيب فقط. (شامل الأسلاك والكيبل وصندوق التوزيع)',
    detailEn: 'THE INITIAL INSTALLATION IS TO PROVIDE THE INSTALLATION OF EVERYTHING INSIDE THE WALL, INCLUDING PIPES – BOX. AS FOR ELECTRICAL ACCESSORIES THAT ARE LOCATED OUTSIDE THE WALLS, THE OWNER IS RESPONSIBLE FOR THE PROVISION AND THE CONTRACTOR FOR THE INSTALLATION.',
  },
  {
    ar: 'أعمال التركيب الأولي للماء', en: 'INITIAL PLUMBING INSTALLATION WORK',
    detailAr: 'التركيب الأولي هو توفير وتركيب كل ما هو داخل الجدران من أنابيب صرف صحي وأنابيب تمديدات الماء، إلخ. أما بالنسبة إلى ما يقع خارج الجدران من اكسسوارات صحية يتحمل المالك توفيره والمقاول التركيب فقط.',
    detailEn: 'THE INITIAL INSTALLATION IS TO PROVIDE THE INSTALLATION OF EVERYTHING INSIDE THE WALL, INCLUDING DRAINAGE PIPES, SANITARY DUCTS - WATER PIPES – ETC. AS FOR SANITARY ACCESSORIES THAT ARE LOCATED OUTSIDE THE WALLS THE OWNER IS RESPONSIBLE FOR THE PROVISION AND THE CONTRACTOR FOR THE INSTALLATION.',
  },
]

// قائمة "لا تشمل" (15 بند حرفي)
const EXCLUDED_AR = [
  'جميع أعمال الحفر والدفان وتهيئة وضغط الأرض.',
  'جميع الاكسسوارات والأدوات الكهربائية.',
  'جميع الاكسسوارات والأدوات الصحية.',
  'جميع أعمال التكييف.',
  'جميع أعمال أنظمة مكافحة الحريق.',
  'جميع أعمال الألمنيوم للأبواب والنوافذ.',
  'جميع أعمال الحديد المطاوع.',
  'جميع أعمال الخشب والنجارة.',
  'جميع أعمال الجبس والصباغة.',
  'جميع أعمال الأنظمة الأمنية وكاميرات المراقبة والستاليت.',
  'جميع أعمال الخزائن للمطابخ وملحقاتها.',
  'جميع أعمال العزل الحراري للأسطح الخرسانية.',
  'جميع أعمال الزراعة والتشجير.',
  'جميع أعمال العزل المائي.',
  'جميع ما لم يذكر في النقاط المشمولة في هذه التسعيرة.',
]
const EXCLUDED_EN = [
  'All excavation, demolition, backfilling, pressure testing, and compaction.',
  'All electrical accessories and tools.',
  'All accessories and sanitary ware.',
  'All the air conditioning works.',
  'All works of firefighting systems.',
  'All aluminum works, doors, and windows.',
  'All wrought iron works.',
  'All wood and carpentry work.',
  'All painting and gypsum works.',
  'All security systems, surveillance cameras and satellite work.',
  'All cabinet work for kitchens and accessories.',
  'All thermal insulation works for concrete surfaces.',
  'All agricultural and landscaping works.',
  'All swimming pool works.',
  'All that is not mentioned in the points contained in this quote.',
]

// خطوات العمل (بوست تنشن فقط) — 12 خطوة + ملاحظات
const WORK_STEPS = [
  { t: 'Site Preparation and Protection', items: ['Secure and prepare the construction site by installing temporary fencing to protect the area and keep it safe.', 'Spray anti-termite chemicals over the soil to prevent termite infestation, which could damage the foundation over time.', 'Lay a 1000-gauge polythene sheet over the ground to act as a moisture barrier and prevent dampness from affecting the structure.', 'Pour blinding concrete (a thin layer of plain concrete) over the sheet to provide a clean, even surface for the foundation work.'] },
  { t: 'Foundation Work (Footings)', items: ['Set up wooden formwork (shuttering) around the footings to shape and hold the concrete in place.', 'Install reinforcement steel bars (rebar) inside the footing formwork, ensuring proper spacing and placement as per structural drawings.', 'Apply waterproofing layers: first a layer of bitumen, followed by a 1cm-thick membrane sheet to prevent water seepage.', 'Pour concrete into the footing formwork and use a vibrator to remove air pockets for a strong and stable foundation.', 'Allow the concrete to cure properly, then remove the formwork, ensuring the footings are solid and defect-free.'] },
  { t: 'Ground Beam Installation', items: ['Prepare formwork for the ground beams, which will connect the footings and distribute loads evenly.', 'Install steel reinforcement bars inside the ground beam formwork, following engineering specifications.', 'Pour concrete for the ground beams, ensuring proper leveling and compaction.', 'Apply bitumen coating and a polythene sheet on the beams for additional waterproofing.'] },
  { t: 'Backfilling and Soil Compaction', items: ['Backfill soil around the footings and beams using compacted layers to provide stability.', 'Level and compact the soil properly to prevent future settlement or cracks in the slab.', 'Spray a second layer of anti-termite chemicals before the next stage.'] },
  { t: 'Ground Slab Preparation and Pouring', items: ['Lay another layer of 1000-gauge polythene sheet to act as a moisture barrier under the slab.', 'Install BRC steel mesh to reinforce the slab and prevent cracking.', 'Pour concrete for the ground slab, ensuring a smooth and even finish.'] },
  { t: 'Ground Floor Columns', items: ['Position and install reinforcement steel bars for the vertical columns.', 'Set up column formwork, ensuring correct alignment and dimensions.', 'Pour concrete for the columns, vibrating properly to eliminate air pockets.', 'Once cured, remove the formwork carefully to reveal the completed columns.'] },
  { t: 'Ground Floor Slab (Roof of Ground Floor)', items: ['Install scaffolding and temporary supports to hold the slab formwork in place.', 'Set up wooden or steel formwork for the slab, ensuring a flat and stable surface.', 'Install reinforcement steel bars, ensuring proper spacing and overlapping.', 'Lay post-tension cables as per the structural design for additional strength.', 'Pour concrete for the slab, using a concrete vibrator for compaction.', 'Allow the concrete to cure properly, then remove the scaffolding and formwork.'] },
  { t: 'First Floor Columns', items: ['Install steel reinforcement bars for the first-floor columns.', 'Set up formwork to shape the columns.', 'Pour concrete into the formwork, ensuring it reaches all areas properly.', 'After curing, remove the formwork and check for defects.'] },
  { t: 'First Floor Slab', items: ['Set up scaffolding and formwork to hold the slab in place.', 'Install steel reinforcement bars, ensuring correct positioning.', 'Lay post-tension cables, securing them according to structural plans.', 'Pour concrete for the first-floor slab, vibrating it for proper compaction.', 'Once cured, remove the formwork and scaffolding.'] },
  { t: 'Staircase Room Construction', items: ['Install steel reinforcement bars for the staircase room columns.', 'Set up formwork for the staircase columns.', 'Pour concrete for the staircase columns and let them cure.', 'Remove the formwork once the concrete hardens.', 'Set up scaffolding and formwork for the staircase slab.', 'Install reinforcement steel and post-tension cables.', 'Pour concrete for the staircase slab, then remove the scaffolding after curing.'] },
  { t: 'Blockwork (Walls Construction)', items: ['Lay concrete blocks for the ground floor walls, ensuring proper alignment.', 'Construct the first-floor block walls, following the structural layout.', 'Build block walls for the staircase room.'] },
  { t: 'Plastering and Finishing Work', items: ['Prepare interior walls for plastering, ensuring a smooth surface.', 'Apply plaster to interior walls, leveling it properly.', 'Prepare exterior walls for plastering, fixing any uneven surfaces.', 'Plaster the exterior walls, ensuring a strong and uniform finish.'] },
]

const IMPORTANT_NOTES = [
  'Quality Control – Ensure that all materials, including concrete, steel, and blocks, meet the required quality standards and comply with engineering specifications.',
  'Consultant Approval – Each phase must be inspected and approved by the consultant engineer before proceeding to the next stage.',
  'Curing Process – Proper curing time for concrete must be followed to ensure strength and durability, avoiding premature failure.',
  'Safety Measures – Implement strict safety guidelines, including PPE for workers, proper scaffolding, and fall protection systems.',
  'Site Cleanliness – Maintain a clean and organized construction site to avoid hazards and improve efficiency.',
  'Material Storage – Store materials properly to prevent contamination, moisture damage, or loss due to weather conditions.',
  'Structural Integrity – Ensure correct installation of reinforcement steel and post-tension cables as per the design to avoid structural issues.',
  'Waterproofing Application – Properly apply waterproofing materials at all required areas, including foundations, beams, and roofs, to prevent water leakage.',
  'Plumbing and Electrical Coordination – Verify that electrical and plumbing conduits are installed before casting concrete to avoid rework.',
  'Thermal Insulation – Use appropriate insulation materials in blockwork and roofing to enhance energy efficiency and prevent heat gain.',
  'Expansion Joints – Ensure proper placement of expansion joints in slabs and walls to accommodate structural movements.',
  'Concrete Mix Testing – Conduct regular slump and compressive strength tests to verify concrete quality before pouring.',
  'Weather Considerations – Avoid pouring concrete during extreme weather conditions such as high heat or heavy rain to prevent defects.',
  'Rebar Covering – Maintain the correct concrete cover for steel reinforcement to prevent corrosion and enhance durability.',
  'Alignment and Leveling – Check alignment and leveling of walls, slabs, and beams to ensure they meet design specifications.',
  'Formwork Removal Timing – Do not remove formwork before the concrete has gained sufficient strength, as per engineering recommendations.',
  'Documentation and Records – Keep proper documentation of material deliveries, test results, and approvals for future reference.',
  'Waste Management – Implement a waste disposal plan to remove construction debris efficiently and reduce environmental impact.',
  'Post-Construction Inspection – Conduct a final quality check before handover to ensure all structural and finishing elements meet the required standards.',
]

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

// ألوان الهوية
const GOLD = '#c4925a'
const BROWN = '#7b4a2d'
const HEADER_BG = '#b08a5f'

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
  const isPostTension = quote.building_type === 'post_tension'

  // البنود الإضافية المحفوظة (حفّار/دفان، جبس/صباغة)
  const optionalItems = items.filter(it => it.category === 'optional')
  const hasGypsum = optionalItems.some(it => (it.description || '').includes('جبس') || (it.description_en || '').toLowerCase().includes('gypsum'))
  const hasExcavation = optionalItems.some(it => (it.description || '').includes('حفر') || (it.description_en || '').toLowerCase().includes('excavation'))

  // قائمة "لا تشمل" مع حذف البنود المضافة كأعمال
  const excluded = (isAr ? EXCLUDED_AR : EXCLUDED_EN).filter(ex => {
    if (hasGypsum && (ex.includes('الجبس') || ex.toLowerCase().includes('gypsum') || ex.toLowerCase().includes('painting'))) return false
    if (hasExcavation && (ex.includes('الحفر') || ex.toLowerCase().includes('excavation'))) return false
    return true
  })

  // النصوص حسب اللغة
  const t = {
    quoteNo: isAr ? 'رقم التسعيرة' : 'Quotation no.',
    date: isAr ? 'التاريخ' : 'Date',
    title: isAr ? 'تسعيرة بناء' : 'Quotation',
    company: isAr ? 'الميمون للمقاولات' : 'ALMAIMOUN CONSTRUCTION',
    clientInfo: isAr ? 'معلومات العميل' : 'Client information',
    clientName: isAr ? 'اسم العميل' : 'Client name',
    address: isAr ? 'عنوان العميل' : 'House address',
    contact: isAr ? 'رقم التواصل' : 'Contact number',
    subject: isAr ? 'المشروع' : 'Subject',
    greeting: isAr
      ? 'عزيزي العميل، نشكرك على استفسارك ويسعدنا أن نقدم لك أفضل الأسعار حسب الرسومات الهندسية المرسلة من قبلكم لبناء أسود مع المواد، وتشمل هذه التسعيرة ما هو مذكور أدناه.'
      : 'Dear Sir, thank you for considering us to quote for the proposal project as per the object. Here, we would like to submit our best price as per the project requirement and the following breakdown terms and conditions,',
    termsTitle: isAr ? 'الشروط والأحكام' : 'Terms of condition',
    terms: isAr
      ? ['الأسعار ثابتة كما هو متفق عليه في هذه التسعيرة.', 'أي تغيير في المتطلبات سيؤدي إلى تغيير في التسعيرة.', 'أي أعمال إضافية ستُحتسب في تسعيرة منفصلة.']
      : ['Prices are set as agreed in this quotation.', 'Any changes in requirements will attract a variation in the quotation.', 'Any additional work will be charged in a separate quotation.'],
    estimateLine: isAr
      ? 'تشمل هذه التسعيرة جميع الخدمات والبنود (الأيدي العاملة، المواد، والنقل اللازم لإنشاء وإتمام المشروع):'
      : "This estimate provides all service and items (labor's, materials & transport for necessary to the construction and the completion of the project):",
    no: isAr ? 'م' : 'No',
    desc: isAr ? 'الوصف' : 'DESCRIPTION',
    grandTotal: isAr ? 'السعر الإجمالي' : 'GRAND TOTAL',
    bd: isAr ? 'دينار بحريني' : 'BD',
    excludes: isAr ? 'هذه التسعيرة لا تشمل:' : 'This quote does not include:',
    validity: isAr ? 'ملاحظة: هذه التسعيرة صالحة لمدة 14 يوماً من تاريخ إصدارها.' : 'Note: This quotation is valid for 14 days from the date of issue',
    acceptance: isAr ? 'موافقة العميل' : 'Customer Acceptance',
    signature: isAr ? 'التوقيع' : 'Signature',
    pname: isAr ? 'الاسم' : 'Printed name',
    dateLabel: isAr ? 'التاريخ' : 'Date',
    villa: isAr ? 'فيلا دورين' : 'two story villa',
    slogan: 'مشروعك مضمون',
    stepsTitle: 'Construction Work Steps',
    notesTitle: 'Important Notes for Construction Work',
    closing: 'We look forward to a successful collaboration with you.',
    step: 'Step',
  }

  // بناء سطر الموضوع
  const subjectLine = isAr
    ? `بناء ${t.villa} في ${quote.location || ''}، البحرين مساحة بناء ${quote.area || ''} متر مربع`
    : `construction for ${t.villa} at ${quote.location || ''}, Bahrain ${quote.area || ''} m².`

  // ترويسة الشركة (تتكرر في كل صفحة طباعة)
  const CompanyHeader = () => (
    <div className="flex items-stretch justify-between mb-0">
      <div className="flex items-center gap-3 px-6 py-4" style={{ background: HEADER_BG, borderRadius: '0 0 40px 0', minWidth: '55%' }}>
        <div className="text-white">
          <div className="flex items-center gap-2">
            <div className="text-3xl font-black tracking-tight" style={{ fontFamily: 'Arial Black, sans-serif' }}>M</div>
            <div>
              <div className="text-lg font-bold leading-tight">ALMAIMOUN</div>
              <div className="text-[10px] tracking-[0.3em] leading-tight">CONSTRUCTION</div>
            </div>
          </div>
        </div>
        <div className="text-white text-lg font-bold mr-2" style={{ fontFamily: 'Tahoma, sans-serif' }}>مقاولات الميمون</div>
      </div>
      <div className="px-6 py-4 text-white text-xs leading-relaxed" style={{ background: HEADER_BG, borderRadius: '0 0 0 40px', textAlign: 'right' as const }} dir="ltr">
        <div>C.R No: 120637-2</div>
        <div>+973 3705 5576</div>
        <div>AlMaimounConstruction</div>
        <div>@gmail.com</div>
      </div>
    </div>
  )

  const PageFooter = () => (
    <div className="absolute bottom-0 left-0 right-0">
      <div className="px-6 py-2 text-white text-sm font-bold inline-block" style={{ background: HEADER_BG, borderRadius: '0 40px 0 0' }}>
        {t.slogan}
      </div>
    </div>
  )

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
          {isPostTension && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-lg print:hidden">+ صفحات الخطوات</span>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: GOLD }}>
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      {/* ═══ صفحة التسعيرة ═══ */}
      <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none relative quote-page" dir={dir} style={{ minHeight: '1120px', paddingBottom: '60px' }}>
        <CompanyHeader />

        <div className="px-10 pt-6">
          {/* العنوان + رقم العرض */}
          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold underline" style={{ color: BROWN }}>{isAr ? t.title : 'Quotation 1'}</h1>
          </div>
          <div className="mb-4 text-sm" style={{ textAlign: align }}>
            <div><span className="font-bold">{t.quoteNo}: </span><span dir="ltr">{quote.quote_number}</span></div>
            <div><span className="font-bold">{t.date}: </span><span dir="ltr">{quote.issue_date}</span></div>
            <div className="font-bold mt-1">{t.company}</div>
            <div dir="ltr" style={{ textAlign: align }}>+973 37055576</div>
            <div dir="ltr" style={{ textAlign: align }}>Info@AlMaimounConst.com</div>
          </div>

          {/* معلومات العميل */}
          <div className="mb-4 text-sm">
            <div className="font-bold mb-1">{t.clientInfo}:</div>
            <div><span className="font-bold">{t.clientName}: </span>{quote.customer_name}</div>
            {quote.customer_address && <div><span className="font-bold">{t.address}: </span>{quote.customer_address}</div>}
            {quote.customer_phone && <div><span className="font-bold">{t.contact}: </span><span dir="ltr">{quote.customer_phone}</span></div>}
            <div><span className="font-bold">{t.subject}: </span>{subjectLine}</div>
          </div>

          {/* التحية */}
          <p className="text-sm mb-3 leading-relaxed" style={{ textAlign: align }}>{t.greeting}</p>

          {/* الشروط */}
          <div className="mb-3 text-sm">
            <div className="font-bold">{t.termsTitle}:</div>
            {t.terms.map((term, i) => (
              <div key={i}>{isAr ? `${i + 1}. ` : `${i + 1}. `}{term}</div>
            ))}
          </div>

          <p className="text-sm mb-3 leading-relaxed" style={{ textAlign: align }}>{t.estimateLine}</p>

          {/* جدول البنود بالشروحات */}
          <table className="w-full text-sm border-collapse mb-5" style={{ border: `1px solid ${GOLD}` }}>
            <thead>
              <tr style={{ background: HEADER_BG, color: 'white' }}>
                <th className="px-2 py-2 w-8 text-center" style={{ border: `1px solid ${GOLD}` }}>{t.no}</th>
                <th className="px-3 py-2" style={{ border: `1px solid ${GOLD}`, textAlign: align }}>{t.desc}</th>
              </tr>
            </thead>
            <tbody>
              {FIXED_ITEMS.map((it, i) => (
                <tr key={i}>
                  <td className="px-2 py-2 text-center align-top font-bold" style={{ border: `1px solid ${GOLD}` }}>{i + 1}</td>
                  <td className="px-3 py-2" style={{ border: `1px solid ${GOLD}`, textAlign: align }}>
                    <div className="font-bold">{isAr ? it.ar : it.en}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{isAr ? it.detailAr : it.detailEn}</div>
                  </td>
                </tr>
              ))}
              {/* البنود الإضافية (حفّار/دفان، جبس/صباغة) */}
              {optionalItems.map((it, i) => (
                <tr key={`opt-${i}`}>
                  <td className="px-2 py-2 text-center align-top font-bold" style={{ border: `1px solid ${GOLD}` }}>{FIXED_ITEMS.length + i + 1}</td>
                  <td className="px-3 py-2" style={{ border: `1px solid ${GOLD}`, textAlign: align }}>
                    <div className="font-bold">{isAr ? it.description : (it.description_en || it.description)}</div>
                    {(isAr ? it.detail : it.detail_en) && <div className="text-xs text-slate-600 mt-0.5">{isAr ? it.detail : it.detail_en}</div>}
                  </td>
                </tr>
              ))}
              {/* السعر الإجمالي فقط */}
              <tr style={{ background: '#f5ede4' }}>
                <td className="px-2 py-2.5 font-bold text-center" style={{ border: `1px solid ${GOLD}` }}></td>
                <td className="px-3 py-2.5" style={{ border: `1px solid ${GOLD}`, textAlign: align }}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-base" style={{ color: BROWN }}>{t.grandTotal}</span>
                    <span className="font-bold text-base" dir="ltr" style={{ color: BROWN }}>{fmt(quote.total)} {t.bd}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* لا تشمل */}
          <div className="mb-4">
            <div className="font-bold text-sm mb-1">{t.excludes}</div>
            <div className="text-xs space-y-0.5">
              {excluded.map((ex, i) => (
                <div key={i}>{i + 1}. {ex}</div>
              ))}
            </div>
          </div>

          {/* الصلاحية */}
          <div className="font-bold text-sm text-center my-4">{t.validity}</div>

          {/* خانة التوقيع */}
          <div className="mt-6">
            <div className="inline-block px-4 py-1.5 text-white text-sm font-bold mb-2" style={{ background: HEADER_BG }}>{t.acceptance}</div>
            <div className="grid grid-cols-3 gap-0 border" style={{ borderColor: GOLD }}>
              <div className="px-3 py-3 text-center text-xs" style={{ background: '#faf3ea', borderLeft: `1px solid ${GOLD}` }}>{t.signature}</div>
              <div className="px-3 py-3 text-center text-xs" style={{ background: '#faf3ea', borderLeft: `1px solid ${GOLD}` }}>{t.pname}</div>
              <div className="px-3 py-3 text-center text-xs" style={{ background: '#faf3ea' }}>{t.dateLabel}</div>
            </div>
          </div>
        </div>

        <PageFooter />
      </div>

      {/* ═══ صفحات خطوات العمل (بوست تنشن فقط) ═══ */}
      {isPostTension && (
        <>
          <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none relative mt-8 print:mt-0 quote-page page-break" dir="ltr" style={{ minHeight: '1120px', paddingBottom: '60px' }}>
            <CompanyHeader />
            <div className="px-10 pt-6">
              <h2 className="text-2xl font-bold text-center underline mb-6" style={{ color: BROWN }}>{t.stepsTitle}</h2>
              {WORK_STEPS.slice(0, 6).map((step, i) => (
                <div key={i} className="mb-4">
                  <div className="font-bold text-sm mb-1" style={{ color: BROWN }}>◇ {t.step} {i + 1}: {step.t}</div>
                  <ol className="list-decimal mr-5 pr-2 text-xs space-y-0.5 text-slate-700">
                    {step.items.map((item, j) => <li key={j} className="ml-4 pl-1">{item}</li>)}
                  </ol>
                </div>
              ))}
            </div>
            <PageFooter />
          </div>

          <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none relative mt-8 print:mt-0 quote-page page-break" dir="ltr" style={{ minHeight: '1120px', paddingBottom: '60px' }}>
            <CompanyHeader />
            <div className="px-10 pt-6">
              {WORK_STEPS.slice(6).map((step, i) => (
                <div key={i} className="mb-4">
                  <div className="font-bold text-sm mb-1" style={{ color: BROWN }}>◇ {t.step} {i + 7}: {step.t}</div>
                  <ol className="list-decimal mr-5 pr-2 text-xs space-y-0.5 text-slate-700">
                    {step.items.map((item, j) => <li key={j} className="ml-4 pl-1">{item}</li>)}
                  </ol>
                </div>
              ))}
            </div>
            <PageFooter />
          </div>

          <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none relative mt-8 print:mt-0 quote-page page-break" dir="ltr" style={{ minHeight: '1120px', paddingBottom: '60px' }}>
            <CompanyHeader />
            <div className="px-10 pt-6">
              <h2 className="text-2xl font-bold text-center underline mb-6" style={{ color: BROWN }}>{t.notesTitle}</h2>
              <div className="space-y-2">
                {IMPORTANT_NOTES.map((note, i) => (
                  <div key={i} className="flex gap-2 text-xs text-slate-700">
                    <span style={{ color: '#16a34a' }}>✓</span>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
              <div className="text-center font-bold text-sm mt-6" style={{ color: BROWN }}>"{t.closing}"</div>
            </div>
            <PageFooter />
          </div>
        </>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page-break { page-break-before: always; }
          .quote-page { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
    </div>
  )
}
