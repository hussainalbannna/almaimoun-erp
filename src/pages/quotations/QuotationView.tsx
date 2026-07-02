import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Printer, Globe, Pencil, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { readDocumentText, hasApiKey } from '../../lib/ai'

// ════════════════════════════════════════════════════════════════
//  صفحة عرض/طباعة عرض السعر — مؤسسة الميمون للمقاولات (CR 120637-2)
//  التصميم البسيط الأصلي + الشروحات الكاملة + السعر الإجمالي فقط
//  بوست تنشن: تُرفق صفحات الخطوات (بنفس لغة التسعيرة)
// ════════════════════════════════════════════════════════════════

interface Quotation {
  id: string
  quote_number: string
  customer_name: string
  customer_address: string
  customer_phone: string
  project_desc_ar: string
  project_desc_en: string
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
  detail: string
  detail_en: string
  category: string
  sort_order: number
}

// الهوية الثابتة
const FALLBACK = {
  name_en: 'ALMAIMOUN CONSTRUCTION',
  name_ar: 'الميمون للمقاولات',
  phone: '+973 37055576',
  email: 'info@almaimoun-construction.com',
  cr: '120637-2',
}

// ── البنود السبعة بالشروحات الكاملة (حرفياً من النماذج) ──
const FIXED_ITEMS = [
  { ar: 'مواد البناء والأيدي العاملة', en: 'LABORS AND MATERIALS',
    detailAr: 'جميع المواد والأيدي العاملة.', detailEn: 'ALL MATERIALS AND MANPOWER.' },
  { ar: 'جميع أعمال الخرسانة', en: 'COMPLETE ALL CONCRETE WORKS',
    detailAr: 'أعمال تسليح الحديد - أعمال النجارة - أعمال الأساسات والقواعد - أعمال الجسور والأعمدة - أعمال الأسقف.',
    detailEn: 'INCLUDES ALL IRON - CARPENTRY - CONCRETE - FOUNDATIONS - COLUMNS AND BEAMS WORKS.' },
  { ar: 'جميع أعمال الطابوق', en: 'COMPLETE ALL BLOCK INSTALLATION WORK',
    detailAr: 'جميع الطابوق المستخدم حسب الرسومات الهندسية والمواصفات المعيارية.',
    detailEn: 'ALL BLOCKS USED AS PER THE DRAWINGS AND STANDARD SPECS.' },
  { ar: 'جميع أعمال المساح', en: 'COMPLETE ALL PLASTER WORK',
    detailAr: 'المساح الداخلي والخارجي.', detailEn: 'INTERNAL AND EXTERNAL.' },
  { ar: 'جميع أعمال البلاط', en: 'COMPLETE ALL TILES WORK',
    detailAr: 'تركيب البلاط للجدران والأرضيات (على المالك توفير البلاط بالكامل).',
    detailEn: 'FOR WALL AND FLOORS (THE OWNER SHALL PROVIDE THE TILES IN FULL).' },
  { ar: 'أعمال التركيب الأولي للكهرباء', en: 'INITIAL ELECTRICAL INSTALLATION WORKS',
    detailAr: 'التركيب الأولي هو توفير وتركيب كل ما هو داخل الجدران من أنابيب وبوكسات، أما بالنسبة إلى ما يقع خارج الجدران من اكسسوارات كهربائية يتحمل المالك توفيره والمقاول التركيب فقط. (شامل الأسلاك والكيبل وصندوق التوزيع)',
    detailEn: 'THE INITIAL INSTALLATION IS TO PROVIDE THE INSTALLATION OF EVERYTHING INSIDE THE WALL, INCLUDING PIPES – BOX. AS FOR ELECTRICAL ACCESSORIES THAT ARE LOCATED OUTSIDE THE WALLS, THE OWNER IS RESPONSIBLE FOR THE PROVISION AND THE CONTRACTOR FOR THE INSTALLATION.' },
  { ar: 'أعمال التركيب الأولي للماء', en: 'INITIAL PLUMBING INSTALLATION WORK',
    detailAr: 'التركيب الأولي هو توفير وتركيب كل ما هو داخل الجدران من أنابيب صرف صحي وأنابيب تمديدات الماء، إلخ. أما بالنسبة إلى ما يقع خارج الجدران من اكسسوارات صحية يتحمل المالك توفيره والمقاول التركيب فقط.',
    detailEn: 'THE INITIAL INSTALLATION IS TO PROVIDE THE INSTALLATION OF EVERYTHING INSIDE THE WALL, INCLUDING DRAINAGE PIPES, SANITARY DUCTS - WATER PIPES – ETC. AS FOR SANITARY ACCESSORIES THAT ARE LOCATED OUTSIDE THE WALLS THE OWNER IS RESPONSIBLE FOR THE PROVISION AND THE CONTRACTOR FOR THE INSTALLATION.' },
]

