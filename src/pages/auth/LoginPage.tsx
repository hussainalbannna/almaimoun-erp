import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { session, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // If already logged in, redirect to dashboard
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

      if (!data?.session) {
        toast.error('لم يتم الحصول على جلسة — تأكد من صحة البيانات')
        setLoading(false)
      }
      // On success, AuthContext's onAuthStateChange picks up the session
      // and the Navigate above will redirect to "/"
    } catch {
      toast.error('خطأ في الاتصال — يرجى المحاولة مجدداً')
      setLoading(false)
    }
  }

  // Show nothing while auth is initializing
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
          {/* Header */}
          <div className="px-8 pt-10 pb-8 text-center" style={{ background: 'linear-gradient(180deg, #1c0f09 0%, #2a1510 100%)' }}>
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg border-2 border-white/20">
                <img src="/Logo_Final-01.jpg" alt="Al Maimoun" className="w-full h-full object-cover" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">مؤسسة الميمون للمقاولات</h1>
            <p className="text-sm" style={{ color: '#c4925a' }}>ALMAIMOUN CONSTRUCTION · مملكة البحرين</p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">تسجيل الدخول</h2>
              <p className="text-slate-500 text-sm mt-1">أدخل بياناتك للوصول إلى النظام</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
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

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">كلمة المرور</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                  dir="ltr"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all mt-2 disabled:opacity-60"
                style={{ background: loading ? '#a07040' : 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جاري التحقق...
                  </span>
                ) : 'دخول إلى النظام'}
              </button>
            </form>

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
