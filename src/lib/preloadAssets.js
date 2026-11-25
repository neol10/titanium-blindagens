/**
 * TITANIUM BLINDAGENS — Pré-carregamento Editorial & Cache Persistente (Cache API)
 * Carrega, salva em disco local (Cache Storage) e pré-decodifica na GPU os 275 frames
 * da animação de scroll, além do vídeo/poster do Hero, logo e fontes web.
 */

export const TOTAL_SCROLL_FRAMES = 275;
export const ASSET_CACHE_NAME = 'titanium-blindagens-cinematic-assets-v1';
export const ASSET_CACHE_FLAG_KEY = 'titanium_blindagens_assets_cached_v1';

const HERO_POSTER_URL = '/assets/images/hero-poster.webp';
const BRAND_LOGO_URL = '/assets/images/logo.png';
const HERO_VIDEO_DESKTOP_URL = '/assets/videos/hero.mp4';
const HERO_VIDEO_MOBILE_URL = '/assets/videos/hero-mobile.mp4';

/**
 * Cache em memória compartilhado entre o preloader e o Canvas 2D (#assembly-canvas).
 * Cada posição armazena o HTMLImageElement já decodificado na GPU.
 */
export const scrollFramesCache = new Array(TOTAL_SCROLL_FRAMES).fill(null);

/** Mapa de promessas em andamento para deduplicar carregamentos simultâneos do mesmo frame */
const inFlightFrames = new Map();

/** Referência compartilhada da cache aberta no Cache Storage */
let cacheStoragePromise = null;

/** Estado compartilhado do preload completo para evitar execuções duplicadas */
let preloadAllPromise = null;
const progressSubscribers = new Set();
let lastReportedProgress = 0;

/**
 * Retorna a URL oficial do frame (1-indexed: frame_0001.webp .. frame_0275.webp)
 */
export function getScrollFrameSrc(index) {
  const num = String(index + 1).padStart(4, '0');
  return `/assets/frames/frame_${num}.webp`;
}

/**
 * Verifica com segurança se o dispositivo já possui cache persistente aquecido
 */
export function hasPersistentAssetCache() {
  try {
    return window.localStorage.getItem(ASSET_CACHE_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

function markPersistentAssetCache() {
  try {
    window.localStorage.setItem(ASSET_CACHE_FLAG_KEY, 'true');
  } catch {
    // Modo privado / storage bloqueado — segue normalmente sem erro
  }
}

async function openAssetCache() {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return null;
  }
  if (!cacheStoragePromise) {
    cacheStoragePromise = window.caches.open(ASSET_CACHE_NAME).catch(() => null);
  }
  return cacheStoragePromise;
}

/**
 * Decodifica uma imagem a partir de um Blob via ObjectURL temporário e revoga a URL
 * imediatamente após o decode para evitar vazamento de memória RAM.
 */
function decodeImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode()
          .then(() => {
            cleanup();
            resolve(img);
          })
          .catch(() => {
            // Mesmo se decode rejeitar em algum browser específico, o onload garantiu a imagem pronta
            cleanup();
            resolve(img);
          });
      } else {
        cleanup();
        resolve(img);
      }
    };

    img.onerror = (err) => {
      cleanup();
      reject(err);
    };

    img.src = objectUrl;
  });
}

/**
 * Fallback direto via Image + decode quando Cache Storage não estiver disponível
 */
function loadImageDirect(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Carrega um frame específico utilizando:
 * 1) Cache em memória (scrollFramesCache)
 * 2) Cache API persistente em disco (window.caches)
 * 3) Rede com force-cache + gravação persistente em disco + decode na GPU
 */
export function loadScrollFrame(index) {
  if (index < 0 || index >= TOTAL_SCROLL_FRAMES) {
    return Promise.resolve(null);
  }

  if (scrollFramesCache[index]) {
    return Promise.resolve(scrollFramesCache[index]);
  }

  if (inFlightFrames.has(index)) {
    return inFlightFrames.get(index);
  }

  const url = getScrollFrameSrc(index);

  const task = (async () => {
    try {
      const cache = await openAssetCache();

      if (cache) {
        let response = await cache.match(url);

        if (!response) {
          const networkResponse = await fetch(url, { cache: 'force-cache' });
          if (networkResponse && networkResponse.ok) {
            try {
              await cache.put(url, networkResponse.clone());
            } catch {
              // Quota excedida ou restrição de disco — continua usando a resposta da rede
            }
            response = networkResponse;
          }
        }

        if (response && response.ok) {
          const blob = await response.blob();
          const img = await decodeImageFromBlob(blob);
          scrollFramesCache[index] = img;
          return img;
        }
      }

      const fallbackImg = await loadImageDirect(url);
      if (fallbackImg) {
        scrollFramesCache[index] = fallbackImg;
      }
      return fallbackImg;
    } catch {
      const fallbackImg = await loadImageDirect(url);
      if (fallbackImg) {
        scrollFramesCache[index] = fallbackImg;
      }
      return fallbackImg;
    } finally {
      inFlightFrames.delete(index);
    }
  })();

  inFlightFrames.set(index, task);
  return task;
}

/**
 * Pré-carrega imagem estática (poster / logo) salvando também no Cache Storage
 */