// قائمة "لا تشمل" (15 بند)
const EXCLUDED_AR = [
  'جميع أعمال الحفر والدفان وتهيئة وضغط الأرض.', 'جميع الاكسسوارات والأدوات الكهربائية.',
  'جميع الاكسسوارات والأدوات الصحية.', 'جميع أعمال التكييف.', 'جميع أعمال أنظمة مكافحة الحريق.',
  'جميع أعمال الألمنيوم للأبواب والنوافذ.', 'جميع أعمال الحديد المطاوع.', 'جميع أعمال الخشب والنجارة.',
  'جميع أعمال الجبس بورد للأسقف.', 'جميع أعمال الدهان والصباغة.', 'جميع أعمال الأنظمة الأمنية وكاميرات المراقبة والستاليت.',
  'جميع أعمال الخزائن للمطابخ وملحقاتها.', 'جميع أعمال العزل الحراري للأسطح الخرسانية.',
  'جميع أعمال الزراعة والتشجير.', 'جميع أعمال العزل المائي.',
  'جميع ما لم يذكر في النقاط المشمولة في هذه التسعيرة.',
]
const EXCLUDED_EN = [
  'All excavation, demolition, backfilling, pressure testing, and compaction.', 'All electrical accessories and tools.',
  'All accessories and sanitary ware.', 'All the air conditioning works.', 'All works of firefighting systems.',
  'All aluminum works, doors, and windows.', 'All wrought iron works.', 'All wood and carpentry work.',
  'All gypsum board works for ceilings.', 'All painting works.', 'All security systems, surveillance cameras and satellite work.',
  'All cabinet work for kitchens and accessories.', 'All thermal insulation works for concrete surfaces.',
  'All agricultural and landscaping works.', 'All swimming pool works.',
  'All that is not mentioned in the points contained in this quote.',
]

