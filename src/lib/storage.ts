// ════════════════════════════════════════════════════════════════════
//  طبقة التخزين الموحّدة — نظام الميمون ERP
//  المسؤول الوحيد عن التعامل مع Supabase Storage (bucket: attachments).
//  كل رفع/عرض/حذف للملفات يمرّ من هنا — مصدر واحد، سلوك متّسق في كل مكان.
//
//  فلسفة الانتقال: الملفات الجديدة تُخزَّن في Storage ونحفظ "المسار" فقط.
//  السجلّات القديمة ما زالت تحمل base64، لذا توجد دالة توافق خلفي
//  (resolveAttachmentUrl) تتعامل مع النوعين دون كسر.
// ════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

const BUCKET = 'attachments'
const SIGNED_URL_TTL = 60 * 60 // صلاحية رابط العرض: ساعة واحدة

// ─── أدوات داخلية ────────────────────────────────────────────────────

// اسم ملف فريد يمنع التصادم مع الحفاظ على الامتداد
const uniqueName = (ext: string): string => {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  const clean = ext.replace(/^\./, '')
  return clean ? `${id}.${clean}` : id
}

// استنتاج الامتداد من نوع MIME (احتياطي لاسم الملف)
const extFromMime = (mime: string): string => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  }
  return map[mime] ?? ''
}

// ─── تحويلات ─────────────────────────────────────────────────────────

// تحويل Data URL (base64) إلى Blob — يُستخدم للصور المضغوطة ولنقل البيانات القديمة
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ''] = dataUrl.split(',')
  const mime = header.match(/data:(.*?);/)?.[1] ?? 'application/octet-stream'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// هل القيمة المخزّنة سجلّ قديم بصيغة base64؟
export const isDataUrl = (value?: string | null): boolean => !!value && value.startsWith('data:')

// ─── العمليات ────────────────────────────────────────────────────────

/**
 * رفع ملف أو Blob (مثل صورة مضغوطة) إلى Storage داخل مجلد منطقي.
 * يُرجع "المسار" المخزَّن (وليس الرابط) — هو ما يُحفظ في قاعدة البيانات.
 * @param file   ملف من إدخال المستخدم أو Blob ناتج عن ضغط
 * @param folder مجلد منطقي مثل: 'purchase-invoices' أو 'documents'
 */
export async function uploadAttachment(file: File | Blob, folder: string): Promise<string> {
  const mime = file.type || 'application/octet-stream'
  const nameExt = file instanceof File ? file.name.split('.').pop() ?? '' : ''
  const ext = extFromMime(mime) || nameExt
  const path = `${folder}/${uniqueName(ext)}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
  return path
}

/**
 * رفع محتوى من Data URL (base64) مباشرة — مفيد للنماذج التي تضغط الصور
 * إلى Data URL قبل الرفع.
 */
export async function uploadDataUrl(dataUrl: string, folder: string): Promise<string> {
  return uploadAttachment(dataUrlToBlob(dataUrl), folder)
}

/**
 * إنشاء رابط موقّت موقّع لعرض/تنزيل ملف مخزَّن في Storage.
 * يُرجع null عند غياب المسار أو فشل التوليد.
 */
export async function getAttachmentUrl(path?: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data) return null
  return data.signedUrl
}

/**
 * توافق خلفي: يعيد رابطاً صالحاً للعرض سواء كانت القيمة مساراً في Storage
 * أو Data URL قديماً (base64). يبسّط صفحات العرض أثناء مرحلة الانتقال.
 */
export async function resolveAttachmentUrl(value?: string | null): Promise<string | null> {
  if (!value) return null
  if (isDataUrl(value)) return value // سجلّ قديم مخزّن كـ base64 — يُعرض مباشرة
  return getAttachmentUrl(value) // مسار Storage → رابط موقّع
}

/**
 * حذف ملف واحد أو عدة ملفات من Storage عبر مساراتها.
 * يتجاهل القيم الفارغة وسجلّات base64 القديمة (لا مسار لها).
 */
export async function deleteAttachment(paths: string | (string | null | undefined)[]): Promise<void> {
  const list = (Array.isArray(paths) ? paths : [paths])
    .filter((p): p is string => !!p && !isDataUrl(p))
  if (list.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove(list)
  if (error) throw error
}