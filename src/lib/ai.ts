// ════════════════════════════════════════════════════════════════════
//  مساعد الذكاء الاصطناعي — قراءة وفهم المستندات والصور
//  يدعم: PDF، صور، مستندات ممسوحة ضوئياً (OCR)، خط اليد
//  المفتاح يُحفظ في السحابة (قاعدة البيانات) ويعمل على كل الأجهزة
// ════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

const AI_MODEL = 'claude-sonnet-4-6'
const API_URL = 'https://api.anthropic.com/v1/messages'
const KEY_CACHE = 'anthropic_api_key' // نسخة محلية للسرعة فقط

// المصدر الرئيسي للمفتاح = قاعدة البيانات. هذا كاش في الذاكرة.
// null = لم نحدد بعد | '' = محدد ولا يوجد مفتاح | 'sk-...' = يوجد
let cachedKey: string | null = null

// ─── قراءة المفتاح ─────────────────────────────────────────────────────
function readLocalCache(): string {
  try { return localStorage.getItem(KEY_CACHE) ?? '' } catch { return '' }
}
function writeLocalCache(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_CACHE, key)
    else localStorage.removeItem(KEY_CACHE)
  } catch { /* ignore */ }
}

// تحميل المفتاح من قاعدة البيانات (السحابة)
export async function loadApiKey(): Promise<string> {
  try {
    const { data: rows } = await supabase
      .from('company_settings')
      .select('anthropic_api_key')
      .limit(1)
    const key = (rows && rows.length > 0)
      ? ((rows[0] as { anthropic_api_key?: string }).anthropic_api_key ?? '')
      : ''
    cachedKey = key
    writeLocalCache(key)
    return key
  } catch {
    return readLocalCache()
  }
}

// حفظ المفتاح في قاعدة البيانات (يعمل على كل الأجهزة)
export async function saveApiKey(key: string): Promise<boolean> {
  const trimmed = key.trim()
  cachedKey = trimmed
  writeLocalCache(trimmed)
  try {
    // جلب أول صف موجود (بدون single لتفادي الأخطاء)
    const { data: rows, error: selErr } = await supabase
      .from('company_settings')
      .select('id')
      .limit(1)
    if (selErr) { console.error('AI key select error:', selErr); return false }

    if (rows && rows.length > 0) {
      const rowId = (rows[0] as { id: string }).id
      const { error: updErr } = await supabase
        .from('company_settings')
        .update({ anthropic_api_key: trimmed, updated_at: new Date().toISOString() })
        .eq('id', rowId)
      if (updErr) { console.error('AI key update error:', updErr); return false }
      return true
    } else {
      const { error: insErr } = await supabase
        .from('company_settings')
        .insert({ anthropic_api_key: trimmed })
      if (insErr) { console.error('AI key insert error:', insErr); return false }
      return true
    }
  } catch (e) {
    console.error('AI key save exception:', e)
    return false
  }
}

// قراءة سريعة (متزامنة) من الكاش
export function getApiKey(): string {
  if (cachedKey !== null) return cachedKey
  return readLocalCache()
}

// هل يوجد مفتاح؟ (متفائلة عند عدم التحديد لتجنب الحظر الخاطئ على جهاز جديد)
export function hasApiKey(): boolean {
  if (cachedKey !== null) return cachedKey.length > 0
  // لم نحدد بعد: حمّل من السحابة في الخلفية واسمح بالمحاولة
  loadApiKey().catch(() => {})
  const local = readLocalCache()
  return local.length > 0 || cachedKey === null
}

// التأكد من وجود المفتاح قبل الاستخدام (يحمّل من السحابة إن لزم)
async function ensureApiKey(): Promise<string> {
  const current = getApiKey()
  if (current) return current
  return loadApiKey()
}

// تحميل المفتاح تلقائياً عند بدء التطبيق (في الخلفية)
loadApiKey().catch(() => {})

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

// ─── قراءة مستند/صورة وإرجاع النص ──────────────────────────────────────
export async function readDocumentText(file: File, instruction: string): Promise<string> {
  const key = await ensureApiKey()
  if (!key) throw makeError('لم يتم ضبط مفتاح الذكاء الاصطناعي. أضفه من صفحة الإعدادات.', 'NO_KEY')

  const base64 = await fileToBase64(file)
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const mediaType = file.type || (isPdf ? 'application/pdf' : 'image/jpeg')

  const content: ContentBlock[] = []
  if (isPdf) {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } })
  } else {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } })
  }
  content.push({ type: 'text', text: instruction })

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content }],
      }),
    })
  } catch {
    throw makeError('تعذّر الاتصال بخدمة الذكاء الاصطناعي. تحقق من الإنترنت.', 'NETWORK')
  }

  if (!response.ok) {
    let msg = `خطأ في الخدمة (${response.status})`
    if (response.status === 401) msg = 'مفتاح الذكاء الاصطناعي غير صحيح. تحقق منه في الإعدادات.'
    else if (response.status === 429) msg = 'تم تجاوز حد الاستخدام. حاول بعد قليل.'
    else if (response.status === 400) msg = 'الملف غير مدعوم أو حجمه كبير جداً.'
    try {
      const err = await response.json()
      if (err?.error?.message) msg = err.error.message
    } catch { /* ignore */ }
    throw makeError(msg, String(response.status))
  }

  const data = await response.json()
  const blocks = (data.content ?? []) as ResponseBlock[]
  return blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('').trim()
}

// ─── محادثة نصية (للمساعد الذكي) ───────────────────────────────────────
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function askAI(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const key = await ensureApiKey()
  if (!key) throw makeError('لم يتم ضبط مفتاح الذكاء الاصطناعي. أضفه من صفحة الإعدادات.', 'NO_KEY')

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 2000,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })
  } catch {
    throw makeError('تعذّر الاتصال بخدمة الذكاء الاصطناعي. تحقق من الإنترنت.', 'NETWORK')
  }

  if (!response.ok) {
    let msg = `خطأ في الخدمة (${response.status})`
    if (response.status === 401) msg = 'مفتاح الذكاء الاصطناعي غير صحيح. تحقق منه في الإعدادات.'
    else if (response.status === 429) msg = 'تم تجاوز حد الاستخدام. حاول بعد قليل.'
    try {
      const err = await response.json()
      if (err?.error?.message) msg = err.error.message
    } catch { /* ignore */ }
    throw makeError(msg, String(response.status))
  }

  const data = await response.json()
  const blocks = (data.content ?? []) as ResponseBlock[]
  return blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('').trim()
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