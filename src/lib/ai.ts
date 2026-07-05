// ════════════════════════════════════════════════════════════════════
//  مساعد الذكاء الاصطناعي — قراءة وفهم المستندات والصور
//  يدعم: PDF، صور، مستندات ممسوحة ضوئياً (OCR)، خط اليد
//  أمان: النداء يمرّ عبر دالة Supabase الطرفية (anthropic-proxy) التي تحمل
//  المفتاح كسرّ خادم. المفتاح لا يصل المتصفّح ولا قاعدة البيانات إطلاقاً.
//  ضبط الخادم المطلوب: سرّ ANTHROPIC_API_KEY في Supabase Edge Functions.
// ════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// اسم الدالة الطرفية الوسيطة (النموذج وسقف التوكنات مفروضان داخلها)
const PROXY_FUNCTION = 'anthropic-proxy'

// ─── توفّر الخدمة ──────────────────────────────────────────────────────
// المفتاح صار على الخادم؛ لا يملك العميل وسيلة أكيدة لفحصه، فنفترض التوفّر
// ونترك الخطأ الحقيقي يظهر عند النداء إن لم يكن الخادم مهيأً.
// (مُبقاة لتوافق الصفحات التي تستدعيها كحارس قبل ميزات الذكاء.)
export function hasApiKey(): boolean {
  return true
}

// ─── تحويل الملفات ─────────────────────────────────────────────────────
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.onerror = () => reject(new Error('فشل قراءة الملف'))
    r.readAsDataURL(file)
  })
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('فشل قراءة الملف'))
    r.readAsDataURL(file)
  })
}

// ضغط الصور قبل التخزين لتقليل الحجم
export async function compressImage(file: File, maxDim = 1600, quality = 0.72): Promise<string> {
  if (!file.type.startsWith('image/')) return fileToDataUrl(file)
  const dataUrl = await fileToDataUrl(file)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height / width) * maxDim); width = maxDim }
        else { width = Math.round((width / height) * maxDim); height = maxDim }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUrl); return }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

// ─── أنواع المحتوى ─────────────────────────────────────────────────────
type ContentBlock =
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'text'; text: string }

interface ResponseBlock { type: string; text?: string }

export interface AIError extends Error { code?: string }

function makeError(message: string, code?: string): AIError {
  const e = new Error(message) as AIError
  e.code = code
  return e
}

// ─── مساعدات مشتركة للاتصال بالخدمة ────────────────────────────────────

// استخراج النص من كتل رد الخدمة
function extractText(data: unknown): string {
  const blocks = ((data as { content?: ResponseBlock[] } | null)?.content ?? [])
  return blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('').trim()
}

// شكل رد الدالة الطرفية الوسيطة
interface ProxyResponse {
  ok?: boolean
  data?: unknown        // رد Anthropic الخام عند النجاح
  message?: string      // رسالة الخطأ عند الفشل
  status?: string       // كود حالة Anthropic إن وُجد
}

// نقطة الاتصال الوحيدة بالخدمة — تمرّ عبر الدالة الطرفية وتتكفّل بالأخطاء واستخراج النص
async function callAnthropic(body: Record<string, unknown>): Promise<string> {
  let result: { data: ProxyResponse | null; error: unknown }
  try {
    result = await supabase.functions.invoke(PROXY_FUNCTION, { body }) as typeof result
  } catch {
    throw makeError('تعذّر الاتصال بخدمة الذكاء الاصطناعي. تحقق من الإنترنت.', 'NETWORK')
  }

  if (result.error) {
    // غالباً 401 (غير مصرّح/انتهت الجلسة) أو خطأ شبكة على مستوى الدالة
    throw makeError('تعذّر الوصول لخدمة الذكاء الاصطناعي. تأكد من تسجيل الدخول والاتصال.', 'INVOKE')
  }

  const payload = result.data
  if (!payload || !payload.ok) {
    let msg = payload?.message || 'حدث خطأ في خدمة الذكاء الاصطناعي'
    if (payload?.status === '429') msg = 'تم تجاوز حد الاستخدام. حاول بعد قليل.'
    else if (payload?.status === '401') msg = 'مفتاح الذكاء الاصطناعي على الخادم غير صحيح.'
    throw makeError(msg, payload?.status)
  }

  return extractText(payload.data)
}

// ─── قراءة مستند/صورة وإرجاع النص ──────────────────────────────────────
export async function readDocumentText(file: File, instruction: string): Promise<string> {
  const base64 = await fileToBase64(file)
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const mediaType = file.type || (isPdf ? 'application/pdf' : 'image/jpeg')

  const content: ContentBlock[] = [
    isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
    { type: 'text', text: instruction },
  ]

  return callAnthropic({ max_tokens: 1500, messages: [{ role: 'user', content }] })
}

// ─── محادثة نصية (للمساعد الذكي) ───────────────────────────────────────
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function askAI(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  return callAnthropic({
    max_tokens: 2000,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  })
}

// ─── استخراج JSON من نص الرد ───────────────────────────────────────────
export function extractJSON<T = Record<string, unknown>>(text: string): T | null {
  try {
    const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    return JSON.parse(clean.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

// ─── فتح/تنزيل ملف من data URL أو رابط ──────────────────────────────────
export function openStoredFile(fileUrl: string, fileType?: string): void {
  if (!fileUrl) return
  if (!fileUrl.startsWith('data:')) { window.open(fileUrl, '_blank'); return }
  try {
    const [head, b64] = fileUrl.split(',')
    const mime = head.match(/:(.*?);/)?.[1] || fileType || 'application/octet-stream'
    const bin = atob(b64)
    let n = bin.length
    const u8 = new Uint8Array(n)
    while (n--) u8[n] = bin.charCodeAt(n)
    const blob = new Blob([u8], { type: mime })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    window.open(fileUrl, '_blank')
  }
}