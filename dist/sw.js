// ===================================================================
//  مؤسسة الميمون — Service Worker
//  استراتيجية ذكية: الشبكة أولاً للبيانات، الكاش أولاً للأصول الثابتة
// ===================================================================
const VERSION = 'almaimoun-v3'
const STATIC_CACHE = `${VERSION}-static`
const RUNTIME_CACHE = `${VERSION}-runtime`

// الأصول الأساسية التي تُخزّن فور التثبيت (يعمل التطبيق بدونها أوفلاين)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/Logo_Final-01.jpg',
]

// ───────────────────────────────────────────
// التثبيت — تخزين الأصول الأساسية
// ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

// ───────────────────────────────────────────
// التفعيل — حذف الإصدارات القديمة من الكاش
// ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !k.startsWith(VERSION))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ───────────────────────────────────────────
// مساعد: هل هذا أصل ثابت؟ (صور، خطوط، أيقونات)
// ───────────────────────────────────────────
function isStaticAsset(url) {
  return /\.(?:js|css|woff2?|ttf|otf|eot|png|jpe?g|svg|gif|webp|ico)$/i.test(url)
}

// ───────────────────────────────────────────
// اعتراض الطلبات — استراتيجية مزدوجة ذكية
// ───────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 1) تجاهل غير-GET
  if (request.method !== 'GET') return

  // 2) بيانات Supabase وأي API → الشبكة مباشرة دائماً (لا كاش أبداً)
  //    حتى لا تظهر بيانات قديمة في الحسابات والتقارير
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/storage/') ||
    url.pathname.startsWith('/functions/')
  ) {
    return // المتصفح يتولاها مباشرة من الشبكة
  }

  // 3) تجاهل النطاقات الخارجية (لا نتحكم بها)
  if (url.origin !== self.location.origin) return

  // 4) طلبات التنقّل (فتح صفحة) → الشبكة أولاً، وعند الانقطاع نعرض index.html
  //    ضروري لتطبيق SPA حتى تعمل كل المسارات الداخلية أوفلاين
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone()
          caches.open(RUNTIME_CACHE).then(c => c.put('/index.html', clone))
          return response
        })
        .catch(() =>
          caches.match('/index.html').then(r => r || caches.match('/'))
        )
    )
    return
  }

  // 5) الأصول الثابتة → الكاش أولاً (أسرع)، ثم تحديث في الخلفية
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(response => {
            if (response.ok) {
              const clone = response.clone()
              caches.open(STATIC_CACHE).then(c => c.put(request, clone))
            }
            return response
          })
          .catch(() => cached)
        return cached || networkFetch
      })
    )
    return
  }

  // 6) كل ما تبقّى → الشبكة أولاً مع الرجوع للكاش عند الانقطاع
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})

// ───────────────────────────────────────────
// استقبال أمر التحديث الفوري من التطبيق
// ───────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})