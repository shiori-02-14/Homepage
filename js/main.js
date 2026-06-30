(() => {
const storageKey = 'shiori-theme';
const reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

const applyReducedEffectsHint = () => {
  try {
    const root = document.documentElement;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection && connection.saveData) {
      root.setAttribute('data-reduced-effects', 'true');
    }
  } catch (_) {
    // ignore
  }
};

const isReducedEffects = () => {
  const root = document.documentElement;
  return root.getAttribute('data-reduced-effects') === 'true'
    || Boolean(reduceMotionQuery && reduceMotionQuery.matches);
};

const fortuneDataKey = '__SHIORI_FORTUNE_DATA__';
const scriptBaseUrl = (() => {
  const current = document.currentScript;
  if (current && current.src) {
    return new URL('.', current.src);
  }
  return new URL('./js/', window.location.href);
})();

let fortuneDataPromise = null;
const loadFortuneData = () => {
  if (globalThis[fortuneDataKey]) {
    return Promise.resolve(globalThis[fortuneDataKey]);
  }
  if (fortuneDataPromise) {
    return fortuneDataPromise;
  }

  fortuneDataPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('fortune-data.js', scriptBaseUrl).toString();
    script.async = true;
    script.onload = () => resolve(globalThis[fortuneDataKey]);
    script.onerror = () => reject(new Error('fortune-data.js load failed'));
    document.head.appendChild(script);
  });

  return fortuneDataPromise;
};

const pickRandom = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index];
};

const pickWeightedRandom = (items, weights) => {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }
  if (!Array.isArray(weights) || weights.length !== items.length) {
    // 重みが指定されていない場合は均等確率
    return pickRandom(items);
  }
  
  // 重みの合計を計算
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  
  // 0からtotalWeightまでの乱数を生成
  let random = Math.random() * totalWeight;
  
  // 重みに基づいて選択
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }
  
  // フォールバック（通常は到達しない）
  return items[items.length - 1];
};

const setupThemeToggle = () => {
  const root = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');

  if (!themeToggle) return;

  const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const prefersReducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  let transitionTimer;
  const runThemeTransition = () => {
    if (prefersReducedMotion && prefersReducedMotion.matches) return;
    if (root.getAttribute('data-reduced-effects') === 'true') return;
    root.classList.add('theme-transitioning');
    window.clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 400);
  };

  const updateToggleUI = (theme) => {
    const isDark = theme === 'dark';
    const label = isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え';
    themeToggle.setAttribute('aria-label', label);
    if (themeToggle.getAttribute('role') === 'switch') {
      themeToggle.setAttribute('aria-checked', String(isDark));
    } else {
      themeToggle.setAttribute('aria-pressed', String(isDark));
    }
    const textEl = themeToggle.querySelector('.theme-toggle__text');
    if (textEl) {
      textEl.textContent = isDark ? 'ダーク' : 'ライト';
    }
  };

  const updateSkillIcons = (theme) => {
    document.querySelectorAll('[data-skill]').forEach((img) => {
      img.src = `https://skillicons.dev/icons?i=${img.dataset.skill}&theme=${theme}`;
    });
  };

  const applyTheme = (theme, { persist = false } = {}) => {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', nextTheme);
    updateToggleUI(nextTheme);
    updateSkillIcons(nextTheme);
    if (persist) {
      localStorage.setItem(storageKey, nextTheme);
    }
  };

  const savedTheme = localStorage.getItem(storageKey);
  const prefersDarkMatches = prefersDark && prefersDark.matches;
  applyTheme(savedTheme || (prefersDarkMatches ? 'dark' : 'light'));

  themeToggle.addEventListener('click', () => {
    const currentTheme = root.getAttribute('data-theme');
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    runThemeTransition();
    applyTheme(nextTheme, { persist: true });
  });

  const handleSystemChange = (event) => {
    if (!localStorage.getItem(storageKey)) {
      applyTheme(event.matches ? 'dark' : 'light');
    }
  };

  if (prefersDark) {
    if (prefersDark.addEventListener) {
      prefersDark.addEventListener('change', handleSystemChange);
    } else if (prefersDark.addListener) {
      prefersDark.addListener(handleSystemChange);
    }
  }
};

