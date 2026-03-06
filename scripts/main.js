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

  if (!btn || !resultNode || !commentNode || !luckyNode) return;

  const defaultFortuneData = {
    results: ['吉'],
    fallbackComment: '今日はうんこに気をつけましょう！',
    commentsByResult: {},
    luckyItems: []
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
    const finalResult = randomResult === '大吉' ? '🌸 大吉 🌸' : randomResult;

    const commentCandidates = data.commentsByResult && data.commentsByResult[randomResult];
    const categories = commentCandidates ? Object.keys(commentCandidates) : [];
    const category = pickRandom(categories);
    const variations = (category && commentCandidates[category]) || [];
    const text = pickRandom(variations) || data.fallbackComment || defaultFortuneData.fallbackComment;

    commentNode.textContent = category ? `${category}：${text}` : text;

    const luckyItem = pickRandom(data.luckyItems);
    luckyNode.textContent = `ラッキーアイテム：${luckyItem || '推しTシャツ'}`;

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
          const item = randomItem === '大吉' ? '🌸 大吉 🌸' : randomItem;
          reelItems.push(item);
          if (i === 0) firstItems.push(item);
        }
        
        // 中間部分：徐々に最終結果に近づく
        for (let i = 0; i < 5; i++) {
          const randomItem = pickRandom(allResults);
          reelItems.push(randomItem === '大吉' ? '🌸 大吉 🌸' : randomItem);
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
        const spinDuration = 1800; // 高速回転1.8秒
        const slowDuration = 600; // 減速0.6秒
        
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
            }, 300);
            
            // ラッキーアイテムを表示
            setTimeout(() => {
              luckyNode.style.display = 'block';
              luckyNode.classList.add('fortune-reveal');
            }, 600);
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
        }, 500);
        
        setTimeout(() => {
          luckyNode.style.display = 'block';
          luckyNode.classList.add('fortune-reveal');
        }, 900);
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
    const activeBtn = btn.style.display !== 'none' ? btn : retryBtn;
    if (activeBtn) {
      activeBtn.setAttribute('aria-busy', 'true');
      activeBtn.disabled = true;
    }

    if (hintNode) {
      // 読み込み中のテキストを変化させる
      let loadingTextIndex = 0;
      const loadingTexts = [
        'おみくじを引いています...',
        '運勢を占っています...',
        '結果が出るまであと少し...',
        '運命の扉が開きます...'
      ];
      
      hintNode.textContent = loadingTexts[0];
      hintNode.style.display = 'block';
      hintNode.classList.add('fortune-loading');
      
      const loadingInterval = setInterval(() => {
        loadingTextIndex = (loadingTextIndex + 1) % loadingTexts.length;
        hintNode.textContent = loadingTexts[loadingTextIndex];
      }, 400);
      
      // 結果表示時にクリア
      setTimeout(() => {
        clearInterval(loadingInterval);
      }, 2000);
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
      // スロットコンテナのクラスもリセット
      const slotContainer = slotReel.parentElement;
      if (slotContainer) {
        slotContainer.classList.remove('fortune-slot-stopped');
      }
    }
    const resultText = resultNode?.querySelector('.fortune-result-text');
    if (resultText) {
      resultText.style.display = 'none';
      resultText.textContent = '';
      resultText.classList.remove('fortune-reveal');
    }
    commentNode.style.display = 'none';
    commentNode.classList.remove('fortune-reveal');
    luckyNode.style.display = 'none';
    luckyNode.classList.remove('fortune-reveal');
    
    // 「もう一度」ボタンを非表示にする
    if (retryBtn) {
      retryBtn.style.display = 'none';
    }

    const dataPromise = loadFortuneData().catch(() => null);
    const animPromise = (reduceMotionQuery && reduceMotionQuery.matches)
      ? Promise.resolve()
      : new Promise((resolve) => {
        if (btn.style.display !== 'none') {
          btn.classList.add('animate-out');
          setTimeout(resolve, 300);
        } else {
          resolve();
        }
      });

    // 演出のため、少し待ってから結果を表示（期待感を高めるため）
    const revealDelay = (reduceMotionQuery && reduceMotionQuery.matches) ? 0 : 800;

    Promise.all([dataPromise, animPromise])
      .then(([fortuneData]) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            const resolved = fortuneData || globalThis[fortuneDataKey] || defaultFortuneData;
            reveal(resolved);
            if (hintNode) {
              hintNode.classList.remove('fortune-loading');
              hintNode.style.display = 'none';
            }
            resolve();
          }, revealDelay);
        });
      })
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
  
  // 「もう一度」ボタンでもおみくじを引けるようにする
  if (retryBtn) {
    retryBtn.addEventListener('click', drawFortune);
  }

  // 結果部分のクリックは無効化（ボタンのみクリック可能）
  // コンテナ全体のクリックイベントは削除
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
      if (filter === 'all') {
        card.style.display = '';
        return;
      }
      const type = card.getAttribute('data-work-type');
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

const initPage = () => {
  applyReducedEffectsHint();
  setupThemeToggle();
  initYearStamp();
  initReloadButton();
  setupHeaderAutoFit();
  initAnchorScroll();
  initScrollReveal();
  initScrollProgress();
  initFortune();
  initWorksFilter();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage, { once: true });
} else {
  initPage();
}
})();
