// ════════════════════════════════════════════════════════════════════
//  ترحيل الصور/المستندات من base64 (داخل الأعمدة) إلى Supabase Storage
//  نظام الميمون ERP — سكربت آمن، متدرّج، Idempotent، بلا فقدان بيانات.
//
//  الفلسفة:
//   - يرفع كل قيمة base64 (تبدأ بـ data:) إلى bucket «attachments» ضمن مجلد منطقي.
//   - يتحقق من نجاح الرفع (بإنشاء رابط موقّع للملف المرفوع) قبل لمس القاعدة.
//   - لا يحذف base64 إلا بعد نجاح الرفع والتحقق.
//   - القيم التي هي مسار مسبقاً (لا تبدأ بـ data:) تُتخطّى → إعادة التشغيل آمنة.
//   - يعالج جدولاً واحداً لكل تشغيل عبر --table، على دفعات صغيرة.
//
//  الاستخدام:
//   node migrate-base64.mjs --table=daily_logs --dry-run     (عرض فقط، بلا تعديل)
//   node migrate-base64.mjs --table=daily_logs               (ترحيل فعلي)
//   node migrate-base64.mjs --list                           (أسماء الجداول المدعومة)
//   خيارات: --batch=N (حجم الدفعة، الافتراضي 25)
//
//  المتطلبات: ملف .env فيه SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY.
//  ⚠️ المفتاح لا يُكتب في الكود إطلاقاً — يُقرأ من .env فقط.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'attachments'

// ─── قراءة .env يدوياً (بلا أي تبعية) ────────────────────────────────
function loadEnv() {
  let text = ''
  try {
    text = readFileSync(new URL('./.env', import.meta.url), 'utf8')
  } catch {
    fail('لم يُعثر على ملف .env في جذر المشروع. أنشئه وضع فيه SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY.')
  }
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    // إزالة علامات الاقتباس المحيطة إن وُجدت
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    env[key] = val
  }
  return env
}

// ─── إعدادات الجداول (مبنية على المخطط الحيّ الفعلي للقاعدة) ──────────
//  أنواع الأعمدة:
//   text-inplace   : عمود نصّي واحد يحمل base64 أو مساراً — نستبدل base64 بالمسار في نفس العمود.
//   text-sibling   : عمود *_data (base64) → نكتب المسار في عمود *_path منفصل، ونُفرّغ *_data، ونرفع علم has_*.
//   array-pg       : عمود مصفوفة نصية PG (text[]) — نستبدل كل عنصر base64 بمساره.
//   array-jsonb    : عمود jsonb يحمل مصفوفة نصوص — نفس المعالجة، ويُكتب كـ JSON.
//   array-jsontext : عمود نصّي *_data يحمل «سلسلة JSON» لمصفوفة صور base64 → نكتب مصفوفة المسارات (JSON نصّي)
//                    في عمود *_path، ونُفرّغ *_data، ونرفع علم has_*.
const TABLE_CONFIG = {
  daily_logs: {
    folder: 'daily-logs',
    targets: [{ type: 'array-pg', col: 'photos' }],
  },
  documents: {
    folder: 'documents',
    targets: [{ type: 'text-inplace', col: 'file_url' }],
  },
  cheques: {
    folder: 'cheques',
    targets: [{ type: 'text-inplace', col: 'cheque_image_data' }],
  },
  variation_orders: {
    folder: 'variation-orders',
    targets: [
      { type: 'array-jsonb', col: 'photos_before' },
      { type: 'array-jsonb', col: 'photos_after' },
    ],
  },
  worker_documents: {
    folder: 'worker-documents',
    targets: [{ type: 'text-inplace', col: 'file_data' }],
  },
  subcontractor_assignments: {
    folder: 'subcontractors',
    targets: [
      { type: 'text-sibling', dataCol: 'contract_data', pathCol: 'contract_path', flag: 'has_contract' },
      { type: 'array-jsontext', dataCol: 'work_images', pathCol: 'work_images_paths', flag: 'has_work_images' },
    ],
  },
  subcontractor_payments: {
    folder: 'subcontractors',
    targets: [
      { type: 'text-sibling', dataCol: 'payment_proof_data', pathCol: 'payment_proof_path', flag: 'has_payment_proof' },
      { type: 'text-sibling', dataCol: 'invoice_copy_data', pathCol: 'invoice_copy_path', flag: 'has_invoice_copy' },
    ],
  },
  rentals: {
    folder: 'rentals',
    targets: [{ type: 'text-sibling', dataCol: 'contract_data', pathCol: 'contract_path', flag: 'has_contract' }],
  },
  rental_payments: {
    folder: 'rentals',
    targets: [{ type: 'text-sibling', dataCol: 'proof_data', pathCol: 'proof_path', flag: 'has_proof' }],
  },
  // مُرحّلة بالكامل مسبقاً — لا تحتوي أي عمود base64 (فقط *_path + أعلام has_*).
  purchase_invoices: { migratedAlready: true },
  purchase_invoice_deliveries: { migratedAlready: true },
}

