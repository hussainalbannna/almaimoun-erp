import { useId, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useEffect } from 'react'
import { X } from 'lucide-react'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

interface UseModalBehaviorOptions {
  onClose?: () => void
  closeOnEscape?: boolean
  focusRef?: RefObject<HTMLElement>
}

/**
 * Hook مشترك لسلوك النوافذ المنبثقة:
 *  - نقل التركيز إلى النافذة عند فتحها وإعادته لمصدره عند الإغلاق
 *  - الإغلاق بمفتاح Escape (قابل للتعطيل)
 *  - منع تمرير الخلفية أثناء الفتح (مع دعم التداخل باستعادة القيمة السابقة)
 * يستخدمه كل من Modal و ConfirmDialog لتفادي تكرار المنطق نفسه.
 */
export function useModalBehavior(
  open: boolean,
  { onClose, closeOnEscape = true, focusRef }: UseModalBehaviorOptions,
): void {
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    focusRef?.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [open, focusRef])

  useEffect(() => {
    if (!open || !closeOnEscape || !onClose) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeOnEscape, onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: ModalSize
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useModalBehavior(open, { onClose, closeOnEscape, focusRef: dialogRef })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={() => { if (closeOnBackdrop) onClose() }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative bg-white rounded-xl shadow-2xl w-full ${SIZE_CLASSES[size]} max-h-[90vh] flex flex-col outline-none`}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-800">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}
