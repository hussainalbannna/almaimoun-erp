// supabase/functions/anthropic-proxy/index.ts
//
// ════════════════════════════════════════════════════════════════════
//  الوسيط الآمن لخدمة الذكاء الاصطناعي (Anthropic)
//
//  يستقبل طلبات التطبيق (قراءة الفواتير، المساعد الذكي…) ويمرّرها إلى
//  Anthropic حاملاً المفتاح السرّي المحفوظ على الخادم — فلا يُكشف المفتاح
//  للمتصفّح إطلاقاً. يتحقق أولاً من أنّ المُرسِل مستخدم مسجّل الدخول.
//
//  ضبط الخادم المطلوب (Supabase → Edge Functions → Secrets):
//    • ANTHROPIC_API_KEY  ← مفتاح Anthropic السرّي
//
//  العقد مع التطبيق (src/lib/ai.ts):
//    الطلب  : { max_tokens, messages, system? }  (بلا model — يُفرَض هنا)
//    الرد   : { ok: true, data }  عند النجاح
//             { ok: false, message, status? }  عند الفشل
// ════════════════════════════════════════════════════════════════════

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.1"

// ─── CORS ديناميكي ─────────────────────────────────────────────────────
// يعكس الترويسات التي يطلبها المتصفّح في الفحص المسبق (preflight) بدل قائمة
// ثابتة — فلا ينكسر الاتصال إذا أضاف عميل Supabase أو التطبيق ترويسة جديدة
// (هذا بالضبط ما عطّل الخدمة سابقاً بسبب ترويسة x-application-name).
function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      req.headers.get("Access-Control-Request-Headers") ??
      "authorization, x-client-info, apikey, content-type, x-application-name",
    "Access-Control-Max-Age": "86400",
  }
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  })

// النموذج مفروض على الخادم (لا يُقبل من العميل) — يمنع استهلاك الرصيد بنماذج أغلى
const MODEL = "claude-sonnet-4-6"
const MAX_TOKENS_CAP = 4000
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

/**
 * يتحقق من أنّ مُرسِل الطلب مستخدم مسجّل الدخول فعلاً (عبر توكن JWT في ترويسة Authorization).
 * يمنع أي طرف خارجي من استهلاك رصيد الذكاء الاصطناعي باسم المؤسسة.
 * يعمل تلقائياً عند الاستدعاء من التطبيق عبر supabase.functions.invoke (يُرفق التوكن ذاتياً).
 */
async function isAuthenticated(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return false
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data, error } = await supabase.auth.getUser()
  return !error && Boolean(data.user)
}

interface ProxyRequest {
  max_tokens?: number
  messages?: unknown
  system?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { ok: false, message: "Method not allowed" }, 405)

  try {
    if (!(await isAuthenticated(req))) {
      return json(req, { ok: false, message: "غير مصرّح — سجّل الدخول أولاً", status: "401" }, 401)
    }

    const body = (await req.json()) as ProxyRequest
    if (!body.messages) {
      return json(req, { ok: false, message: "الحقل messages مطلوب" }, 400)
    }

    // المفتاح يُقرأ حصرياً من أسرار الخادم — لا يُقبل من العميل إطلاقاً
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!apiKey) {
      return json(req, { ok: false, message: "مفتاح الذكاء الاصطناعي غير مضبوط على الخادم" }, 500)
    }

    // سقف التوكنات مضبوط على الخادم لحماية التكلفة مهما أرسل العميل
    const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 1500, 1), MAX_TOKENS_CAP)

    // تمرير الطلب إلى Anthropic بالمفتاح السرّي
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: body.messages,
        ...(body.system ? { system: body.system } : {}),
      }),
    })

    const data = await upstream.json()

    // خطأ من Anthropic (مفتاح خاطئ، تجاوز حد، طلب غير صالح…)
    if (!upstream.ok) {
      const message = (data?.error?.message as string) || "خطأ من خدمة الذكاء الاصطناعي"
      return json(req, { ok: false, message, status: String(upstream.status) }, 200)
    }

    // نجاح — نعيد رد Anthropic الخام داخل data (التطبيق يستخرج النص منه)
    return json(req, { ok: true, data }, 200)
  } catch (err) {
    return json(req, { ok: false, message: (err as Error)?.message ?? "خطأ غير متوقع" }, 200)
  }
})