// ─── أدوات مساعدة ────────────────────────────────────────────────────
const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:')

function fail(msg) {
  console.error('\n❌ ' + msg + '\n')
  process.exit(1)
}

// تحويل Data URL إلى Buffer + استنتاج نوع MIME
function dataUrlToBuffer(dataUrl) {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, comma)
  const b64 = dataUrl.slice(comma + 1)
  const mime = (header.match(/data:(.*?)(;|$)/) || [])[1] || 'application/octet-stream'
  return { buffer: Buffer.from(b64, 'base64'), mime }
}

const extFromMime = (mime) => ({
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'application/pdf': 'pdf',
}[mime] || 'bin')

const uniqueName = (ext) => `${crypto.randomUUID()}.${ext}`

// أعمدة القراءة اللازمة لجدول (المعرّف + كل أعمدة المصدر)
function selectColumnsFor(cfg) {
  const cols = new Set(['id'])
  for (const t of cfg.targets) {
    if (t.col) cols.add(t.col)
    if (t.dataCol) cols.add(t.dataCol)
  }
  return [...cols].join(', ')
}

// ─── الرفع + التحقق ──────────────────────────────────────────────────
async function uploadDataUrl(supabase, dataUrl, folder) {
  const { buffer, mime } = dataUrlToBuffer(dataUrl)
  const path = `${folder}/${uniqueName(extFromMime(mime))}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw new Error('فشل الرفع: ' + error.message)
  // تحقّق من وجود الملف فعلاً قبل اعتماد المسار (رابط موقّع قصير الأجل)
  const { error: vErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (vErr) throw new Error('فشل التحقق بعد الرفع: ' + vErr.message)
  return path
}

// تحليل قيمة نصّية قد تكون «سلسلة JSON» لمصفوفة، أو Data URL مفرد، أو فارغة
function parseJsonArray(value) {
  if (!value || typeof value !== 'string') return []
  const s = value.trim()
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s)
      return Array.isArray(arr) ? arr : []
    } catch { return [] }
  }
  return isDataUrl(s) ? [s] : [s] // قيمة مفردة (مسار أو data:)
}

// ─── التشغيل التجريبي (dry-run): إحصاء بلا أي تعديل ───────────────────
async function dryRunTable(supabase, name, cfg, batch) {
  if (cfg.migratedAlready) {
    console.log(`\n📋 ${name}: مُرحّل بالكامل مسبقاً — لا أعمدة base64 (فقط *_path + أعلام). لا شيء للترحيل.`)
    return
  }
  console.log(`\n📋 ${name} — تحليل (dry-run):`)
  const select = selectColumnsFor(cfg)
  // إحصاءات لكل هدف: صفوف تحمل base64، عدد عناصر base64، مجموع الأحرف (≈ حجم القاعدة)
  const stats = {}
  for (const t of cfg.targets) stats[t.col || t.dataCol] = { rows: 0, items: 0, chars: 0 }

  let from = 0, scanned = 0
  for (;;) {
    const { data, error } = await supabase.from(name).select(select).range(from, from + batch - 1)
    if (error) { console.error(`   ⚠️  خطأ في القراءة: ${error.message}`); return }
    if (!data || data.length === 0) break
    scanned += data.length

    for (const row of data) {
      for (const t of cfg.targets) {
        const key = t.col || t.dataCol
        const st = stats[key]
        if (t.type === 'text-inplace' || t.type === 'text-sibling') {
          const v = row[t.col || t.dataCol]
          if (isDataUrl(v)) { st.rows++; st.items++; st.chars += v.length }
        } else if (t.type === 'array-pg' || t.type === 'array-jsonb') {
          const arr = Array.isArray(row[t.col]) ? row[t.col] : []
          let any = false
          for (const el of arr) if (isDataUrl(el)) { any = true; st.items++; st.chars += el.length }
          if (any) st.rows++
        } else if (t.type === 'array-jsontext') {
          const arr = parseJsonArray(row[t.dataCol])
          let any = false
          for (const el of arr) if (isDataUrl(el)) { any = true; st.items++; st.chars += el.length }
          if (any) st.rows++
        }
      }
    }
    if (data.length < batch) break
    from += batch
  }

  console.log(`   صفوف مفحوصة: ${scanned}`)
  let totalItems = 0, totalChars = 0
  for (const t of cfg.targets) {
    const key = t.col || t.dataCol
    const st = stats[key]
    totalItems += st.items; totalChars += st.chars
    const mb = (st.chars / (1024 * 1024)).toFixed(2)
    console.log(`   • العمود «${key}» [${t.type}]: ${st.rows} صف يحمل base64، ${st.items} عنصر، ≈ ${mb} MB`)
  }
  console.log(`   الإجمالي: ${totalItems} عنصر base64، ≈ ${(totalChars / (1024 * 1024)).toFixed(2)} MB لهذا الجدول.`)
}

// ─── الترحيل الفعلي ──────────────────────────────────────────────────
async function migrateTable(supabase, name, cfg, batch) {
  if (cfg.migratedAlready) {
    console.log(`\n📋 ${name}: مُرحّل بالكامل مسبقاً — لا شيء للترحيل.`)
    return
  }
  console.log(`\n🚚 ${name} — ترحيل فعلي (دفعات بحجم ${batch})...`)
  const select = selectColumnsFor(cfg)
  const counters = { migrated: 0, skipped: 0, errors: 0, rowsUpdated: 0 }

  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(name).select(select).range(from, from + batch - 1)
    if (error) fail(`خطأ في قراءة ${name}: ${error.message}`)
    if (!data || data.length === 0) break

    for (const row of data) {
      const update = {}
      for (const t of cfg.targets) {
        try {
          if (t.type === 'text-inplace') {
            const v = row[t.col]
            if (!isDataUrl(v)) { if (v) counters.skipped++; continue }
            const path = await uploadDataUrl(supabase, v, cfg.folder)
            update[t.col] = path
            counters.migrated++
          } else if (t.type === 'text-sibling') {
            const v = row[t.dataCol]
            if (!isDataUrl(v)) { if (v) counters.skipped++; continue }
            const path = await uploadDataUrl(supabase, v, cfg.folder)
            update[t.pathCol] = path
            update[t.dataCol] = ''
            if (t.flag) update[t.flag] = true
            counters.migrated++
          } else if (t.type === 'array-pg' || t.type === 'array-jsonb') {
            const arr = Array.isArray(row[t.col]) ? row[t.col] : []
            let changed = false
            const out = []
            for (const el of arr) {
              if (isDataUrl(el)) {
                out.push(await uploadDataUrl(supabase, el, cfg.folder))
                counters.migrated++; changed = true
              } else { out.push(el); if (el) counters.skipped++ }
            }
            if (changed) update[t.col] = out
          } else if (t.type === 'array-jsontext') {
            const arr = parseJsonArray(row[t.dataCol])
            if (arr.length === 0) continue
            let changed = false
            const out = []
            for (const el of arr) {
              if (isDataUrl(el)) {
                out.push(await uploadDataUrl(supabase, el, cfg.folder))
                counters.migrated++; changed = true
              } else { out.push(el); if (el) counters.skipped++ }
            }
            if (changed) {
              update[t.pathCol] = JSON.stringify(out)
              update[t.dataCol] = ''
              if (t.flag) update[t.flag] = true
            }
          }
        } catch (e) {
          counters.errors++
          console.error(`   ⚠️  صف ${row.id} / ${t.col || t.dataCol}: ${e.message} — أُبقي base64 كما هو.`)
        }
      }

      if (Object.keys(update).length > 0) {
        const { error: upErr } = await supabase.from(name).update(update).eq('id', row.id)
        if (upErr) {
          counters.errors++
          console.error(`   ⚠️  فشل تحديث الصف ${row.id}: ${upErr.message} (الملفات رُفعت لكن العمود لم يُحدَّث).`)
        } else {
          counters.rowsUpdated++
        }
      }
    }

    console.log(`   ...عولجت الدفعة حتى الصف ${from + data.length}`)
    if (data.length < batch) break
    from += batch
  }

  console.log(`\n✅ انتهى ${name}: رُحّل ${counters.migrated} ملف · تُخطّي ${counters.skipped} · أخطاء ${counters.errors} · صفوف حُدّثت ${counters.rowsUpdated}`)
}

// ─── نقطة الدخول ─────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const has = (f) => args.includes(f)
  const getVal = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`))
    return a ? a.split('=')[1] : undefined
  }

  if (has('--list')) {
    console.log('\nالجداول المدعومة:\n' + Object.keys(TABLE_CONFIG).map((t) => '  - ' + t).join('\n') + '\n')
    return
  }

  const table = getVal('table')
  const dryRun = has('--dry-run')
  const batch = Math.max(1, parseInt(getVal('batch') || '25', 10))

  if (!table) fail('حدّد الجدول عبر --table=NAME (أو --list لعرض الجداول). مثال: --table=daily_logs --dry-run')
  const cfg = TABLE_CONFIG[table]
  if (!cfg) fail(`جدول غير مدعوم: ${table}. استخدم --list لعرض الجداول المتاحة.`)

  const env = loadEnv()
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('.env يجب أن يحتوي SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY.')

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log(`\n🔗 المشروع: ${url}`)
  console.log(`📦 الوجهة: bucket «${BUCKET}» / مجلد «${cfg.folder ?? '-'}»`)
  console.log(`🧭 الوضع: ${dryRun ? 'DRY-RUN (عرض فقط، بلا أي تعديل)' : 'ترحيل فعلي'} · الجدول: ${table} · حجم الدفعة: ${batch}`)

  if (dryRun) await dryRunTable(supabase, table, cfg, batch)
  else await migrateTable(supabase, table, cfg, batch)
}

main().catch((e) => fail('خطأ غير متوقع: ' + (e?.stack || e?.message || e)))
