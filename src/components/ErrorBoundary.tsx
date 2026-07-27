import { Component, type ErrorInfo, type ReactNode } from 'react'

function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string }
  const msg = e?.message ?? ''
  return e?.name === 'ChunkLoadError' ||
    /Loading chunk|dynamically imported module|Failed to fetch dynamically/i.test(msg)
}

interface Props { children: ReactNode }
interface State { hasError: boolean; isChunk: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunk: false }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, isChunk: isChunkLoadError(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
    if (isChunkLoadError(error) && !sessionStorage.getItem('__chunk_reloaded')) {
      sessionStorage.setItem('__chunk_reloaded', '1')
      window.location.reload()
    }
  }

  private reload = () => {
    sessionStorage.removeItem('__chunk_reloaded')
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto text-2xl">⚠️</div>
          <h1 className="text-lg font-bold text-slate-800">
            {this.state.isChunk ? 'يوجد تحديث جديد للنظام' : 'حدث خطأ غير متوقّع'}
          </h1>
          <p className="text-sm text-slate-500">
            {this.state.isChunk
              ? 'صدر إصدار جديد من النظام. أعِد التحميل لمتابعة العمل.'
              : 'عذرًا، حدث خلل أثناء عرض هذه الصفحة. أعِد التحميل، وإن تكرّر فأبلغنا.'}
          </p>
          <button
            onClick={this.reload}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-medium"
            style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}
          >
            إعادة التحميل
          </button>
        </div>
      </div>
    )
  }
}