// ── خطوات العمل (إنجليزي) ──
const STEPS_EN = [
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
const NOTES_EN = [
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

// ── خطوات العمل (عربي) ──
const STEPS_AR = [
  { t: 'تجهيز الموقع وحمايته', items: ['تأمين وتجهيز موقع البناء من خلال تركيب سياج مؤقت لحماية المنطقة والحفاظ على السلامة.', 'رش مواد مكافحة النمل الأبيض على التربة لمنع الإصابة التي قد تؤثر على الأساسات مستقبلاً.', 'فرش طبقة بوليثين بسماكة 1000 Gauge فوق الأرض كحاجز للرطوبة.', 'صب خرسانة نظافة فوق طبقة البوليثين لتوفير سطح نظيف ومستوي لأعمال الأساسات.'] },
  { t: 'أعمال الأساسات (القواعد)', items: ['تركيب الشدات الخشبية حول القواعد لتشكيل الخرسانة وتثبيتها في مكانها.', 'تركيب حديد التسليح داخل القواعد مع مراعاة التوزيع والمسافات حسب المخططات الإنشائية.', 'تنفيذ أعمال العزل المائي بوضع طبقة بيتومين أولاً، ثم تركيب غشاء عازل بسماكة 1 سم لمنع تسرب المياه.', 'صب الخرسانة داخل القواعد واستخدام الهزاز لإخراج الفراغات الهوائية وضمان قوة الأساس.', 'ترك الخرسانة حتى تتم عملية المعالجة (Curing) ثم فك الشدات والتأكد من سلامة القواعد وخلوها من العيوب.'] },
  { t: 'تركيب الجسور الأرضية', items: ['تجهيز الشدات الخاصة بالجسور الأرضية التي تربط بين القواعد وتوزع الأحمال بشكل متساوٍ.', 'تركيب حديد التسليح داخل شدات الجسور الأرضية حسب المواصفات الهندسية.', 'صب خرسانة الجسور الأرضية مع التأكد من ضبط المناسيب والدمك الجيد.', 'تطبيق طبقة بيتومين مع فرش طبقة بوليثين فوق الجسور الأرضية لزيادة العزل المائي.'] },
  { t: 'الردم ودمك التربة', items: ['ردم التربة حول القواعد والجسور الأرضية على طبقات مع دمكها جيداً لضمان الثبات.', 'تسوية التربة ودمكها بشكل صحيح لمنع حدوث هبوط أو تشققات مستقبلية في البلاطة الأرضية.', 'رش طبقة ثانية من مواد مكافحة النمل الأبيض قبل الانتقال للمرحلة التالية.'] },
  { t: 'تجهيز وصب البلاطة الأرضية', items: ['فرش طبقة أخرى من البوليثين بسماكة 1000 Gauge لتعمل كحاجز للرطوبة أسفل البلاطة الأرضية.', 'تركيب شبك حديد BRC لتسليح البلاطة ومنع حدوث التشققات.', 'صب خرسانة البلاطة الأرضية مع التأكد من الحصول على سطح مستوٍ وناعم.'] },
  { t: 'أعمدة الطابق الأرضي', items: ['تحديد وتركيب حديد التسليح الخاص بالأعمدة الرأسية.', 'تركيب شدات الأعمدة مع التأكد من صحة المحاور والأبعاد.', 'صب خرسانة الأعمدة مع استخدام الهزاز لضمان إزالة الفراغات الهوائية.', 'بعد اكتمال المعالجة، يتم فك الشدات بعناية لإظهار الأعمدة النهائية.'] },
  { t: 'بلاطة الطابق الأرضي (سقف الطابق الأرضي)', items: ['تركيب السقالات والدعامات المؤقتة لحمل شدات السقف وتثبيتها.', 'تجهيز الشدات الخشبية أو المعدنية للسقف مع التأكد من استواء وثبات السطح.', 'تركيب حديد التسليح مع مراعاة التوزيع الصحيح والتراكب بين القضبان.', 'تركيب كيابل الشد اللاحق (Post-Tension) حسب المخططات الإنشائية لزيادة القوة والتحمل.', 'صب خرسانة السقف مع استخدام الهزاز لضمان الدمك الجيد.', 'ترك الخرسانة حتى تتم المعالجة المطلوبة ثم إزالة السقالات والشدات.'] },
  { t: 'أعمدة الطابق الأول', items: ['تركيب حديد التسليح الخاص بأعمدة الطابق الأول.', 'تجهيز الشدات لتشكيل الأعمدة.', 'صب الخرسانة داخل الشدات مع التأكد من وصولها إلى جميع الأجزاء بشكل صحيح.', 'بعد اكتمال المعالجة، يتم فك الشدات وفحص الأعمدة للتأكد من خلوها من العيوب.'] },
  { t: 'بلاطة الطابق الأول', items: ['تركيب السقالات والشدات اللازمة لحمل السقف وتثبيته.', 'تركيب حديد التسليح مع التأكد من التوزيع الصحيح حسب المخططات.', 'تركيب كيابل الشد اللاحق (Post-Tension) وتثبيتها وفق المخططات الإنشائية.', 'صب خرسانة سقف الطابق الأول مع استخدام الهزاز لضمان الدمك الجيد.', 'بعد اكتمال المعالجة، يتم إزالة الشدات والسقالات.'] },
  { t: 'إنشاء غرفة الدرج', items: ['تركيب حديد التسليح الخاص بأعمدة غرفة الدرج.', 'تجهيز الشدات الخاصة بأعمدة غرفة الدرج.', 'صب خرسانة أعمدة غرفة الدرج وتركها حتى تتم المعالجة المطلوبة.', 'فك الشدات بعد تصلب الخرسانة.', 'تركيب السقالات والشدات الخاصة ببلاطة غرفة الدرج.', 'تركيب حديد التسليح وكيابل الشد اللاحق (Post-Tension).', 'صب خرسانة بلاطة غرفة الدرج ثم إزالة السقالات بعد اكتمال المعالجة.'] },
  { t: 'أعمال البلوك (بناء الجدران)', items: ['بناء جدران الطابق الأرضي باستخدام البلوك مع التأكد من الاستقامة والمحاذاة الصحيحة.', 'تنفيذ جدران الطابق الأول حسب المخططات الإنشائية والمعمارية.', 'بناء جدران غرفة الدرج باستخدام البلوك.'] },
  { t: 'أعمال اللياسة والتشطيبات', items: ['تجهيز الجدران الداخلية لأعمال اللياسة مع التأكد من نعومة واستواء السطح.', 'تنفيذ اللياسة للجدران الداخلية مع ضبط الاستقامة والتسوية بشكل صحيح.', 'تجهيز الجدران الخارجية لأعمال اللياسة ومعالجة أي تعرجات أو عيوب.', 'تنفيذ اللياسة الخارجية مع ضمان الحصول على تشطيب متجانس وقوي.'] },
]
const NOTES_AR = [
  'مراقبة الجودة – التأكد من أن جميع المواد المستخدمة مثل الخرسانة وحديد التسليح والبلوك مطابقة للمواصفات الهندسية ومعايير الجودة المطلوبة.',
  'اعتماد الاستشاري – يجب فحص واعتماد كل مرحلة من قبل المهندس الاستشاري قبل الانتقال إلى المرحلة التالية.',
  'معالجة الخرسانة – الالتزام بفترة المعالجة المطلوبة للخرسانة لضمان القوة والمتانة وتجنب حدوث أي ضعف أو تشققات مبكرة.',
  'اشتراطات السلامة – تطبيق تعليمات السلامة بشكل صارم بما يشمل معدات الحماية الشخصية، والسقالات الآمنة، وأنظمة الحماية من السقوط.',
  'نظافة الموقع – المحافظة على نظافة وترتيب موقع العمل لتقليل المخاطر وتحسين كفاءة التنفيذ.',
  'تخزين المواد – تخزين المواد بطريقة صحيحة لحمايتها من الرطوبة أو التلف أو العوامل الجوية.',
  'السلامة الإنشائية – التأكد من التركيب الصحيح لحديد التسليح وكيابل الشد اللاحق حسب المخططات لتجنب أي مشاكل إنشائية.',
  'أعمال العزل المائي – تنفيذ العزل المائي بشكل صحيح في جميع المواقع المطلوبة مثل الأساسات والجسور والأسطح لمنع تسرب المياه.',
  'تنسيق الأعمال الكهربائية والصحية – التأكد من تركيب تمديدات الكهرباء والصرف الصحي قبل صب الخرسانة لتجنب التكسير وإعادة العمل.',
  'العزل الحراري – استخدام مواد عزل مناسبة في الجدران والأسقف لتحسين كفاءة الطاقة وتقليل انتقال الحرارة.',
  'فواصل التمدد – تنفيذ فواصل التمدد في البلاطات والجدران بطريقة صحيحة لاستيعاب الحركة الإنشائية.',
  'فحص الخلطات الخرسانية – إجراء اختبارات الهبوط (Slump Test) واختبارات مقاومة الضغط بشكل دوري للتأكد من جودة الخرسانة قبل الصب.',
  'الظروف الجوية – تجنب صب الخرسانة أثناء الظروف الجوية القاسية مثل الحرارة العالية أو الأمطار الغزيرة لتفادي حدوث العيوب.',
  'تغطية حديد التسليح – الالتزام بسماكة الغطاء الخرساني المطلوبة لحماية الحديد من التآكل وزيادة عمر المنشأ.',
  'الاستقامة والمناسيب – التأكد من استقامة الجدران والبلاطات والجسور ومطابقتها للمناسيب والمخططات التصميمية.',
  'توقيت فك الشدات – عدم إزالة الشدات قبل وصول الخرسانة إلى القوة المطلوبة حسب التوصيات الهندسية.',
  'التوثيق والسجلات – الاحتفاظ بجميع سجلات المواد والفحوصات والاعتمادات للرجوع إليها مستقبلاً.',
  'إدارة المخلفات – تطبيق خطة مناسبة للتخلص من مخلفات البناء وتقليل الأثر البيئي.',
  'الفحص النهائي – إجراء فحص نهائي شامل قبل التسليم للتأكد من مطابقة جميع الأعمال للمواصفات المطلوبة.',
]

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const looksArabic = (s: string) => /[\u0600-\u06FF]/.test(s)

export default function QuotationView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [quote, setQuote] = useState<Quotation | null>(null)
  const [items, setItems] = useState<QItem[]>([])
  const [lang, setLang] = useState<'ar' | 'en'>('en')
  const [loading, setLoading] = useState(true)
  // أسماء محوّلة بالذكاء (كاش)
  const [tName, setTName] = useState('')
  const [tAddr, setTAddr] = useState('')
  const [tLoc, setTLoc] = useState('')
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: q } = await supabase.from('quotations').select('*').eq('id', id).single()
      const { data: its } = await supabase.from('quotation_items').select('*').eq('quotation_id', id).order('sort_order')
      if (q) { setQuote(q as Quotation); setLang((q.language as 'ar' | 'en') ?? 'en') }
      setItems((its ?? []) as QItem[])
      setLoading(false)
    }
    load()
  }, [id])

  // تحويل الأسماء للغة المختارة بالذكاء (عند تغير اللغة أو التحميل)
  useEffect(() => {
    if (!quote) return
    const targetAr = lang === 'ar'
    const fields = [
      { val: quote.customer_name, set: setTName },
      { val: quote.customer_address, set: setTAddr },
      { val: quote.location, set: setTLoc },
    ]
    // إذا كل الحقول بنفس لغة الهدف، لا نحتاج تحويل
    const needs = fields.filter(f => f.val && looksArabic(f.val) !== targetAr)
    if (needs.length === 0 || !hasApiKey()) {
      // استخدم الأصل كما هو
      setTName(quote.customer_name || ''); setTAddr(quote.customer_address || ''); setTLoc(quote.location || '')
      return
    }
    const run = async () => {
      setTranslating(true)
      try {
        const prompt = `حوّل القيم التالية إلى ${targetAr ? 'العربية' : 'الإنجليزية'} (للأسماء استخدم النقل الصوتي الصحيح المتعارف عليه في البحرين، وللمناطق استخدم الاسم الرسمي). أرجع JSON فقط بهذا الشكل بدون أي شرح:
{"name":"...","address":"...","location":"..."}

القيم:
الاسم: ${quote.customer_name || ''}
العنوان: ${quote.customer_address || ''}
المنطقة: ${quote.location || ''}`
        const res = await readDocumentText(new File([prompt], 'q.txt', { type: 'text/plain' }), prompt)
        const m = res.match(/\{[\s\S]*\}/)
        if (m) {
          const j = JSON.parse(m[0])
          setTName(j.name || quote.customer_name || '')
          setTAddr(j.address || quote.customer_address || '')
          setTLoc(j.location || quote.location || '')
        } else {
          setTName(quote.customer_name || ''); setTAddr(quote.customer_address || ''); setTLoc(quote.location || '')
        }
      } catch {
        setTName(quote.customer_name || ''); setTAddr(quote.customer_address || ''); setTLoc(quote.location || '')
      } finally { setTranslating(false) }
    }
    run()
  }, [quote, lang])

  if (loading) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
  if (!quote) return <div className="p-12 text-center text-slate-400">العرض غير موجود</div>

  const isAr = lang === 'ar'
  const dir = isAr ? 'rtl' : 'ltr'
  const alignClass = isAr ? 'text-right' : 'text-left'
  const isPostTension = quote.building_type === 'post_tension'

  const optionalItems = items.filter(it => it.category === 'optional')
  const optText = (it: QItem) => (it.description || '') + ' ' + (it.description_en || '').toLowerCase()
  const hasGypsum = optionalItems.some(it => optText(it).includes('جبس') || optText(it).includes('gypsum'))
  const hasPainting = optionalItems.some(it => optText(it).includes('صباغة') || optText(it).includes('دهان') || optText(it).includes('painting'))
  const hasExcavation = optionalItems.some(it => optText(it).includes('حفر') || optText(it).includes('excavation'))
  const hasInsulation = optionalItems.some(it => optText(it).includes('عزل') || optText(it).includes('waterproof') || optText(it).includes('insulation') || optText(it).includes('thermal'))

  const excluded = (isAr ? EXCLUDED_AR : EXCLUDED_EN).filter(ex => {
    const e = ex.toLowerCase()
    // الجبس: يُحذف بند الجبس من "لا تشمل" لو أُضيف الجبس
    if (hasGypsum && (ex.includes('الجبس') || e.includes('gypsum'))) return false
    // الصباغة: يُحذف بند الدهان من "لا تشمل" لو أُضيفت الصباغة
    if (hasPainting && (ex.includes('الدهان') || ex.includes('الصباغة') || e.includes('painting'))) return false
    if (hasExcavation && (ex.includes('الحفر') || e.includes('excavation'))) return false
    // العوازل: يُحذف بندا العزل المائي والحراري من "لا تشمل" لو أُضيف بند العوازل
    if (hasInsulation && (ex.includes('العزل') || e.includes('waterproof') || e.includes('insulation') || e.includes('thermal'))) return false
    return true
  })

  const steps = isAr ? STEPS_AR : STEPS_EN
  const notes = isAr ? NOTES_AR : NOTES_EN

  const L = {
    title: isAr ? 'تسعيرة بناء' : 'QUOTATION',
    quoteNo: isAr ? 'رقم التسعيرة' : 'Quotation no.',
    clientInfo: isAr ? 'معلومات العميل' : 'CLIENT INFORMATION',
    clientName: isAr ? 'اسم العميل' : 'Client name',
    address: isAr ? 'العنوان' : 'Address',
    contact: isAr ? 'رقم التواصل' : 'Contact',
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
    description: isAr ? 'الوصف' : 'DESCRIPTION',
    grandTotal: isAr ? 'السعر الإجمالي' : 'GRAND TOTAL',
    bd: isAr ? 'دينار بحريني' : 'BD',
    excludes: isAr ? 'هذه التسعيرة لا تشمل:' : 'This quote does not include:',
    validity: isAr ? 'ملاحظة: هذه التسعيرة صالحة لمدة 14 يوماً من تاريخ إصدارها.' : 'Note: This quotation is valid for 14 days from the date of issue',
    acceptance: isAr ? 'موافقة العميل' : 'Customer Acceptance',
    signature: isAr ? 'التوقيع' : 'Signature',
    pname: isAr ? 'الاسم' : 'Printed name',
    dateLabel: isAr ? 'التاريخ' : 'Date',
    villa: isAr ? 'فيلا دورين' : 'two story villa',
    stepsTitle: isAr ? 'خطوات أعمال البناء' : 'Construction Work Steps',
    notesTitle: isAr ? 'ملاحظات مهمة لأعمال البناء' : 'Important Notes for Construction Work',
    closing: isAr ? 'نتطلع إلى تعاون ناجح معكم.' : 'We look forward to a successful collaboration with you.',
    step: isAr ? 'الخطوة' : 'Step',
    name_co: isAr ? FALLBACK.name_ar : FALLBACK.name_en,
  }

  const projDesc = isAr ? (quote.project_desc_ar || 'بناء فيلا من طابقين') : (quote.project_desc_en || 'construction for two story villa')
  const subjectLine = isAr
    ? `${projDesc} في ${tLoc || ''}، البحرين مساحة بناء ${quote.area || ''} متر مربع`
    : `${projDesc} at ${tLoc || ''}, Bahrain ${quote.area || ''} m².`

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      {/* شريط الأدوات (عربي دائماً — لا يُطبع) */}
      <div className="no-print flex items-center justify-between mb-5 flex-wrap gap-3 print:hidden">
        <button onClick={() => navigate('/quotations')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowRight size={20} />
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {translating && <span className="text-xs text-amber-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> تحويل الأسماء...</span>}
          <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-slate-200">
            <Globe size={14} className="text-slate-400 mr-1" />
            <button onClick={() => setLang('ar')} className={`px-3 py-1 text-xs rounded-lg font-medium ${isAr ? 'bg-amber-100 text-amber-700' : 'text-slate-500'}`}>عربي</button>
            <button onClick={() => setLang('en')} className={`px-3 py-1 text-xs rounded-lg font-medium ${!isAr ? 'bg-amber-100 text-amber-700' : 'text-slate-500'}`}>English</button>
          </div>
          {isPostTension && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">+ صفحات الخطوات</span>}
          <button onClick={() => navigate(`/quotations/${quote.id}/edit`)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Pencil size={14} /> تعديل
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#c4925a' }}>
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      {/* ═══ ورقة التسعيرة ═══ */}
      <div dir={dir} className="bg-white rounded-2xl shadow-sm border border-slate-200 print:border-0 print:shadow-none quote-page relative overflow-hidden">
        {/* شريط علوي ذهبي رفيع */}
        <div className="h-2 w-full print:h-2" style={{ background: 'linear-gradient(90deg, #c4925a 0%, #7b4a2d 50%, #c4925a 100%)' }} />

        {/* شعار خلفي مخفي (watermark) متدرّج — جمالية راقية */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden" style={{ zIndex: 0 }}>
          <div className="text-center" style={{ transform: 'rotate(-12deg)', opacity: 0.04 }}>
            <div className="font-black leading-none" style={{ fontSize: '220px', color: '#7b4a2d', fontFamily: 'Arial Black, sans-serif' }}>M</div>
            <div className="font-bold" style={{ fontSize: '38px', color: '#7b4a2d', letterSpacing: '0.25em', marginTop: '-10px' }}>ALMAIMOUN</div>
          </div>
        </div>
        {/* زخرفة دائرية ناعمة (ركن) */}
        <div className="absolute pointer-events-none" style={{ top: '-60px', insetInlineEnd: '-60px', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,146,90,0.06) 0%, transparent 70%)', zIndex: 0 }} />

        {/* المحتوى فوق الـ watermark */}
        <div className="relative p-8" style={{ zIndex: 1 }}>
        {/* رأس بهوية الميمون — تصميم راقٍ */}
        <div className="flex items-start justify-between pb-5 mb-6" style={{ borderBottom: '2px solid', borderImage: 'linear-gradient(90deg, #c4925a, #e5d9c8) 1' }}>
          <div>
            <div className="text-xl font-bold" style={{ color: '#7b4a2d' }}>{L.name_co}</div>
            <div className="text-[11px] text-slate-500 mt-1.5" dir="ltr" style={{ textAlign: isAr ? 'right' : 'left' }}>
              <div style={{ display: 'block' }}>C.R No: {FALLBACK.cr}</div>
              <div style={{ display: 'block' }}>{FALLBACK.phone}</div>
              <div style={{ display: 'block' }}>{FALLBACK.email}</div>
            </div>
          </div>
          <div className={isAr ? 'text-left' : 'text-right'}>
            <div className="text-3xl font-black tracking-tight" style={{ color: '#c4925a' }}>{L.title}</div>
            <div className="inline-block mt-2 px-3 py-1 rounded-lg text-sm font-bold" style={{ background: '#faf6f1', color: '#7b4a2d' }} dir="ltr">{quote.quote_number}</div>
            <div className="text-xs text-slate-500 mt-1.5" dir="ltr">{quote.issue_date}</div>
          </div>
        </div>

        {/* بيانات العميل — كرت أنيق */}
        <div className="mb-5 rounded-xl p-4 text-sm" style={{ background: 'linear-gradient(135deg, #faf6f1 0%, #fdfbf8 100%)', border: '1px solid #efe4d4' }}>
          <div className="text-xs font-bold mb-2 pb-2 flex items-center gap-2" style={{ color: '#c4925a', borderBottom: '1px solid #efe4d4' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#c4925a' }} />
            {L.clientInfo}
          </div>
          <div className="space-y-1">
            <div><span className="text-slate-400">{L.clientName}: </span><span className="font-bold text-slate-800">{tName || '—'}</span></div>
            {tAddr && <div><span className="text-slate-400">{L.address}: </span><span className="text-slate-700">{tAddr}</span></div>}
            {quote.customer_phone && <div><span className="text-slate-400">{L.contact}: </span><span className="text-slate-700" dir="ltr" style={{ textAlign: isAr ? 'right' : 'left' }}>{quote.customer_phone}</span></div>}
            <div><span className="text-slate-400">{L.subject}: </span><span className="text-slate-700 font-medium">{subjectLine}</span></div>
          </div>
        </div>

        {/* التحية */}
        <p className={`text-sm text-slate-600 leading-relaxed mb-4 ${alignClass}`}>{L.greeting}</p>

        {/* الشروط */}
        <div className="mb-4 text-sm rounded-lg p-3" style={{ background: '#fbfaf8', border: '1px solid #f0ebe3' }}>
          <div className="font-bold mb-1" style={{ color: '#7b4a2d' }}>{L.termsTitle}:</div>
          {L.terms.map((term, i) => <div key={i} className="text-slate-600 flex gap-1.5"><span style={{ color: '#c4925a' }}>{i + 1}.</span>{term}</div>)}
        </div>
        <p className={`text-sm text-slate-600 leading-relaxed mb-4 ${alignClass}`}>{L.estimateLine}</p>

        {/* جدول البنود بالشروحات — عنوان ملوّن + شرح أبيض للتمييز */}
        <table className="w-full text-sm mb-6 border-collapse" style={{ border: '1px solid #e5d9c8' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(90deg, #7b4a2d 0%, #9a6440 100%)' }}>
              <th className="text-center font-bold py-3 px-2 text-white w-10" style={{ border: '1px solid #6b3e26' }}>#</th>
              <th className={`font-bold py-3 px-4 text-white ${alignClass}`} style={{ border: '1px solid #6b3e26' }}>{L.description}</th>
            </tr>
          </thead>
          <tbody>
            {FIXED_ITEMS.map((it, i) => (
              <tr key={i} className="q-row">
                <td className="text-center font-bold align-middle" style={{ border: '1px solid #e5d9c8', background: '#faf6f1', color: '#7b4a2d' }}>{i + 1}</td>
                <td className="p-0" style={{ border: '1px solid #e5d9c8' }}>
                  {/* عنوان البند — بخلفية ملوّنة فاتحة */}
                  <div className={`font-bold py-2 px-4 ${alignClass}`} style={{ background: '#f3e9dc', color: '#5a3620' }}>
                    {isAr ? it.ar : it.en}
                  </div>
                  {/* شرح البند — بخلفية بيضاء (تمييز) */}
                  <div className={`text-xs text-slate-600 py-2 px-4 leading-relaxed ${alignClass}`} style={{ background: 'white' }}>
                    {isAr ? it.detailAr : it.detailEn}
                  </div>
                </td>
              </tr>
            ))}
            {optionalItems.map((it, i) => (
              <tr key={`o-${i}`} className="q-row">
                <td className="text-center font-bold align-middle" style={{ border: '1px solid #e5d9c8', background: '#faf6f1', color: '#7b4a2d' }}>{FIXED_ITEMS.length + i + 1}</td>
                <td className="p-0" style={{ border: '1px solid #e5d9c8' }}>
                  <div className={`font-bold py-2 px-4 ${alignClass}`} style={{ background: '#f3e9dc', color: '#5a3620' }}>
                    {isAr ? it.description : (it.description_en || it.description)}
                  </div>
                  {(isAr ? it.detail : it.detail_en) && (
                    <div className={`text-xs text-slate-600 py-2 px-4 leading-relaxed ${alignClass}`} style={{ background: 'white' }}>
                      {isAr ? it.detail : it.detail_en}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* السعر الإجمالي — مستطيل بارز، السعر واضح والـ BD بجانبه (يبقى متماسكاً) */}
        <div className="flex justify-center mb-5 q-keep">
          <div className="w-full max-w-md rounded-xl shadow-md overflow-hidden flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #7b4a2d 0%, #9a6440 100%)' }}>
            {/* عنوان Grand Total — يمين */}
            <div className="py-4 px-5 h-full flex items-center" style={{ background: 'rgba(0,0,0,0.15)' }}>
              <span className="text-white font-bold text-sm" style={{ letterSpacing: isAr ? 'normal' : '0.1em' }}>{L.grandTotal}</span>
            </div>
            {/* السعر + BD بجانبه */}
            <div className="flex-1 text-center py-4 px-5">
              <span className="text-white font-black" dir="ltr" style={{ fontSize: '34px' }}>{fmt(quote.total)}</span>
              <span className="text-white font-medium opacity-90 text-base mr-2" dir="ltr"> {L.bd}</span>
            </div>
          </div>
        </div>

        {/* لا تشمل — كرت أنيق (يتدفق طبيعياً عبر الصفحات دون ترك فراغ) */}
        <div className="rounded-xl p-4 mb-6 q-flow" style={{ background: '#fbfaf8', border: '1px solid #efe4d4' }}>
          <div className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: '#7b4a2d' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#c4925a' }} />
            {L.excludes}
          </div>
          <div className="text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {excluded.map((ex, i) => (
              <div key={i} className="flex gap-2 q-keep">
                <span className="shrink-0" style={{ color: '#c4925a' }}>{i + 1}.</span>
                <span>{ex}</span>
              </div>
            ))}
          </div>
        </div>

        {/* الصلاحية + التوقيع معاً (يبقيان في نفس الصفحة) */}
        <div className="q-keep">
          {/* الصلاحية — شارة أنيقة */}
          <div className="text-center mb-5">
            <span className="inline-block text-sm font-bold py-2 px-5 rounded-full" style={{ background: '#faf6f1', color: '#7b4a2d', border: '1px solid #efe4d4' }}>{L.validity}</span>
          </div>

          {/* خانة التوقيع */}
          <div>
            <div className="inline-block px-4 py-1.5 text-white text-sm font-bold mb-2" style={{ background: '#c4925a' }}>{L.acceptance}</div>
            <div className="grid grid-cols-3 border rounded-lg overflow-hidden" style={{ borderColor: '#e2d5c5' }}>
              <div className="px-3 py-4 text-center text-xs text-slate-500 bg-amber-50/50 border-l" style={{ borderColor: '#e2d5c5' }}>{L.signature}</div>
              <div className="px-3 py-4 text-center text-xs text-slate-500 bg-amber-50/50 border-l" style={{ borderColor: '#e2d5c5' }}>{L.pname}</div>
              <div className="px-3 py-4 text-center text-xs text-slate-500 bg-amber-50/50">{L.dateLabel}</div>
            </div>
          </div>
        </div>
        </div>{/* نهاية المحتوى فوق watermark */}
      </div>

      {/* ═══ صفحات خطوات العمل (بوست تنشن فقط — بنفس اللغة) ═══ */}
      {isPostTension && (
        <>
          <div dir={dir} className="bg-white rounded-xl border border-slate-200 p-8 mt-6 print:border-0 print:shadow-none quote-page page-break">
            <h2 className="text-xl font-bold text-center mb-5" style={{ color: '#7b4a2d' }}>{L.stepsTitle}</h2>
            {steps.slice(0, 6).map((step, i) => (
              <div key={i} className="mb-4 q-keep">
                <div className="font-bold text-sm mb-1" style={{ color: '#7b4a2d' }}>🔹 {L.step} {i + 1}: {step.t}</div>
                <ul className={`text-xs space-y-0.5 text-slate-700 ${isAr ? 'pr-5' : 'pl-5'}`} style={{ listStyleType: 'disc' }}>
                  {step.items.map((item, j) => <li key={j} style={{ listStylePosition: 'outside', marginInlineStart: '1rem' }}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>

          <div dir={dir} className="bg-white rounded-xl border border-slate-200 p-8 mt-6 print:border-0 print:shadow-none quote-page page-break">
            {steps.slice(6).map((step, i) => (
              <div key={i} className="mb-4 q-keep">
                <div className="font-bold text-sm mb-1" style={{ color: '#7b4a2d' }}>🔹 {L.step} {i + 7}: {step.t}</div>
                <ul className={`text-xs space-y-0.5 text-slate-700 ${isAr ? 'pr-5' : 'pl-5'}`} style={{ listStyleType: 'disc' }}>
                  {step.items.map((item, j) => <li key={j} style={{ listStylePosition: 'outside', marginInlineStart: '1rem' }}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>

          <div dir={dir} className="bg-white rounded-xl border border-slate-200 p-8 mt-6 print:border-0 print:shadow-none quote-page page-break">
            <h2 className="text-xl font-bold text-center mb-5" style={{ color: '#7b4a2d' }}>{L.notesTitle}</h2>
            <div className="space-y-2">
              {notes.map((note, i) => (
                <div key={i} className="flex gap-2 text-xs text-slate-700 q-keep">
                  <span style={{ color: '#16a34a' }} className="shrink-0">✓</span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
            <div className="text-center font-bold text-sm mt-6" style={{ color: '#7b4a2d' }}>"{L.closing}"</div>
          </div>
        </>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print, .print\\:hidden { display: none !important; }
          .page-break { page-break-before: always; }
          .quote-page { border: 0 !important; box-shadow: none !important; padding: 0 !important; }

          /* الجدول يتدفق طبيعياً بين الصفحات؛ كل صف يبقى متماسكاً */
          table { page-break-inside: auto; }
          thead { display: table-header-group; }
          .q-row { page-break-inside: avoid; }

          /* عناصر تبقى متماسكة (لا تنقسم): السعر، التوقيع، كل سطر، كل خطوة */
          .q-keep { page-break-inside: avoid; break-inside: avoid; }

          /* عناصر تتدفق بحرية عبر الصفحات دون ترك فراغ كبير */
          .q-flow { page-break-inside: auto; break-inside: auto; }

          /* منع الأسطر اليتيمة */
          p, div { orphans: 3; widows: 3; }
        }
      `}</style>
    </div>
  )
}
