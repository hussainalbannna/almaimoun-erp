import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const LAST_EMAIL_KEY = 'almaimoun_last_email'

export default function LoginPage() {
  const { session, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  // استرجاع آخر بريد مستخدم
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_EMAIL_KEY)
      if (saved) setEmail(saved)
    } catch { /* ignore */ }
  }, [])

  // إذا كان مسجلاً، حوّله للوحة
  if (session) {
    return <Navigate to="/" replace />
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('بريد إلكتروني أو كلمة مرور غير صحيحة')
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('البريد الإلكتروني غير مؤكد — تواصل مع مدير النظام')
        } else {
          toast.error('فشل تسجيل الدخول: ' + error.message)
        }
        setLoading(false)
        return
      }

      if (data?.session) {
        try { localStorage.setItem(LAST_EMAIL_KEY, email) } catch { /* ignore */ }
        // AuthContext يلتقط الجلسة ويحوّل تلقائياً
      } else {
        toast.error('لم يتم الحصول على جلسة — تأكد من صحة البيانات')
        setLoading(false)
      }
    } catch {
      toast.error('خطأ في الاتصال — يرجى المحاولة مجدداً')
      setLoading(false)
    }
  }

  // إرسال رابط استعادة كلمة المرور
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      toast.error('أدخل بريدك الإلكتروني أولاً')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login',
      })
      if (error) {
        toast.error('تعذّر إرسال رابط الاستعادة: ' + error.message)
      } else {
        toast.success('تم إرسال رابط استعادة كلمة المرور إلى بريدك')
        setResetMode(false)
      }
    } catch {
      toast.error('خطأ في الاتصال — حاول مجدداً')
    } finally {
      setLoading(false)
    }
  }

  // شاشة التحميل أثناء التهيئة
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1c0f09 0%, #2a1510 100%)' }}>
        <div className="w-10 h-10 border-[3px] border-white/20 border-t-amber-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1c0f09 0%, #2a1510 50%, #3d1f0d 100%)' }}
    >
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* الترويسة */}
          <div className="px-8 pt-10 pb-8 text-center" style={{ background: 'linear-gradient(180deg, #1c0f09 0%, #2a1510 100%)' }}>
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg border-2 border-white/20">
                <img src="/Logo_Final-01.jpg" alt="Al Maimoun" className="w-full h-full object-cover" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">مؤسسة الميمون للمقاولات</h1>
            <p className="text-sm" style={{ color: '#c4925a' }}>ALMAIMOUN CONSTRUCTION · مملكة البحرين</p>
          </div>

          {/* النموذج */}
          <div className="px-8 py-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">{resetMode ? 'استعادة كلمة المرور' : 'تسجيل الدخول'}</h2>
              <p className="text-slate-500 text-sm mt-1">
                {resetMode ? 'سنرسل رابط الاستعادة إلى بريدك' : 'أدخل بياناتك للوصول إلى النظام'}
              </p>
            </div>

            <form onSubmit={resetMode ? handleReset : handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="example@almaimoun.com"
                  autoComplete="email"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                  dir="ltr"
                />
              </div>

              {!resetMode && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">كلمة المرور</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full px-4 py-3 pl-11 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title={showPassword ? 'إخفاء' : 'إظهار'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all mt-2 disabled:opacity-60"
                style={{ background: loading ? '#a07040' : 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {resetMode ? 'جاري الإرسال...' : 'جاري التحقق...'}
                  </span>
                ) : (resetMode ? 'إرسال رابط الاستعادة' : 'دخول إلى النظام')}
              </button>
            </form>

            {/* تبديل بين الدخول والاستعادة */}
            <div className="text-center mt-4">
              <button
                onClick={() => setResetMode(v => !v)}
                className="text-sm text-amber-700 hover:text-amber-800 hover:underline"
              >
                {resetMode ? '← العودة لتسجيل الدخول' : 'نسيت كلمة المرور؟'}
              </button>
            </div>

            <p className="text-center text-xs text-slate-400 mt-6">
              للحصول على بيانات الدخول، تواصل مع مدير النظام
            </p>
          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#c4925a80' }}>
          نظام إدارة المشاريع والمحاسبة © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
