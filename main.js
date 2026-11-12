import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------------------
  // 1. ANO ATUAL DINÂMICO
  // ------------------------------------------------------------------------
  const yearEl = document.getElementById('current-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // ------------------------------------------------------------------------
  // 2. HEADER DINÂMICO NO SCROLL
  // ------------------------------------------------------------------------
  const header = document.getElementById('main-header');
  const handleHeaderScroll = () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', handleHeaderScroll, { passive: true });
  handleHeaderScroll();

  // ------------------------------------------------------------------------
  // 3. MENU MOBILE ACESSÍVEL
  // ------------------------------------------------------------------------
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link');

  const toggleMenu = (open) => {
    const isOpen = open !== undefined ? open : !mobileMenu.classList.contains('open');
    menuToggle.classList.toggle('open', isOpen);
    menuToggle.setAttribute('aria-expanded', isOpen.toString());
    mobileMenu.classList.toggle('open', isOpen);
    mobileMenu.setAttribute('aria-hidden', (!isOpen).toString());
    document.body.style.overflow = isOpen ? 'hidden' : '';
  };

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => toggleMenu());

    mobileLinks.forEach(link => {
      link.addEventListener('click', () => toggleMenu(false));
    });

    // Fechar ao pressionar Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        toggleMenu(false);
      }
    });
  }

  // ------------------------------------------------------------------------
  // 4. AUTOPLAY RESILIENTE & ACESSIBILIDADE DO VÍDEO DO HERO
  // ------------------------------------------------------------------------
  const heroVideo = document.getElementById('hero-bg-video');
  if (heroVideo) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      heroVideo.pause();
    } else {
      // Garantia programática de autoplay silencioso para Safari/iOS e Chrome Android
      heroVideo.muted = true;
      heroVideo.defaultMuted = true;
      heroVideo.setAttribute('muted', '');
      heroVideo.setAttribute('playsinline', '');
      heroVideo.setAttribute('webkit-playsinline', '');

      const tryPlay = () => {
        const playPromise = heroVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Se bloqueado pelo navegador em modo restrito, aguarda o primeiro toque
            const unlockOnTouch = () => {
              heroVideo.play().catch(() => {});
              window.removeEventListener('touchstart', unlockOnTouch);
              window.removeEventListener('click', unlockOnTouch);
            };
            window.addEventListener('touchstart', unlockOnTouch, { once: true, passive: true });
            window.addEventListener('click', unlockOnTouch, { once: true, passive: true });
          });
        }
      };

      if (heroVideo.readyState >= 2) {
        tryPlay();
      } else {
        heroVideo.addEventListener('loadeddata', tryPlay, { once: true });
      }
    }
  }

  // ------------------------------------------------------------------------
  // 5. EXPERIÊNCIA CENTRAL — MONTAGEM FULLSCREEN EM CANVAS COM SCROLLTRIGGER
  // ------------------------------------------------------------------------
  const canvas = document.getElementById('assembly-canvas');
  const engineeringSection = document.getElementById('engenharia');
  const engMinimalBar = document.getElementById('eng-minimal-bar');

  const captionElements = [
    document.getElementById('step-caption-1'),
    document.getElementById('step-caption-2'),
    document.getElementById('step-caption-3'),
    document.getElementById('step-caption-4')
  ];

  if (canvas && engineeringSection) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const TOTAL_FRAMES = 275;
    const FRAME_ASPECT = 1600 / 900;
    const frameImages = new Array(TOTAL_FRAMES);
    const frameLoaded = new Array(TOTAL_FRAMES).fill(false);
    let currentRenderedIndex = 0;

    const getFrameSrc = (index) => {
      const num = (index + 1).toString().padStart(4, '0');
      return `/assets/frames/frame_${num}.webp`;
    };

    // Ajuste responsivo de dimensões do Canvas com limite de dpr para economia de GPU
    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      renderFrame(currentRenderedIndex);
    };

    // Encontrar o frame carregado mais próximo caso o exato ainda não tenha chegado
    const findNearestLoadedFrame = (targetIndex) => {
      if (frameLoaded[targetIndex]) return frameImages[targetIndex];

      // Busca bidirecional pelo vizinho mais próximo já decodificado
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        const left = targetIndex - offset;
        const right = targetIndex + offset;
        if (left >= 0 && frameLoaded[left]) return frameImages[left];
        if (right < TOTAL_FRAMES && frameLoaded[right]) return frameImages[right];
      }
      return frameImages[0] || null;
    };

    // Renderização do frame com enquadramento cover inteligente centralizado
    const renderFrame = (index) => {
      if (!ctx || canvas.width === 0 || canvas.height === 0) return;
      currentRenderedIndex = index;

      const img = frameLoaded[index] ? frameImages[index] : findNearestLoadedFrame(index);
      if (!img || !img.complete) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const canvasAspect = cw / ch;

      let drawWidth, drawHeight, drawX, drawY;

      if (canvasAspect > FRAME_ASPECT) {
        // Viewport mais largo que o vídeo (widescreen / ultrawide)
        drawWidth = cw;
        drawHeight = Math.round(cw / FRAME_ASPECT);
        drawX = 0;
        drawY = Math.round((ch - drawHeight) / 2);
      } else if (canvasAspect < 0.85) {
        // Mobile vertical (smartphones 320px a 430px)
        // Enquadramento equilibrado: BMW visível com presença imponente sem corte de carroceria e sem faixa preta excessiva
        drawWidth = Math.round(cw * 1.35);
        drawHeight = Math.round(drawWidth / FRAME_ASPECT);
        drawX = Math.round((cw - drawWidth) / 2);
        drawY = Math.round((ch - drawHeight) / 2);
      } else {
        // Viewport intermediário (tablets / telas quase quadradas)
        drawHeight = ch;
        drawWidth = Math.round(ch * FRAME_ASPECT);
        drawX = Math.round((cw - drawWidth) / 2);
        drawY = 0;
      }

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    };

    // Carregamento de um frame individual
    const loadFrame = (index) => {
      if (frameImages[index]) return Promise.resolve(frameImages[index]);

      return new Promise((resolve) => {
        const img = new Image();
        img.src = getFrameSrc(index);
        img.onload = () => {
          frameLoaded[index] = true;
          frameImages[index] = img;
          if (index === currentRenderedIndex) {
            renderFrame(index);
          }
          resolve(img);
        };
        img.onerror = () => {
          // Fallback gracioso para evitar quebra
          resolve(null);
        };
      });
    };

    // Carregamento progressivo priorizado
    const initFrameLoading = async () => {
      // 1. Carregar primeiro e último frame imediatamente
      await Promise.all([loadFrame(0), loadFrame(TOTAL_FRAMES - 1)]);
      renderFrame(0);

      // 2. Carregar marcos das etapas (25%, 50%, 75%)
      const milestones = [
        Math.round(TOTAL_FRAMES * 0.25),
        Math.round(TOTAL_FRAMES * 0.50),
        Math.round(TOTAL_FRAMES * 0.75)
      ];
      await Promise.all(milestones.map(idx => loadFrame(idx)));

      // 3. Carregar em lotes concorrentes controlados
      const BATCH_SIZE = 6;
      let currentIndex = 1;

      const loadNextBatch = () => {
        if (currentIndex >= TOTAL_FRAMES) return;

        const batch = [];
        for (let i = 0; i < BATCH_SIZE && currentIndex < TOTAL_FRAMES; i++, currentIndex++) {
          if (!frameLoaded[currentIndex]) {
            batch.push(loadFrame(currentIndex));
          }
        }

        Promise.all(batch).then(() => {
          if ('requestIdleCallback' in window) {
            window.requestIdleCallback(loadNextBatch);
          } else {
            setTimeout(loadNextBatch, 20);
          }
        });
      };

      loadNextBatch();
    };

    // Inicializar Canvas e listeners de resize
    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('orientationchange', resizeCanvas, { passive: true });
    resizeCanvas();
    initFrameLoading();

    // Pré-carregamento dinâmico adaptativo ao redor da posição atual de scroll
    let preloadDebounce = null;
    const preloadNearbyFrames = (centerIndex) => {
      clearTimeout(preloadDebounce);
      preloadDebounce = setTimeout(() => {
        // Carrega antecipadamente uma janela de 15 quadros à frente e atrás
        const radius = 15;
        const start = Math.max(0, centerIndex - radius);
        const end = Math.min(TOTAL_FRAMES - 1, centerIndex + radius);
        for (let i = start; i <= end; i++) {
          if (!frameLoaded[i]) {
            loadFrame(i);
          }
        }
      }, 30);
    };

    // ScrollTrigger para o scrub fluído e reversível
    ScrollTrigger.create({
      trigger: engineeringSection,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.1, // Resposta direta e imediata ao gesto do usuário
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const progress = Math.min(1, Math.max(0, self.progress));

        // Mapeamento preciso: 0.0 -> Frame 0 | 1.0 -> Frame 274 (último frame completo)
        const frameIndex = Math.min(TOTAL_FRAMES - 1, Math.floor(progress * TOTAL_FRAMES));
        renderFrame(frameIndex);
        preloadNearbyFrames(frameIndex);

        // Barra de progresso minimalista
        if (engMinimalBar) {
          engMinimalBar.style.width = `${progress * 100}%`;
        }

        // Alternância sincronizada das 4 frases
        // Etapa 1: 0% a 25%
        // Etapa 2: 25% a 50%
        // Etapa 3: 50% a 75%
        // Etapa 4: 75% a 100%
        let activeStage = 0;
        if (progress >= 0.75) {
          activeStage = 3;
        } else if (progress >= 0.50) {
          activeStage = 2;
        } else if (progress >= 0.25) {
          activeStage = 1;
        } else {
          activeStage = 0;
        }

        captionElements.forEach((caption, idx) => {
          if (caption) {
            if (idx === activeStage) {
              caption.classList.add('active');
            } else {
              caption.classList.remove('active');
            }
          }
        });
      }
    });
  }

  // ------------------------------------------------------------------------
  // 6. ANIMAÇÕES DE ENTRADA HERO & SEÇÕES (GSAP)
  // ------------------------------------------------------------------------
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!isReducedMotion) {
    // Entrada Cinematográfica do Hero
    const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    heroTl.from('.editorial-badge', {
      opacity: 0,
      y: 20,
      duration: 0.8,
      delay: 0.2
    })
    .from('.hero-headline .headline-part', {
      opacity: 0,
      y: 30,
      duration: 0.8,
      stagger: 0.08
    }, '-=0.5')
    .from('.hero-subtitle', {
      opacity: 0,
      y: 20,
      duration: 0.8
    }, '-=0.5')
    .from('.hero-actions .btn', {
      opacity: 0,
      y: 20,
      duration: 0.7,
      stagger: 0.15
    }, '-=0.5')
    .from('.hero-meta-bar', {
      opacity: 0,
      duration: 1
    }, '-=0.3');

    // Revelação da Placa Editorial Clara (Seção Institucional)
    gsap.from('.editorial-card-plate', {
      scrollTrigger: {
        trigger: '#institucional',
        start: 'top 80%',
        toggleActions: 'play none none none'
      },
      opacity: 0,
      y: 40,
      duration: 1,
      ease: 'power2.out'
    });

    // Revelação dos Cards de Soluções
    gsap.from('.solucao-card', {
      scrollTrigger: {
        trigger: '#solucoes',
        start: 'top 75%',
        toggleActions: 'play none none none'
      },
      opacity: 0,
      y: 40,
      duration: 0.9,
      stagger: 0.2,
      ease: 'power3.out'
    });

    // Revelação da Galeria Showroom
    gsap.from('.mosaic-item', {
      scrollTrigger: {
        trigger: '#showroom',
        start: 'top 75%',
        toggleActions: 'play none none none'
      },
      opacity: 0,
      scale: 0.95,
      duration: 0.8,
      stagger: 0.12,
      ease: 'power2.out'
    });

    // Revelação da Seção de Confiança
    gsap.from('.confianca-card-image', {
      scrollTrigger: {
        trigger: '#confianca',
        start: 'top 75%',
        toggleActions: 'play none none none'
      },
      opacity: 0,
      x: -30,
      duration: 1,
      ease: 'power3.out'
    });
  }

  // ------------------------------------------------------------------------
  // 7. LIGHTBOX DO SHOWROOM
  // ------------------------------------------------------------------------
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImage = document.getElementById('lightbox-image');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');
  const mosaicItems = document.querySelectorAll('.mosaic-item');

  const openLightbox = (src, caption) => {
    if (!lightboxModal || !lightboxImage) return;
    lightboxImage.src = src;
    lightboxCaption.textContent = caption || '';
    lightboxModal.classList.add('open');
    lightboxModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    if (!lightboxModal) return;
    lightboxModal.classList.remove('open');
    lightboxModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  mosaicItems.forEach(item => {
    item.addEventListener('click', () => {
      const src = item.getAttribute('data-lightbox');
      const caption = item.getAttribute('data-caption');
      if (src) openLightbox(src, caption);
    });
  });

  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
  }

  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightboxModal.classList.contains('open')) {
        closeLightbox();
      }
    });
  }

  // ------------------------------------------------------------------------
  // 8. CTAS DE SERVIÇOS PREENCHENDO FORMULÁRIO DE ORÇAMENTO
  // ------------------------------------------------------------------------
  const serviceSelect = document.getElementById('form-servico');
  const serviceButtons = document.querySelectorAll('.btn-solucao');

  serviceButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const requestedService = btn.getAttribute('data-service');
      if (serviceSelect && requestedService) {
        serviceSelect.value = requestedService;
      }
    });
  });

  // ------------------------------------------------------------------------
  // 9. VALIDAÇÃO & ENVIO DO FORMULÁRIO DE ORÇAMENTO
  // ------------------------------------------------------------------------
  const orcamentoForm = document.getElementById('orcamento-form');
  const inputNome = document.getElementById('form-nome');
  const inputTelefone = document.getElementById('form-telefone');
  const inputVeiculo = document.getElementById('form-veiculo');
  const inputMensagem = document.getElementById('form-mensagem');

  if (orcamentoForm) {
    orcamentoForm.addEventListener('submit', (e) => {
      e.preventDefault();

      let isValid = true;

      // Validação Nome
      if (!inputNome.value.trim()) {
        document.getElementById('error-nome').classList.add('show');
        isValid = false;
      } else {
        document.getElementById('error-nome').classList.remove('show');
      }

      // Validação Telefone
      const telClean = inputTelefone.value.replace(/\D/g, '');
      if (telClean.length < 10) {
        document.getElementById('error-telefone').classList.add('show');
        isValid = false;
      } else {
        document.getElementById('error-telefone').classList.remove('show');
      }

      // Validação Veículo
      if (!inputVeiculo.value.trim()) {
        document.getElementById('error-veiculo').classList.add('show');
        isValid = false;
      } else {
        document.getElementById('error-veiculo').classList.remove('show');
      }

      // Validação Serviço
      if (!serviceSelect.value) {
        document.getElementById('error-servico').classList.add('show');
        isValid = false;
      } else {
        document.getElementById('error-servico').classList.remove('show');
      }

      if (!isValid) return;

      // Montar mensagem para o WhatsApp Oficial Confirmado da Titanium
      const whatsappNumber = '5511989027972'; // (11) 98902-7972
      const msgText = `Olá, Titanium Blindagens!\n\n` +
        `Gostaria de solicitar um orçamento:\n` +
        `• *Nome:* ${inputNome.value.trim()}\n` +
        `• *Telefone:* ${inputTelefone.value.trim()}\n` +
        `• *Veículo:* ${inputVeiculo.value.trim()}\n` +
        `• *Serviço de Interesse:* ${serviceSelect.value}\n` +
        (inputMensagem.value.trim() ? `• *Mensagem:* ${inputMensagem.value.trim()}\n\n` : `\n`) +
        `Aguardo retorno especializado.`;

      const encodedMsg = encodeURIComponent(msgText);
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${encodedMsg}`;

      // Feedback no botão e redirecionamento
      const submitBtn = document.getElementById('btn-submit-form');
      const originalText = submitBtn.innerHTML;

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>DIRECIONANDO AO WHATSAPP OFICIAL...</span>`;

      setTimeout(() => {
        window.open(whatsappUrl, '_blank');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        orcamentoForm.reset();
      }, 700);
    });
  }

  // Máscara suave de telefone
  if (inputTelefone) {
    inputTelefone.addEventListener('input', (e) => {
      let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
      e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    });
  }

  // Atualização segura do ScrollTrigger após carregamento de fontes e layout
  window.addEventListener('load', () => {
    ScrollTrigger.refresh();
  });
});
