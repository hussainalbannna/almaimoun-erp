#!/usr/bin/env node
'use strict'

/* ════════════════════════════════════════════════════════════════════
   سكربت إنشاء هيكل الصفحات والمكوّنات الجديدة لنظام الميمون ERP.

   الاستخدام:
     node scaffold.cjs             إنشاء الملفات الناقصة فقط (السلوك الافتراضي الآمن)
     node scaffold.cjs --dry-run   عرض ما سيحدث دون كتابة أي شيء
     node scaffold.cjs --force     الكتابة فوق الملفات الموجودة (غير مُوصى به — احذر)
     node scaffold.cjs --help      عرض هذه المساعدة

   مبدأ الأمان: افتراضياً لا يحذف ولا يستبدل أي ملف موجود إطلاقاً؛ يتخطّى الموجود فقط.
   ملاحظة: هذه أداة تطوير لمرّة واحدة وليست جزءاً من التطبيق أو عملية البناء.
   ════════════════════════════════════════════════════════════════════ */

const fs = require('node:fs')
const path = require('node:path')

// ── قوالب التوليد ─────────────────────────────────────────────────────

// مكوّن صفحة "قيد التطوير" يستخدمه كل ستب صفحة
const PLACEHOLDER_COMPONENT = `import { Sparkles } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  subtitle?: string
}

export default function PlaceholderPage({ title, subtitle }: PlaceholderPageProps) {
  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
          <Sparkles size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{title}</h1>
        <p className="text-slate-500 leading-relaxed">{subtitle ?? 'قيد التطوير — سيتم تفعيل هذه الصفحة قريباً'}</p>
        <div className="mt-6 inline-block text-xs font-medium bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full">قريباً</div>
      </div>
    </div>
  )
}
`

// مولّد ستب صفحة يعتمد على المكوّن المشترك أعلاه
const pageStub = (name, title, subtitle) => `import PlaceholderPage from '../../components/ui/PlaceholderPage'

export default function ${name}() {
  return <PlaceholderPage title="${title}" subtitle="${subtitle}" />
}
`

// ستب مكوّن فارغ
const componentStub = (name) => `// ${name} — قيد التطوير، سيُملأ بالكود لاحقاً
export default function ${name}() {
  return null
}
`

// ستب مكتبة فارغة
const libStub = (note) => `// ${note} — قيد التطوير، سيُملأ بالكود لاحقاً
export {}
`

// ── بيان الملفات (عدّله حسب الوحدات التي تريد سقالتها؛ الموجود يُتخطّى تلقائياً) ──
const FILES = {
  // ── المكوّن المشترك للصفحات قيد التطوير ──
  'src/components/ui/PlaceholderPage.tsx': PLACEHOLDER_COMPONENT,

  // ── الصفحات الجديدة (ستب) ──
  'src/pages/assistant/AIAssistant.tsx': pageStub('AIAssistant', 'المساعد الذكي', 'اسأل عن مشاريعك وأرباحك وعمالك واطلب صياغة الرسائل'),
  'src/pages/quotations/QuotationList.tsx': pageStub('QuotationList', 'عروض الأسعار', 'أنشئ عروض أسعار للفلل وحوّلها إلى مشاريع'),
  'src/pages/quotations/QuotationForm.tsx': pageStub('QuotationForm', 'عرض سعر', 'إنشاء وتعديل عرض السعر'),
  'src/pages/quotations/QuotationView.tsx': pageStub('QuotationView', 'عرض السعر', 'استعراض وطباعة عرض السعر'),
  'src/pages/calendar/CalendarView.tsx': pageStub('CalendarView', 'التقويم', 'كل المواعيد والاستحقاقات في مكان واحد'),
  'src/pages/tasks/TasksBoard.tsx': pageStub('TasksBoard', 'المهام والتذكيرات', 'نظّم مهام الفريق والمتابعات'),
  'src/pages/inventory/InventoryList.tsx': pageStub('InventoryList', 'المخزون والمواد', 'تتبّع مواد المستودع والمخصّص لكل مشروع'),
  'src/pages/inventory/InventoryForm.tsx': pageStub('InventoryForm', 'إضافة مادة', 'إضافة وتعديل مواد المخزون'),
  'src/pages/punch-list/PunchListPage.tsx': pageStub('PunchListPage', 'قائمة الملاحظات', 'ملاحظات وعيوب ما قبل التسليم'),
  'src/pages/safety/SafetyPage.tsx': pageStub('SafetyPage', 'السلامة والحوادث', 'قوائم فحص السلامة وتقارير الحوادث'),
  'src/pages/attendance/AttendanceBoard.tsx': pageStub('AttendanceBoard', 'الحضور والانصراف', 'تتبّع حضور وانصراف العمال'),
  'src/pages/finance/FinanceDashboard.tsx': pageStub('FinanceDashboard', 'اللوحة المالية', 'الأرباح والتدفق النقدي وتحليل المصاريف'),
  'src/pages/notifications/NotificationsCenter.tsx': pageStub('NotificationsCenter', 'مركز الإشعارات', 'كل التنبيهات في مكان واحد'),

  // ── مكوّنات مشتركة جديدة (ستب) ──
  'src/components/ui/PageHeader.tsx': componentStub('PageHeader'),
  'src/components/ui/StatCard.tsx': componentStub('StatCard'),
  'src/components/ui/EmptyState.tsx': componentStub('EmptyState'),
  'src/components/ui/AIScanButton.tsx': componentStub('AIScanButton'),
  'src/components/ui/FileViewer.tsx': componentStub('FileViewer'),

  // ── مكتبات جديدة (ستب) ──
  'src/lib/notifications.ts': libStub('مركز التنبيهات: تجميع الاستحقاقات والوثائق المنتهية'),
  'src/lib/whatsapp.ts': libStub('قوالب رسائل واتساب: كشوف، تذكيرات، تحديثات'),
  'src/lib/pdf.ts': libStub('مولّد ملفات PDF: عروض الأسعار والتقارير'),
}