const FOOTER_SOCIAL_ICON = {
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4.1c4.2 0 6.9 2.2 6.9 6.4V19h-3.4v-7.5c0-2.1-1.1-3.2-3.2-3.2H9.5V19H6V5z"/></svg>',
  qiita: '<svg viewBox="0 0 512 512" fill="currentColor"><path d="M248.445-.086h15.535c50.594 1.969 96.68 17.246 138.262 45.832 40.39 28.555 70.348 65.57 89.871 111.04 12.407 29.898 19.035 61.023 19.887 93.366v13.828c-1.434 39.383-11.281 76.54-29.531 111.465l-.168.168c-6.23-3.12-12.832-4.855-19.801-5.203-3.703-.129-7.402-.07-11.098.168-4.707.422-9.402.961-14.082 1.621a12.438 12.438 0 0 1-6.23-2.133 44.843 44.843 0 0 1-7.082-6.058 80.19 80.19 0 0 1-9.39-12.121c-2.24-4.125-2.981-8.508-2.22-13.14 5.727-17.692 8.856-35.845 9.391-54.454.938-26.027-3.441-51.117-13.144-75.277-9.582-23.993-23.211-45.301-40.883-63.926a5.79 5.79 0 0 0 .258-1.278 2772.54 2772.54 0 0 0-.344-50.015c-.922-7.813-5.278-11.2-13.059-10.156a25.062 25.062 0 0 0-6.824 2.73 5499.798 5499.798 0 0 1-35.164 20.059c-29.938-12.47-60.832-15.57-92.688-9.305-20.5 4.594-39.222 13.012-56.16 25.262a305.263 305.263 0 0 0-9.472 7.258c-12.442-3.09-24.871-6.192-37.297-9.305a17.357 17.357 0 0 0-8.875.34c-4.86 2.136-6.992 5.863-6.403 11.183a4012.428 4012.428 0 0 0 12.204 46.172c-18.922 33.156-27.825 68.863-26.711 107.11.293 18.89 3.48 37.27 9.558 55.136 12.75 35 35.938 60.52 69.559 76.555 20.023 9.117 41.02 14.465 62.984 16.047 28.059 1.86 55.711-.645 82.957-7.512a175.953 175.953 0 0 0 44.211-17.922 128.533 128.533 0 0 0 23.64-17.836c2.817 5 6.173 9.61 10.075 13.825 11.344 12.085 24.687 21.273 40.027 27.566a63.505 63.505 0 0 0 9.899 2.73c-37.512 38.594-82.86 63.176-136.043 73.743A285.817 285.817 0 0 1 262.445 512h-12.293c-62.222-2.078-116.734-23.387-163.523-63.926-40.762-36.457-67.531-81.433-80.313-134.933a284.931 284.931 0 0 1-6.402-49.16v-13.829a257.12 257.12 0 0 1 11.352-69.984c16.558-51.7 46.175-94.172 88.847-127.422C143.895 19.63 193.336 2.02 248.445-.086Zm0 0"/></svg>',
  zenn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.264 23.771h4.984c.264 0 .498-.147.645-.352L19.614.874c.176-.293-.029-.645-.381-.645h-4.72c-.235 0-.44.117-.557.323L.03 23.361c-.088.176.029.41.234.41zM17.445 23.419l6.479-10.408c.205-.323-.029-.733-.41-.733h-4.691c-.176 0-.352.088-.44.235l-6.655 10.643c-.176.264.029.616.352.616h4.779c.234-.001.468-.118.586-.353z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
};

