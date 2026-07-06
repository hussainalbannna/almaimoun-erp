import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { dataUrlToBlob, uploadAttachment } from '../../lib/storage'

/*
  ════════════════════════════════════════════════════════════════════
  صفحة نقل مؤقتة (أداة لمرّة واحدة) — الخطوة 6 من هجرة المرفقات
  تنقل بيانات base64 المخزّنة في أعمدة *_data إلى Supabase Storage،
  وتملأ أعمدة *_path، وتُفرّغ base64 من القاعدة.

  • تعمل بجلسة المستخدم الحالية (RLS: authenticated) — لا تحتاج CLI أو Edge Function.
  • تجلب دفعات صغيرة جداً لتفادي ضخامة الرد (سبب خطأ 500 سابقاً).
  • قابلة للاستئناف: أعِد التشغيل لإكمال ما تبقّى أو إعادة محاولة المتخطّى.
  • بعد اكتمالها احذف هذه الصفحة ومسارها (وننفّذ الخطوة 7: حذف أعمدة base64).
  ════════════════════════════════════════════════════════════════════
*/

// حجم الدفعة صغير عمداً: base64 ضخم، فنجلب القليل في كل دورة
const BATCH = 4
const MAX_ROUNDS = 5000 // حاجز أمان ضد أي حلقة لا تنتهي

// الأعمدة المطلوب نقلها (تصميم موجّه بالإعدادات — سهل التوسعة لجداول أخرى لاحقاً)
const MIGRATIONS: { table: string; dataCol: string; pathCol: string; folder: string }[] = [
  { table: 'purchase_invoices', dataCol: 'invoice_copy_data', pathCol: 'invoice_copy_path', folder: 'purchase-invoices' },
  { table: 'purchase_invoices', dataCol: 'payment_proof_data', pathCol: 'payment_proof_path', folder: 'purchase-invoices' },
  { table: 'purchase_invoices', dataCol: 'check_image_data', pathCol: 'check_image_path', folder: 'purchase-invoices' },
  { table: 'purchase_invoice_deliveries', dataCol: 'delivery_image_data', pathCol: 'delivery_image_path', folder: 'purchase-deliveries' },
]

type LogFn = (msg: string) => void

export default function MigrateAttachments() {
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [migrated, setMigrated] = useState(0)
  const [skipped, setSkipped] = useState(0)

  const addLog = (msg: string) =>
    setLogs(prev => [...prev.slice(-400), `${new Date().toLocaleTimeString('ar-BH')} — ${msg}`])

  // نقل عمود base64 واحد إلى Storage: يجلب دفعات، يرفع، يملأ المسار، يُفرّغ base64
  const migrateColumn = async (
    m: { table: string; dataCol: string; pathCol: string; folder: string },
    log: LogFn,
  ): Promise<number> => {
    const skip = new Set<string>() // صفوف تعذّر نقلها في هذه الجولة (لتفادي حلقة لا تنتهي)
    let count = 0

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data, error } = await supabase
        .from(m.table)
        .select(`id, ${m.dataCol}`)
        .like(m.dataCol, 'data:%')
        .limit(BATCH + skip.size)
      if (error) throw error

      const all = (data ?? []) as Array<Record<string, string>>
      if (all.length === 0) return count
      const rows = all.filter(r => !skip.has(r.id))
      if (rows.length === 0) return count // المتبقّي كله متخطّى → توقّف

      for (const row of rows) {
        const val = row[m.dataCol]
        try {
          if (!val || !val.startsWith('data:')) throw new Error('قيمة غير صالحة')
          const path = await uploadAttachment(dataUrlToBlob(val), m.folder)
          const { error: uErr } = await supabase.from(m.table).update({ [m.pathCol]: path, [m.dataCol]: '' }).eq('id', row.id)
          if (uErr) throw uErr
          count += 1
          setMigrated(x => x + 1)
        } catch (e) {
          skip.add(row.id)
          setSkipped(x => x + 1)
          log(`⚠️ تخطّي ${m.table}·${row.id.slice(0, 8)} (${m.dataCol}): ${(e as Error).message}`)
        }
      }
    }
    log(`⚠️ بلغ الحدّ الأقصى للجولات في ${m.dataCol} — أعد التشغيل للإكمال.`)
    return count
  }

  const run = async () => {
    setRunning(true)
    setFinished(false)
    setLogs([])
    setMigrated(0)
    setSkipped(0)
    addLog('بدء النقل...')
    try {
      for (const m of MIGRATIONS) {
        addLog(`— ${m.table} · ${m.dataCol.replace('_data', '')} —`)
        const n = await migrateColumn(m, addLog)
        addLog(`✅ نُقل ${n} ملف من ${m.dataCol}.`)
      }
      addLog('🎉 اكتمل النقل بالكامل.')
      setFinished(true)
    } catch (e) {
      addLog(`❌ توقّف النقل: ${(e as Error).message}. اضغط "ابدأ النقل" مرة أخرى للاستئناف.`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto" dir="rtl">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h1 className="text-xl font-bold text-slate-800 mb-1">نقل المرفقات إلى Storage</h1>
        <p className="text-sm text-slate-500 mb-4">أداة مؤقتة لمرّة واحدة — تنقل الصور والملفات القديمة من قاعدة البيانات إلى التخزين.</p>

        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 mb-5 leading-relaxed">
          تعمل على دفعات صغيرة وقابلة للاستئناف. لا تُغلق الصفحة أثناء التشغيل. بعد ظهور «اكتمل النقل»، احذف هذه الصفحة ومسارها من المشروع.
        </div>

        <div className="flex items-center gap-4 mb-5">
          <button
            onClick={run}
            disabled={running}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}
          >
            {running ? 'جارٍ النقل...' : 'ابدأ النقل'}
          </button>
          <div className="flex gap-4 text-sm">
            <span className="text-slate-600">تم نقل: <span className="font-bold text-green-600">{migrated}</span></span>
            {skipped > 0 && <span className="text-slate-600">متخطّى: <span className="font-bold text-red-500">{skipped}</span></span>}
          </div>
        </div>

        {finished && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 mb-4 font-medium">
            🎉 اكتمل النقل. تحقّق من عدم بقاء base64 ثم احذف هذه الصفحة.
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed p-3 h-72 overflow-y-auto" dir="ltr">
          {logs.length === 0
            ? <div className="text-slate-500">لا سجلّ بعد — اضغط «ابدأ النقل».</div>
            : logs.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)}
        </div>
      </div>
    </div>
  )
}
