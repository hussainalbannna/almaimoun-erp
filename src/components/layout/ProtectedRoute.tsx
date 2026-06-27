import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1c0f09 0%, #2a1510 100%)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-3 border-white/20 border-t-amber-400 rounded-full animate-spin" style={{ borderWidth: 3 }} />
          <p className="text-sm" style={{ color: '#c4925a' }}>جاري التحقق من الجلسة...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