const FOOTER_SOCIAL_LINKS = [
  { key: 'x', href: 'https://x.com/shiori_tech', label: 'X' },
  { key: 'github', href: 'https://github.com/shiori-02-14', label: 'GitHub' },
  { key: 'linkedin', href: 'https://www.linkedin.com/in/%E5%81%A5%E4%B8%80-%E6%9C%AC%E9%96%93-a27bb13b1', label: 'LinkedIn' },
  { key: 'note', href: 'https://note.com/shiori_02_14_', label: 'note' },
  { key: 'qiita', href: 'https://qiita.com/shiori_02_14_', label: 'Qiita' },
  { key: 'zenn', href: 'https://zenn.dev/shiori_02_14', label: 'Zenn' },
  { key: 'youtube', href: 'https://www.youtube.com/@shiori_channel914', label: 'YouTube' },
];

const getFooterPathPrefix = () => {
  const path = window.location.pathname.replace(/\\/g, '/');
  if (/\/articles\/[^/]+\.html$/i.test(path)) {
    return '../';
  }
  return '';
};

const initFooterSocial = () => {
  const pathPrefix = getFooterPathPrefix();

  document.querySelectorAll('.foot:not([data-foot-social-ready])').forEach((footer) => {
    footer.dataset.footSocialReady = 'true';

    let nav = footer.querySelector('.foot-social');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'foot-social';
      nav.setAttribute('aria-label', 'SNSリンク');
      footer.prepend(nav);
    }

    if (nav.childElementCount > 0) {
      return;
    }

    FOOTER_SOCIAL_LINKS.forEach(({ key, href, label, internal }) => {
      const link = document.createElement('a');
      link.dataset.social = key;
      link.className = 'foot-social__link';
      link.href = internal ? `${pathPrefix}${href}` : href;
      if (!internal) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }

      const icon = document.createElement('span');
      icon.className = 'foot-social__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = FOOTER_SOCIAL_ICON[key] || '';

      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = label;

      link.append(icon, sr);
      nav.appendChild(link);
    });

    let copy = footer.querySelector('.foot-copy');
    if (!copy) {
      copy = document.createElement('p');
      copy.className = 'foot-copy';
      copy.innerHTML = '© <span id="y"></span> しおり🔖';
      footer.appendChild(copy);
    }
  });
};

const initYearStamp = () => {
  const year = String(new Date().getFullYear());
  ['y', 'profile-year'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = year;
    }
  });
};

const initReloadButton = () => {
  const reloadBtn = document.getElementById('reload-btn');
  if (!reloadBtn) return;

  reloadBtn.addEventListener('click', (event) => {
    const isTopPage = document.body && document.body.id === 'top';
    if (!isTopPage) {
      return;
    }
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.location.reload();
  });
};

const setupHeaderAutoFit = () => {
  const headerInner = document.querySelector('.site-header__inner');
  if (!headerInner) return;

  const topNav = headerInner.querySelector('.top-nav');
  const logoText = headerInner.querySelector('.reload-text');

  // scrollWidth/clientWidth の計測はレイアウト計算を伴うので、ループ回数を極力減らす
  const fitElementToWidth = (el, { minPx = 12, precisionPx = 0.25, maxLoops = 18 } = {}) => {
    if (!el) return;
    if (el.clientWidth === 0) return;

    const max = Number.parseFloat(getComputedStyle(el).fontSize);
    if (!Number.isFinite(max)) return;

    const min = Math.min(minPx, max);
    if (max <= min) return;

    const isOverflowing = () => el.scrollWidth > el.clientWidth + 1;
    if (!isOverflowing()) return;

    let low = min;
    let high = max;
    let best = min;

    for (let loops = 0; loops < maxLoops && high - low > precisionPx; loops += 1) {
      const mid = (low + high) / 2;
      el.style.fontSize = `${mid}px`;

      if (isOverflowing()) {
        high = mid;
      } else {
        best = mid;
        low = mid;
      }
    }

    el.style.fontSize = `${best}px`;
  };

  const fit = () => {
    headerInner.classList.remove('is-overflowing');

    // まずCSSの計算値（clamp等）に戻してから、必要なら縮める
    if (topNav) topNav.style.removeProperty('font-size');
    if (logoText) logoText.style.removeProperty('font-size');

    // まずはナビの中身が収まるまで縮める（ヘッダー全体を1行維持）
    fitElementToWidth(topNav, { minPx: 12 });

    // それでもヘッダー自体がはみ出す場合だけ、ロゴ文字も縮める
    if (logoText && headerInner.scrollWidth > headerInner.clientWidth + 1) {
      fitElementToWidth(logoText, { minPx: 12 });
    }

    // 最小まで縮めてもナビがはみ出す場合は、ナビだけ横スクロールにフォールバック
    if (topNav && topNav.scrollWidth > topNav.clientWidth + 1) {
      headerInner.classList.add('is-overflowing');
    }
  };

  let rafId = 0;
  const schedule = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      fit();
    });
  };

  schedule();
  window.addEventListener('resize', schedule, { passive: true });

  if ('fonts' in document && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(schedule).catch(() => {});
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(schedule);
    ro.observe(headerInner);
  }
};

