(() => {
const storageKey = 'shiori-theme';
const reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

const fortuneDataKey = '__SHIORI_FORTUNE_DATA__';
const scriptBaseUrl = (() => {
  const current = document.currentScript;
  if (current && current.src) {
    return new URL('.', current.src);
  }
  return new URL('./scripts/', window.location.href);
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

const setupThemeToggle = () => {
  const root = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');

  if (!themeToggle) return;

  const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

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

  const applyTheme = (theme, { persist = false } = {}) => {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', nextTheme);
    updateToggleUI(nextTheme);
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

  const fitElementToWidth = (el, { minPx = 12, stepPx = 0.5, maxLoops = 80 } = {}) => {
    if (!el) return;
    const max = Number.parseFloat(getComputedStyle(el).fontSize);
    if (!Number.isFinite(max)) return;
    let size = max;
    let loops = 0;
    while (el.scrollWidth > el.clientWidth + 1 && size - stepPx >= minPx && loops < maxLoops) {
      size -= stepPx;
      el.style.fontSize = `${size}px`;
      loops += 1;
    }
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

const initFortune = () => {
  const btn = document.getElementById('fortune-btn');
  const resultNode = document.getElementById('fortune-result');
  const commentNode = document.getElementById('fortune-comment');
  const luckyNode = document.getElementById('fortune-lucky');
  const hintNode = document.getElementById('fortune-hint');

  if (!btn || !resultNode || !commentNode || !luckyNode) return;

  const defaultFortuneData = {
    results: ['吉'],
    fallbackComment: '今日はうんこに気をつけましょう！',
    commentsByResult: {},
    luckyItems: []
  };

  const showFortune = (fortuneData) => {
    const data = fortuneData || defaultFortuneData;
    const randomResult = pickRandom(data.results) || '吉';
    resultNode.textContent = randomResult === '大吉' ? '🌸 大吉 🌸' : randomResult;
    resultNode.style.display = 'block';

    const commentCandidates = data.commentsByResult && data.commentsByResult[randomResult];
    const categories = commentCandidates ? Object.keys(commentCandidates) : [];
    const category = pickRandom(categories);
    const variations = (category && commentCandidates[category]) || [];
    const text = pickRandom(variations) || data.fallbackComment || defaultFortuneData.fallbackComment;

    commentNode.textContent = category ? `${category}：${text}` : text;
    commentNode.style.display = 'block';

    const luckyItem = pickRandom(data.luckyItems);
    luckyNode.textContent = `ラッキーアイテム：${luckyItem || '推しTシャツ'}`;
    luckyNode.style.display = 'block';
  };

  const reveal = (fortuneData) => {
    btn.style.display = 'none';
    if (hintNode) hintNode.style.display = 'none';
    showFortune(fortuneData);
  };

  btn.addEventListener('click', () => {
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    if (hintNode) {
      hintNode.textContent = '読み込み中...';
      hintNode.style.display = 'block';
    }

    const dataPromise = loadFortuneData().catch(() => null);
    const animPromise = (reduceMotionQuery && reduceMotionQuery.matches)
      ? Promise.resolve()
      : new Promise((resolve) => {
        btn.classList.add('animate-out');
        setTimeout(resolve, 300);
      });

    Promise.all([dataPromise, animPromise])
      .then(([fortuneData]) => {
        const resolved = fortuneData || globalThis[fortuneDataKey] || defaultFortuneData;
        reveal(resolved);
      })
      .finally(() => {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
      });
  }, { once: true });
};

const initPage = () => {
  setupThemeToggle();
  initYearStamp();
  initReloadButton();
  setupHeaderAutoFit();
  initAnchorScroll();
  initFortune();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage, { once: true });
} else {
  initPage();
}
})();
