// ===================================================================
//  مؤسسة الميمون — Service Worker
//  استراتيجية ذكية: الشبكة أولاً للبيانات، الكاش أولاً للأصول الثابتة
// ===================================================================
const VERSION = 'almaimoun-v5'
const STATIC_CACHE = `${VERSION}-static`
const RUNTIME_CACHE = `${VERSION}-runtime`

// الأصول الأساسية التي تُخزّن فور التثبيت (يعمل التطبيق بدونها أوفلاين)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/Logo_Final-01.jpg',
]

// كتابة نسخة في الكاش وإرجاع الوعد (يُمرَّر إلى waitUntil لضمان اكتمال الكتابة)
function putInCache(cacheName, request, response) {
  return caches.open(cacheName).then(cache => cache.put(request, response))
}

// هل هذا أصل ثابت؟ (سكربتات، أنماط، خطوط، صور)
function isStaticAsset(pathname) {
  return /\.(?:js|css|woff2?|ttf|otf|eot|png|jpe?g|svg|gif|webp|ico)$/i.test(pathname)
}

// ───────────────────────────────────────────
// التثبيت — تخزين الأصول الأساسية
// كل ملف على حدة حتى لا يُفشل خطأٌ واحد (404 مثلاً) عملية التثبيت بالكامل
// ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  )
})

// ───────────────────────────────────────────
// التفعيل — حذف الإصدارات القديمة + تفعيل Navigation Preload + السيطرة على الصفحات
// ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // حذف أي كاش لا يخص الإصدار الحالي
      const keys = await caches.keys()
      await Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      )

      // تسريع التنقّل: السماح للمتصفح ببدء طلب الصفحة أثناء إقلاع الـ Service Worker
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }

      await self.clients.claim()
    })()
  )
})

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
    return
  }

  // 3) تجاهل النطاقات الخارجية (لا نتحكم بها)
  if (url.origin !== self.location.origin) return

  // 4) طلبات التنقّل (فتح صفحة) → الشبكة أولاً (مع Navigation Preload)،
  //    وعند الانقطاع نعرض index.html — ضروري لتطبيق SPA ليعمل كل مسار أوفلاين
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse
          const response = preloaded || (await fetch(request))
          if (response && response.ok) {
            event.waitUntil(putInCache(RUNTIME_CACHE, '/index.html', response.clone()))
          }
          return response
        } catch {
          const shell = (await caches.match('/index.html')) || (await caches.match('/'))
          return shell || Response.error()
        }
      })()
    )
    return
  }

  // 5) الأصول الثابتة → الكاش أولاً (أسرع)، مع تحديث في الخلفية (stale-while-revalidate)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        const networkFetch = fetch(request)
          .then(response => {
            if (response && response.ok) {
              return putInCache(STATIC_CACHE, request, response.clone()).then(() => response)
            }
            return response
          })
          .catch(() => cached)
        // إبقاء الـ SW حياً حتى يكتمل التحديث في الخلفية (يتجنّب إنهاءه قبل الكتابة)
        event.waitUntil(networkFetch.catch(() => {}))
        return cached || networkFetch
      })()
    )
    return
  }

  // 6) كل ما تبقّى → الشبكة أولاً مع الرجوع للكاش عند الانقطاع
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request)
        if (response && response.ok) {
          event.waitUntil(putInCache(RUNTIME_CACHE, request, response.clone()))
        }
        return response
      } catch {
        const cached = await caches.match(request)
        return cached || new Response('غير متصل بالشبكة', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    })()
  )
})

// ───────────────────────────────────────────
// استقبال أمر التحديث الفوري من التطبيق
// (يدعم النص 'SKIP_WAITING' أو الكائن { type: 'SKIP_WAITING' })
// ───────────────────────────────────────────
self.addEventListener('message', (event) => {
  const data = event.data
  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) {
    self.skipWaiting()
  }
})