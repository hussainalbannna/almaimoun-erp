import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../../contexts/AuthContext'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  // أثناء التحقق من الجلسة — شاشة تحميل موجزة بهوية العلامة
  if (loading) {
    return (
      <div
        role="status"
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #1c0f09 0%, #2a1510 100%)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 border-white/20 border-t-amber-400 rounded-full animate-spin"
            style={{ borderWidth: 3 }}
          />
          <p className="text-sm" style={{ color: '#c4925a' }}>جاري التحقق من الجلسة...</p>
        </div>
      </div>
    )
  }

  // غير مسجّل الدخول — التحويل لصفحة الدخول مع حفظ الوجهة الأصلية للعودة إليها بعد الدخول
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
