/**
 * TITANIUM BLINDAGENS — Preloader Editorial Cinematográfico
 * - 1ª visita: overlay fullscreen com identidade da marca, trava scroll até 100%,
 *   fade-out suave (700ms) e timeout de segurança máximo (25s).
 * - 2ª visita / F5 (hasPersistentAssetCache === true): libera instantaneamente sem exibir
 *   overlay nem travar scroll, hidratando os frames do Cache Storage em segundo plano.
 * - prefers-reduced-motion: reduce: libera imediatamente sem exibir preloader.
 */

import { hasPersistentAssetCache, preloadAllSiteAssets } from '../lib/preloadAssets.js';

const SAFETY_TIMEOUT_MS = 25000;
const FADE_DURATION_MS = 700;

function lockScroll() {
  document.documentElement.classList.add('preloader-active');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  document.documentElement.classList.remove('preloader-active');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

export function initSitePreloader() {
  const overlay = document.getElementById('site-preloader');
  const progressBar = document.getElementById('preloader-bar-fill');
  const progressText = document.getElementById('preloader-percent');

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isWarmVisit = hasPersistentAssetCache();

  // 2ª visita / F5 ou usuário com movimento reduzido:
  // libera a página imediatamente e hidrata os frames direto do disco em segundo plano.
  if (isWarmVisit || prefersReducedMotion || !overlay) {
    unlockScroll();
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';
    }
    preloadAllSiteAssets();
    return;
  }

  // 1ª visita limpa: exibe o preloader editorial e trava o scroll até 100%
  lockScroll();
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden', 'false');

  let dismissed = false;
  let safetyTimer = null;

  const updateUI = (pct) => {
    const safePct = Math.max(0, Math.min(100, Math.round(pct)));
    if (progressBar) {
      progressBar.style.width = `${safePct}%`;
    }
    if (progressText) {
      progressText.textContent = `${safePct}%`;
    }
  };

  const dismissPreloader = () => {
    if (dismissed) return;
    dismissed = true;
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }

    updateUI(100);
    overlay.classList.add('is-hidden');
    overlay.setAttribute('aria-hidden', 'true');
    unlockScroll();

    setTimeout(() => {
      overlay.style.display = 'none';
    }, FADE_DURATION_MS);
  };

  // Timeout máximo de segurança (25s) para nunca prender o usuário em redes muito lentas
  safetyTimer = setTimeout(dismissPreloader, SAFETY_TIMEOUT_MS);

  preloadAllSiteAssets(updateUI)
    .then(() => {
      // Pequeno respiro visual de 120ms no 100% antes do fade-out suave
      setTimeout(dismissPreloader, 120);
    })
    .catch(() => {
      dismissPreloader();
    });
}
