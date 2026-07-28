import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // نستمع لتغيّرات الجلسة أولاً حتى لا نفوّت أي حدث بين الجلب والاشتراك
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      setLoading(false)
    })

    // ثم نجلب الجلسة الحالية
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        setSession(null)
        setLoading(false)
      })

    // شبكة الموقع قد تكون بطيئة وتحديث التوكن يستغرق ثوانٍ — نعتمد أحداث المصادقة (INITIAL_SESSION من
    // onAuthStateChange و getSession أعلاه) لإنهاء التحميل، ونُبقي هذا المؤقّت أمانًا أخيرًا فقط
    // كي لا يُنهي التحميل قبل اكتمال الجلسة فيطرد مستخدمًا صالحًا إلى صفحة الدخول على شبكة ضعيفة.
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 10000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
  }, [])

  // قيمة السياق مُخزّنة — لا تُنشأ من جديد إلا عند تغيّر الجلسة أو حالة التحميل،
  // فلا تُعاد رسم جميع المكوّنات المستهلِكة بلا داعٍ
  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, loading, signOut }),
    [session, loading, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth يجب أن يُستخدم داخل <AuthProvider>')
  }
  return context
}