const initAnchorScroll = () => {
  document.querySelectorAll('.top-nav a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const href = link.getAttribute('href');
      if (!href) return;
      const targetId = href.slice(1);
      if (!targetId) return;

      const target = document.getElementById(targetId);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    });
  });
};

const initScrollReveal = () => {
  const targets = Array.from(document.querySelectorAll('.reveal-target'));
  if (!targets.length) return;

  targets.forEach((target, index) => {
    target.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 70}ms`);
  });

  const showAll = () => {
    targets.forEach((target) => {
      target.classList.add('is-visible');
    });
  };

  if (isReducedEffects()) {
    showAll();
    return;
  }

  const root = document.documentElement;
  root.classList.add('has-reveal');

  if (!('IntersectionObserver' in window)) {
    showAll();
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, {
    root: null,
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.16
  });

  targets.forEach((target) => observer.observe(target));
};

const initScrollProgress = () => {
  const bar = document.getElementById('scroll-progress-bar');
  if (!bar) return;

  const root = document.documentElement;
  let rafId = 0;

  const update = () => {
    const scrollTop = window.pageYOffset || root.scrollTop || 0;
    const scrollRange = Math.max(root.scrollHeight - window.innerHeight, 0);
    const progress = scrollRange > 0 ? Math.min(scrollTop / scrollRange, 1) : 0;
    bar.style.transform = `scaleX(${progress})`;
  };

  const onScrollOrResize = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      update();
    });
  };

  update();
  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });
};

const initFortune = () => {
  const btn = document.getElementById('fortune-btn');
  const resultNode = document.getElementById('fortune-result');
  const commentNode = document.getElementById('fortune-comment');
  const luckyNode = document.getElementById('fortune-lucky');
  const hintNode = document.getElementById('fortune-hint');
  const retryBtn = document.getElementById('fortune-retry-btn');
  const slotReel = document.getElementById('fortune-slot-reel');
  const resultText = resultNode?.querySelector('.fortune-result-text');
  const container = document.querySelector('.fortune-container');
  const slipNode = document.querySelector('.fortune-slip');

  if (!btn || !resultNode || !commentNode || !luckyNode) return;

  const commentCategoryEl = commentNode.querySelector('.fortune-comment__category');
  const commentTextEl = commentNode.querySelector('.fortune-comment__text');
  const luckyItemEl = luckyNode.querySelector('.fortune-lucky__item');

  const setFortuneComment = (category, text) => {
    if (commentCategoryEl) {
      if (category) {
        commentCategoryEl.textContent = category;
        commentCategoryEl.hidden = false;
      } else {
        commentCategoryEl.textContent = '';
        commentCategoryEl.hidden = true;
      }
    }
    if (commentTextEl) commentTextEl.textContent = text ? `「${text}」` : '';
  };

  const setFortuneLucky = (item) => {
    if (luckyItemEl) luckyItemEl.textContent = item || '推しTシャツ';
  };

  const resetFortuneOutcome = () => {
    setFortuneComment('', '');
    if (luckyItemEl) luckyItemEl.textContent = '';
    commentNode.style.display = 'none';
    commentNode.classList.remove('fortune-reveal');
    luckyNode.style.display = 'none';
    luckyNode.classList.remove('fortune-reveal');
  };

  const defaultFortuneData = {
    results: ['吉'],
    fallbackComment: '今日はうんこに気をつけましょう！',
    commentsByResult: {},
    luckyItems: []
  };

  const placeholderResults = ['大吉', '中吉', '小吉', '吉', '末吉', '凶'];

  const spinPlaceholderReel = () => {
    if ((reduceMotionQuery && reduceMotionQuery.matches) || !slotReel) return;

    resultNode.style.display = 'block';
    slotReel.innerHTML = '';
    slotReel.style.transform = 'translateY(0)';
    slotReel.style.transition = 'none';
    slotReel.classList.remove('fortune-slot-slowing');

    for (let i = 0; i < 16; i++) {
      const reelItem = document.createElement('div');
      reelItem.className = 'fortune-slot-item';
      reelItem.textContent = pickRandom(placeholderResults);
      slotReel.appendChild(reelItem);
    }

    slotReel.classList.add('fortune-slot-spinning');
  };

  const showFortune = (fortuneData) => {
    const data = fortuneData || defaultFortuneData;
    
    // おみくじの確率設定（一般的な確率分布）
    // 大吉: 3%, 中吉: 12%, 小吉: 15%, 吉: 40%, 末吉: 20%, 凶: 10%
    const fortuneWeights = {
      '大吉': 3,
      '中吉': 12,
      '小吉': 15,
      '吉': 40,
      '末吉': 20,
      '凶': 10
    };
    
    // データに含まれる運勢の重みを取得
    const weights = data.results.map(result => fortuneWeights[result] || 10);
    const randomResult = pickWeightedRandom(data.results, weights) || '吉';
    const finalResult = randomResult;

    if (slipNode) {
      slipNode.classList.remove('fortune-slip--daikichi', 'fortune-slip--kyou');
      if (randomResult === '大吉') slipNode.classList.add('fortune-slip--daikichi');
      if (randomResult === '凶') slipNode.classList.add('fortune-slip--kyou');
    }

    const commentCandidates = data.commentsByResult && data.commentsByResult[randomResult];
    const categories = commentCandidates ? Object.keys(commentCandidates) : [];
    const category = pickRandom(categories);
    const variations = (category && commentCandidates[category]) || [];
    const text = pickRandom(variations) || data.fallbackComment || defaultFortuneData.fallbackComment;

    setFortuneComment(category, text);

    const luckyItem = pickRandom(data.luckyItems);
    setFortuneLucky(luckyItem || '推しTシャツ');

    // 演出：順番に表示される
    const reduceMotion = reduceMotionQuery && reduceMotionQuery.matches;
    
    if (reduceMotion) {
      // アニメーション無効の場合は即座に表示
      if (resultText) {
        resultText.textContent = finalResult;
        resultText.style.display = 'flex';
        resultText.style.opacity = '1';
      } else {
        resultNode.textContent = finalResult;
        resultNode.style.opacity = '1';
      }
      resultNode.style.display = 'block';
      commentNode.style.display = 'block';
      luckyNode.style.display = 'block';
    } else {
      // スロットマシン風の演出
      resultNode.style.display = 'block';
      const allResults = data.results || ['大吉', '中吉', '小吉', '吉', '末吉', '凶'];
      
      // スロットリールを作成
      if (slotReel) {
        slotReel.innerHTML = '';
        // リールに複数の運勢を追加（ループさせるため多めに、同じアイテムを繰り返し）
        const reelItems = [];
        
        // 最初の部分：ランダムな運勢を繰り返し（高速回転用、ループさせるため最初のアイテムを最後にも追加）
        const firstItems = [];
        for (let i = 0; i < 30; i++) {
          const randomItem = pickRandom(allResults);
          const item = randomItem;
          reelItems.push(item);
          if (i === 0) firstItems.push(item);
        }
        
        // 中間部分：徐々に最終結果に近づく
        for (let i = 0; i < 5; i++) {
          const randomItem = pickRandom(allResults);
          reelItems.push(randomItem);
        }
        
        // 最後に最終結果を追加
        reelItems.push(finalResult);
        
        // ループを滑らかにするため、最初のアイテムを最後にも追加
        if (firstItems.length > 0) {
          reelItems.push(firstItems[0]);
        }
        
        // 最初のアイテムを作成して高さを取得（レスポンシブ対応）
        const firstItem = document.createElement('div');
        firstItem.className = 'fortune-slot-item';
        firstItem.textContent = reelItems[0];
        firstItem.style.position = 'absolute';
        firstItem.style.visibility = 'hidden';
        slotReel.appendChild(firstItem);
        const itemHeight = firstItem.offsetHeight || 80;
        slotReel.removeChild(firstItem);
        
        // CSS変数を設定してアニメーションが正しく動作するようにする
        const slotContainer = slotReel.parentElement;
        if (slotContainer) {
          slotContainer.style.setProperty('--slot-item-height', `${itemHeight}px`);
        }
        
        reelItems.forEach((item) => {
          const reelItem = document.createElement('div');
          reelItem.className = 'fortune-slot-item';
          reelItem.textContent = item;
          slotReel.appendChild(reelItem);
        });
        
        // スロットアニメーション開始
        slotReel.classList.add('fortune-slot-spinning');
        
        // スロットが減速して止まる
        const spinDuration = 2200;
        const slowDuration = 650;
        
        setTimeout(() => {
          slotReel.classList.remove('fortune-slot-spinning');
          
          // 最終結果の位置にスクロール
          const finalIndex = reelItems.length - 2; // 最後のアイテム（ループ用）の前
          const targetPosition = finalIndex * itemHeight;
          
          // 現在の位置を取得（アニメーション中の位置を考慮）
          // 0.08sごとに60px移動、spinDuration秒間回転
          const itemsPerSecond = 1000 / 80; // 1秒間に12.5アイテム
          const totalItemsScrolled = Math.floor((spinDuration / 1000) * itemsPerSecond);
          const currentPosition = (totalItemsScrolled % reelItems.length) * itemHeight;
          
          slotReel.style.setProperty('--slot-start', `-${currentPosition}px`);
          slotReel.style.setProperty('--slot-end', `-${targetPosition}px`);
          slotReel.classList.add('fortune-slot-slowing');
          
          // アニメーション完了後に最終結果を表示（スロットの中に表示）
          setTimeout(() => {
            // スロットリールを非表示にせず、そのまま最終結果を表示
            slotReel.classList.remove('fortune-slot-slowing');
            slotReel.style.transform = `translateY(-${targetPosition}px)`;
            slotReel.style.transition = 'none';
            
            // スロットの中に最終結果が表示されている状態にする
            // リールの最後のアイテム（最終結果）が表示されるように位置を調整
            const slotContainer = slotReel.parentElement;
            if (slotContainer) {
              slotContainer.classList.add('fortune-slot-stopped');
            }
            
            // コメントを表示
            setTimeout(() => {
              commentNode.style.display = 'block';
              commentNode.classList.add('fortune-reveal');
            }, 160);

            // ラッキーアイテムを表示
            setTimeout(() => {
              luckyNode.style.display = 'block';
              luckyNode.classList.add('fortune-reveal');
            }, 360);
          }, slowDuration);
        }, spinDuration);
      } else {
        // フォールバック：通常の表示
        if (resultText) {
          resultText.textContent = finalResult;
          resultText.style.display = 'flex';
          resultText.style.opacity = '1';
        } else {
          resultNode.textContent = finalResult;
          resultNode.style.opacity = '1';
        }
        resultNode.classList.add('fortune-reveal');
        
        setTimeout(() => {
          commentNode.style.display = 'block';
          commentNode.classList.add('fortune-reveal');
        }, 280);

        setTimeout(() => {
          luckyNode.style.display = 'block';
          luckyNode.classList.add('fortune-reveal');
        }, 520);
      }
    }
  };

  const reveal = (fortuneData) => {
    btn.style.display = 'none';
    if (hintNode) hintNode.style.display = 'none';
    showFortune(fortuneData);
    
    // 「もう一度」ボタンを表示
    if (retryBtn) {
      retryBtn.style.display = 'inline-flex';
    }
    
    // 結果部分のクリックは無効化（ボタンのみクリック可能）
    if (container) {
      container.style.cursor = 'default';
      container.removeAttribute('title');
    }
    [resultNode, commentNode, luckyNode].forEach(node => {
      if (node) {
        node.style.cursor = 'default';
      }
    });
  };

  const drawFortune = () => {
    const isFirstDraw = btn.style.display !== 'none';
    const activeBtn = isFirstDraw ? btn : retryBtn;
    const reduceMotion = reduceMotionQuery && reduceMotionQuery.matches;

    if (activeBtn) {
      activeBtn.setAttribute('aria-busy', 'true');
      activeBtn.disabled = true;
    }

    if (hintNode) {
      hintNode.classList.remove('fortune-loading');
      hintNode.style.display = 'none';
    }

    if (slipNode) {
      slipNode.classList.remove('fortune-slip--daikichi', 'fortune-slip--kyou');
      slipNode.classList.add('fortune-slip--drawing');
    }

    // 結果を一旦非表示にする（アニメーションクラスも削除）
    resultNode.style.display = 'none';
    resultNode.classList.remove('fortune-reveal', 'fortune-shuffling');
    if (slotReel) {
      slotReel.style.display = 'flex';
      slotReel.style.transform = 'translateY(0)';
      slotReel.style.transition = 'none';
      slotReel.classList.remove('fortune-slot-spinning', 'fortune-slot-slowing');
      slotReel.innerHTML = '';
      const slotContainer = slotReel.parentElement;
      if (slotContainer) {
        slotContainer.classList.remove('fortune-slot-stopped');
      }
    }
    const resultTextReset = resultNode?.querySelector('.fortune-result-text');
    if (resultTextReset) {
      resultTextReset.style.display = 'none';
      resultTextReset.textContent = '';
      resultTextReset.classList.remove('fortune-reveal');
    }
    resetFortuneOutcome();
    if (retryBtn) {
      retryBtn.style.display = 'none';
    }

    spinPlaceholderReel();

    // 初回のみボタン退場、再抽選は即スロット開始
    if (isFirstDraw && !reduceMotion) {
      btn.classList.add('animate-out');
      window.setTimeout(() => {
        btn.style.display = 'none';
        btn.classList.remove('animate-out');
      }, 220);
    } else if (isFirstDraw) {
      btn.style.display = 'none';
    }

    const kickoff = reduceMotion ? 0 : (isFirstDraw ? 60 : 0);

    const finishDraw = (fortuneData) => {
      window.setTimeout(() => {
        const resolved = fortuneData || globalThis[fortuneDataKey] || defaultFortuneData;
        reveal(resolved);
        if (slipNode) slipNode.classList.remove('fortune-slip--drawing');
      }, kickoff);
    };

    const drawPromise = globalThis[fortuneDataKey]
      ? Promise.resolve(globalThis[fortuneDataKey])
      : loadFortuneData().catch(() => null);

    drawPromise
      .then((fortuneData) => finishDraw(fortuneData))
      .finally(() => {
        if (btn) {
          btn.removeAttribute('aria-busy');
          btn.disabled = false;
        }
        if (retryBtn) {
          retryBtn.removeAttribute('aria-busy');
          retryBtn.disabled = false;
        }
      });
  };

  // ボタンクリックでおみくじを引く
  btn.addEventListener('click', drawFortune);

  loadFortuneData().catch(() => null);
  
  // 「もう一度」ボタンでもおみくじを引けるようにする
  if (retryBtn) {
    retryBtn.addEventListener('click', drawFortune);
  }

  // 結果部分のクリックは無効化（ボタンのみクリック可能）
  // コンテナ全体のクリックイベントは削除
};

const initProfileTimelineFuture = () => {
  const isProfilePage = document.body && document.body.id === 'profile-page';
  if (!isProfilePage) return;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  document.querySelectorAll('#profile-page .profile-timeline__item:not(.profile-timeline__item--tail)').forEach((item) => {
    const timeEl = item.querySelector('.profile-timeline__date[datetime]');
    if (!timeEl) return;

    const value = timeEl.getAttribute('datetime');
    if (!value) return;

    const [year, month = '1'] = value.split('-');
    const itemYear = Number(year);
    const itemMonth = Number(month);
    if (!itemYear || !itemMonth) return;

    const isFuture = itemYear > currentYear || (itemYear === currentYear && itemMonth > currentMonth);
    if (isFuture) {
      item.classList.add('profile-timeline__item--future');
    }
  });
};

const initWorksFilter = () => {
  const isWorksPage = document.body && document.body.id === 'works-page';
  if (!isWorksPage) return;

  const filterTabs = document.querySelectorAll('#works-page .articles-filter__tab');
  const worksList = document.getElementById('works-list');
  if (!filterTabs.length || !worksList) return;

  const updateEmptyState = (filter) => {
    const existingEmpty = worksList.querySelector('.articles-empty');
    if (existingEmpty) existingEmpty.remove();

    const allCards = worksList.querySelectorAll('.card--work');
    let visibleCount = 0;
    allCards.forEach((card) => {
      if (card.style.display !== 'none') visibleCount += 1;
    });

    if (visibleCount === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'articles-empty';
      emptyDiv.innerHTML = '<p class="articles-empty__text">該当する作品がありません</p>';
      worksList.appendChild(emptyDiv);
    }
  };

  const applyFilter = (filter) => {
    const allCards = worksList.querySelectorAll('.card--work');
    allCards.forEach((card) => {
      const type = card.getAttribute('data-work-type');
      if (filter === 'all') {
        card.style.display = type === 'plan' ? 'none' : '';
        return;
      }
      card.style.display = type === filter ? '' : 'none';
    });
    updateEmptyState(filter);
  };

  filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const filter = tab.getAttribute('data-filter') || 'all';

      filterTabs.forEach((t) => {
        t.setAttribute('aria-selected', 'false');
        t.classList.remove('articles-filter__tab--active');
      });
      tab.setAttribute('aria-selected', 'true');
      tab.classList.add('articles-filter__tab--active');

      applyFilter(filter);
    });
  });

  const allTab = document.getElementById('works-filter-all');
  if (allTab) allTab.classList.add('articles-filter__tab--active');
  applyFilter('all');
};

const initFriendAvatars = () => {
  document.querySelectorAll('.friend-card__avatar img').forEach((img) => {
    img.referrerPolicy = 'no-referrer';

    img.addEventListener('error', () => {
      const avatar = img.closest('.friend-card__avatar');
      const name = img.closest('.friend-card')?.querySelector('.friend-card__name')?.textContent?.trim();
      if (!avatar || avatar.dataset.fallbackApplied === 'true') return;
      avatar.dataset.fallbackApplied = 'true';
      avatar.dataset.initial = name ? name.charAt(0) : '?';
      img.remove();
    }, { once: true });
  });
};

const initPage = () => {
  applyReducedEffectsHint();
  setupThemeToggle();
  initFooterSocial();
  initYearStamp();
  initReloadButton();
  setupHeaderAutoFit();
  initAnchorScroll();
  initScrollReveal();
  initScrollProgress();
  initFortune();
  initProfileTimelineFuture();
  initWorksFilter();
  initFriendAvatars();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage, { once: true });
} else {
  initPage();
}
})();
