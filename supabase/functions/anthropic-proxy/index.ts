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
//    الطلب  : { max_tokens, messages, system? }  (بلا model — يُحدَّد هنا)
//    الرد   : { ok: true, data }  عند النجاح
//             { ok: false, message, status? }  عند الفشل
// ════════════════════════════════════════════════════════════════════

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

// النموذج الافتراضي — سريع ومقتصد، مناسب لقراءة الفواتير والمحادثة
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022"
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
  model?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders })
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405)

  try {
    if (!(await isAuthenticated(req))) {
      return json({ ok: false, message: "غير مصرّح — سجّل الدخول أولاً", status: "401" }, 401)
    }

    const body = (await req.json()) as ProxyRequest
    if (!body.messages) {
      return json({ ok: false, message: "الحقل messages مطلوب" }, 400)
    }

    // المفتاح يُقرأ حصرياً من أسرار الخادم — لا يُقبل من العميل إطلاقاً
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!apiKey) {
      return json({ ok: false, message: "مفتاح الذكاء الاصطناعي غير مضبوط على الخادم" }, 500)
    }

    // تمرير الطلب إلى Anthropic بالمفتاح السرّي
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model || DEFAULT_MODEL,
        max_tokens: body.max_tokens ?? 1500,
        messages: body.messages,
        ...(body.system ? { system: body.system } : {}),
      }),
    })

    const data = await upstream.json()

    // خطأ من Anthropic (مفتاح خاطئ، تجاوز حد، طلب غير صالح…)
    if (!upstream.ok) {
      const message = (data?.error?.message as string) || "خطأ من خدمة الذكاء الاصطناعي"
      return json({ ok: false, message, status: String(upstream.status) }, 200)
    }

    // نجاح — نعيد رد Anthropic الخام داخل data (التطبيق يستخرج النص منه)
    return json({ ok: true, data }, 200)
  } catch (err) {
    return json({ ok: false, message: (err as Error)?.message ?? "خطأ غير متوقع" }, 200)
  }
})