// ── واجهة سطر الأوامر ──────────────────────────────────────────────────

const HELP = `سكربت سقالة الميمون ERP

الاستخدام:
  node scaffold.cjs [خيارات]

الخيارات:
  -n, --dry-run   عرض ما سيُنشأ/يُستبدل دون كتابة أي شيء
  -f, --force     الكتابة فوق الملفات الموجودة (احذر — قد يفقد كودك)
  -h, --help      عرض هذه المساعدة
`

/** يحلّل أعلام سطر الأوامر إلى كائن. */
function parseArgs(argv) {
  const flags = { dryRun: false, force: false, help: false }
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') flags.dryRun = true
    else if (arg === '--force' || arg === '-f') flags.force = true
    else if (arg === '--help' || arg === '-h') flags.help = true
    else console.warn('⚠️  خيار غير معروف:', arg)
  }
  return flags
}

/** يتأكّد من تشغيل السكربت داخل جذر المشروع (وجود package.json) لتفادي إنشاء ملفات في مكان خاطئ. */
function assertProjectRoot() {
  if (!fs.existsSync(path.resolve(process.cwd(), 'package.json'))) {
    console.error('✗ لم يُعثر على package.json في المجلد الحالي. شغّل السكربت من جذر المشروع.')
    process.exit(1)
  }
}

/** ينفّذ السقالة وفق البيان والأعلام، ويعيد إحصائيات النتيجة. */
function scaffold(flags) {
  let created = 0
  let skipped = 0
  let failed = 0

  for (const [relPath, content] of Object.entries(FILES)) {
    const target = path.resolve(process.cwd(), relPath)
    try {
      const exists = fs.existsSync(target)

      // الأمان: لا نلمس الموجود إلا مع --force صراحةً
      if (exists && !flags.force) {
        console.log('⏭️  موجود (تخطّي):', relPath)
        skipped++
        continue
      }

      if (flags.dryRun) {
        console.log((exists ? '↻ سيُستبدل: ' : '✎ سيُنشأ:  ') + relPath)
        continue
      }

      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content, 'utf8')
      console.log((exists ? '♻️  استُبدل: ' : '✅ أُنشئ:   ') + relPath)
      created++
    } catch (err) {
      console.error('✗ فشل:', relPath, '—', err instanceof Error ? err.message : String(err))
      failed++
    }
  }

  return { created, skipped, failed }
}

/** نقطة الدخول. */
function main() {
  const flags = parseArgs(process.argv.slice(2))

  if (flags.help) {
    console.log(HELP)
    return
  }

  assertProjectRoot()

  if (flags.force && !flags.dryRun) {
    console.warn('⚠️  الوضع --force مفعّل: سيُكتب فوق الملفات الموجودة.\n')
  }

  const { created, skipped, failed } = scaffold(flags)

  console.log('\n──────────────────────────────')
  if (flags.dryRun) {
    console.log('وضع المعاينة (dry-run): لم تُكتب أي ملفات.')
  } else {
    console.log(`تم: ${created} ملف | تخطّي: ${skipped} موجود | فشل: ${failed}`)
    console.log('الآن استبدل محتوى App.tsx و Sidebar.tsx بالملفّين المرفقين.')
  }

  // رمز خروج غير صفري عند وجود أي فشل (مفيد في خطوط CI/الأتمتة)
  if (failed > 0) process.exit(1)
}

main()