async function preloadStaticImage(url) {
  try {
    const cache = await openAssetCache();
    if (cache) {
      let response = await cache.match(url);
      if (!response) {
        const net = await fetch(url, { cache: 'force-cache' });
        if (net && net.ok) {
          try {
            await cache.put(url, net.clone());
          } catch {
            // Ignora falha de quota
          }
          response = net;
        }
      }
      if (response && response.ok) {
        const blob = await response.blob();
        await decodeImageFromBlob(blob);
        return;
      }
    }
    await loadImageDirect(url);
  } catch {
    // Nunca bloqueia o fluxo em caso de falha isolada
  }
}

/**
 * Aguarda o vídeo do Hero atingir estado pronto para reprodução (canplaythrough / loadeddata)
 * com timeout máximo de segurança de 7s.
 */
function preloadHeroVideo(timeoutMs = 7000) {
  return new Promise((resolve) => {
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    const videoUrl = isMobile ? HERO_VIDEO_MOBILE_URL : HERO_VIDEO_DESKTOP_URL;

    // Aquece o cache persistente do vídeo sem travar o evento de mídia
    openAssetCache().then(async (cache) => {
      if (!cache) return;
      try {
        const existing = await cache.match(videoUrl);
        if (!existing) {
          const net = await fetch(videoUrl, { cache: 'force-cache' });
          if (net && net.ok) {
            await cache.put(videoUrl, net.clone());
          }
        }
      } catch {
        // Ignora erro silenciosamente
      }
    });

    const heroVideo = typeof document !== 'undefined' ? document.getElementById('hero-bg-video') : null;
    if (!heroVideo) {
      resolve();
      return;
    }

    if (heroVideo.readyState >= 3) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      heroVideo.removeEventListener('canplaythrough', finish);
      heroVideo.removeEventListener('loadeddata', finish);
      heroVideo.removeEventListener('error', finish);
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);
    heroVideo.addEventListener('canplaythrough', finish, { once: true });
    heroVideo.addEventListener('loadeddata', finish, { once: true });
    heroVideo.addEventListener('error', finish, { once: true });
  });
}

/**
 * Aguarda o carregamento das fontes web com timeout de segurança de 3s.
 */
function preloadFonts(timeoutMs = 3000) {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.ready) {
    return Promise.resolve();
  }
  return Promise.race([
    document.fonts.ready.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

function notifyProgress(pct) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  if (clamped >= lastReportedProgress) {
    lastReportedProgress = clamped;
    progressSubscribers.forEach((cb) => {
      try {
        cb(clamped);
      } catch {
        // Proteção contra erro no callback
      }
    });
  }
}

/**
 * Executa o pré-carregamento completo de todos os ativos cinematográficos do site:
 * - Poster do Hero, logo/monograma, vídeo do Hero e fontes web em paralelo
 * - 275 frames WebP em lotes paralelos (12 na 1ª visita; 24 com cache aquecido)
 * - Reporta progresso real de 0% a 100%
 */
export function preloadAllSiteAssets(onProgress) {
  if (typeof onProgress === 'function') {
    progressSubscribers.add(onProgress);
    onProgress(lastReportedProgress);
  }

  if (preloadAllPromise) {
    return preloadAllPromise;
  }

  const warmCache = hasPersistentAssetCache();
  const batchSize = warmCache ? 24 : 12;

  // 4 tarefas auxiliares (poster, logo, vídeo, fontes) + 275 frames
  const AUX_UNITS = 4;
  const TOTAL_UNITS = TOTAL_SCROLL_FRAMES + AUX_UNITS;
  let completedUnits = 0;

  const bump = () => {
    completedUnits += 1;
    notifyProgress((completedUnits / TOTAL_UNITS) * 100);
  };

  preloadAllPromise = (async () => {
    // 1. Dispara ativos críticos em paralelo (poster, logo, vídeo do hero e fontes)
    const auxTasks = Promise.all([
      preloadStaticImage(HERO_POSTER_URL).finally(bump),
      preloadStaticImage(BRAND_LOGO_URL).finally(bump),
      preloadHeroVideo(7000).finally(bump),
      preloadFonts(3000).finally(bump)
    ]);

    // 2. Prioriza frame inicial e final antes dos lotes contínuos
    let loadedFramesCount = 0;
    const loadAndCount = async (idx) => {
      const img = await loadScrollFrame(idx);
      if (img) loadedFramesCount += 1;
      bump();
    };

    // Frame 0 primeiro para pintura instantânea do Canvas
    await loadAndCount(0);

    // Restante dos 274 frames em lotes paralelos controlados
    const remainingIndices = [];
    for (let i = 1; i < TOTAL_SCROLL_FRAMES; i++) {
      remainingIndices.push(i);
    }

    for (let offset = 0; offset < remainingIndices.length; offset += batchSize) {
      const slice = remainingIndices.slice(offset, offset + batchSize);
      await Promise.all(slice.map((idx) => loadAndCount(idx)));
    }

    await auxTasks;

    // Marca cache persistente se pelo menos 90% dos frames foram carregados com sucesso
    if (loadedFramesCount >= Math.floor(TOTAL_SCROLL_FRAMES * 0.9)) {
      markPersistentAssetCache();
    }

    notifyProgress(100);
  })();

  return preloadAllPromise;
}
