import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { isOwner } from '../../lib/authz'

// ════════════════════════════════════════════════════════════════════
//  حارس مسارات "المالك فقط"
//
//  طبقة تكميلية للواجهة: تُحوِّل أي مستخدم غير المالك بعيداً عن الصفحة
//  (مثل سجل نشاط الموظفين). الحارس الفعلي للبيانات هو RLS في القاعدة —
//  حتى لو وصل غير المالك للمسار مباشرةً فلن تُرجِع القاعدة أي صف.
//  يجب أن يكون داخل <ProtectedRoute> فالجلسة مضمونة الوجود هنا.
// ════════════════════════════════════════════════════════════════════

export default function OwnerRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  if (!isOwner(user?.email)) {
    // ليس المالك — إعادة توجيه صامتة للوحة التحكم (لا نكشف وجود الصفحة)
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
