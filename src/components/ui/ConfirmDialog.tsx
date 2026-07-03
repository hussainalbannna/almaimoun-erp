import { useEffect, useId, useRef } from 'react'
import Button from './Button'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
  loading?: boolean
}

export default function ConfirmDialog({
  open,
  title = 'تأكيد',
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  onConfirm,
  onCancel,
  danger = false,
  loading = false,
}: ConfirmDialogProps) {
  const titleId = useId()
  const messageId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // نقل التركيز داخل الحوار عند فتحه وإعادته لمصدره عند الإغلاق
  // في الحوارات الخطرة نُركّز "إلغاء" حتى لا يؤكّد Enter عملية حذف عن طريق الخطأ
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusTarget = danger ? cancelRef.current : confirmRef.current
    focusTarget?.focus()
    return () => previouslyFocused?.focus?.()
  }, [open, danger])

  // إغلاق بمفتاح Escape (معطّل أثناء تنفيذ العملية)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={() => { if (!loading) onCancel() }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4"
      >
        <h3 id={titleId} className="text-base font-semibold text-slate-800">{title}</h3>
        <p id={messageId} className="text-sm text-slate-600">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
