import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const LAST_EMAIL_KEY = 'almaimoun_last_email'

export default function LoginPage() {
  const { session, loading: authLoading } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  // وضع تعيين كلمة مرور جديدة — يُفعّل عند وصول المستخدم عبر رابط الاستعادة
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // استرجاع آخر بريد مستخدم
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_EMAIL_KEY)
      if (saved) setEmail(saved)
    } catch { /* ignore */ }
  }, [])

  // الاستماع لحدث استعادة كلمة المرور: عند فتح رابط البريد يُنشئ Supabase جلسة استعادة
  // ويُطلق الحدث PASSWORD_RECOVERY، فنعرض نموذج تعيين كلمة مرور جديدة بدل تحويل المستخدم.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  // إذا كان مسجلاً (وليس في وضع الاستعادة)، حوّله للوجهة الأصلية (أو اللوحة افتراضياً)
  if (session && !recoveryMode) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
    return <Navigate to={from} replace />
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      toast.error('يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password })

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
        try { localStorage.setItem(LAST_EMAIL_KEY, trimmedEmail) } catch { /* ignore */ }
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
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      toast.error('أدخل بريدك الإلكتروني أولاً')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
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

  // تعيين كلمة المرور الجديدة (بعد فتح رابط الاستعادة)
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب ألا تقل عن 6 أحرف')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        toast.error('تعذّر تحديث كلمة المرور: ' + error.message)
        setLoading(false)
        return
      }
      toast.success('تم تحديث كلمة المرور بنجاح')
      setRecoveryMode(false)
      // الجلسة صالحة الآن → إعادة التوجيه التلقائية إلى النظام
    } catch {
      toast.error('خطأ في الاتصال — حاول مجدداً')
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

  const onSubmit = recoveryMode ? handleUpdatePassword : resetMode ? handleReset : handleLogin
  const heading = recoveryMode ? 'تعيين كلمة مرور جديدة' : resetMode ? 'استعادة كلمة المرور' : 'تسجيل الدخول'
  const subheading = recoveryMode
    ? 'أدخل كلمة المرور الجديدة لحسابك'
    : resetMode ? 'سنرسل رابط الاستعادة إلى بريدك' : 'أدخل بياناتك للوصول إلى النظام'
  const submitLabel = recoveryMode ? 'تحديث كلمة المرور' : resetMode ? 'إرسال رابط الاستعادة' : 'دخول إلى النظام'
  const loadingLabel = recoveryMode ? 'جاري التحديث...' : resetMode ? 'جاري الإرسال...' : 'جاري التحقق...'

  const passwordInputClass =
    'w-full px-4 py-3 pl-11 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all'

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
              <h2 className="text-xl font-bold text-slate-800">{heading}</h2>
              <p className="text-slate-500 text-sm mt-1">{subheading}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {recoveryMode ? (
                <>
                  {/* كلمة المرور الجديدة */}
                  <div>
                    <label htmlFor="new-password" className="block text-sm font-semibold text-slate-700 mb-1.5">كلمة المرور الجديدة</label>
                    <div className="relative">
                      <input
                        id="new-password"
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className={passwordInputClass}
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
                  {/* تأكيد كلمة المرور */}
                  <div>
                    <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-700 mb-1.5">تأكيد كلمة المرور</label>
                    <input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                      dir="ltr"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="login-email" className="block text-sm font-semibold text-slate-700 mb-1.5">البريد الإلكتروني</label>
                    <input
                      id="login-email"
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
                      <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700 mb-1.5">كلمة المرور</label>
                      <div className="relative">
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          className={passwordInputClass}
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
                </>
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
                    {loadingLabel}
                  </span>
                ) : submitLabel}
              </button>
            </form>

            {/* تبديل بين الدخول والاستعادة (يُخفى في وضع تعيين كلمة المرور) */}
            {!recoveryMode && (
              <div className="text-center mt-4">
                <button
                  onClick={() => setResetMode(v => !v)}
                  className="text-sm text-amber-700 hover:text-amber-800 hover:underline"
                >
                  {resetMode ? '← العودة لتسجيل الدخول' : 'نسيت كلمة المرور؟'}
                </button>
              </div>
            )}

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
