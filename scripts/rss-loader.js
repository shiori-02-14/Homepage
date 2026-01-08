(() => {
  'use strict';

  const DEBUG = false;
  const debugLog = (...args) => {
    if (DEBUG) console.log(...args);
  };
  const debugWarn = (...args) => {
    if (DEBUG) console.warn(...args);
  };

  // RSSフィードのURL（NoteのRSSフィード）
  const RSS_FEED_URL = 'https://note.com/shiori_02_14_/rss';
  
  // CORSプロキシ（必要に応じて変更可能）
  // オプション1: RSS2JSON（無料プランあり）- 現在有効
  const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';
  
  // オプション2: CORS Anywhere（開発用、本番では使わない）
  // const RSS_PROXY = 'https://cors-anywhere.herokuapp.com/';
  
  // オプション3: 直接取得（CORSが許可されている場合）
  // const RSS_PROXY = '';

  // 記事を表示するコンテナ（Articlesページ / トップページ）
  const articlesPageContainer = document.querySelector('#articles-page .cards');
  const homeArticlesContainer = document.querySelector('#top [data-rss="home-articles"]');
  if (!articlesPageContainer && !homeArticlesContainer) return;

  // サムネ取得は遅くなりがちなので、localStorageでキャッシュ（再訪問で爆速に）
  const thumbCacheStorageKey = '__SHIORI_NOTE_EYECATCH_CACHE_V1__';
  const thumbCacheTtlMs = 7 * 24 * 60 * 60 * 1000; // 7日
  const thumbCache = (() => {
    try {
      const raw = localStorage.getItem(thumbCacheStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  })();

  const saveThumbCache = () => {
    try {
      localStorage.setItem(thumbCacheStorageKey, JSON.stringify(thumbCache));
    } catch (_) {
      // ignore
    }
  };

  const normalizeThumbnailUrl = (url) => {
    if (!url) return '';
    let next = String(url);

    // noteのサムネはデカいので width を落として軽量化（体感速度が大きく上がる）
    if (next.includes('assets.st-note.com') && /[?&]width=\d+/.test(next)) {
      next = next.replace(/([?&]width=)\d+/, '$1640');
    } else if (next.includes('assets.st-note.com') && !next.includes('width=')) {
      next += (next.includes('?') ? '&' : '?') + 'width=640';
    }

    return next;
  };

  const getCachedEyecatch = (noteKey) => {
    const entry = thumbCache?.[noteKey];
    if (!entry || typeof entry !== 'object') return '';
    const url = typeof entry.url === 'string' ? entry.url : '';
    const ts = typeof entry.ts === 'number' ? entry.ts : 0;
    if (!url || !ts) return '';
    if (Date.now() - ts > thumbCacheTtlMs) return '';
    return url;
  };

  const setCachedEyecatch = (noteKey, url) => {
    if (!noteKey || !url) return;
    thumbCache[noteKey] = { url, ts: Date.now() };
    saveThumbCache();
  };

  const fetchWithTimeout = async (url, { timeoutMs = 8000 } = {}) => {
    const controller = new AbortController();
    const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      window.clearTimeout(timerId);
    }
  };

  const extractNoteKey = (url) => {
    if (!url) return '';
    const match = String(url).match(/note\.com\/[^\/]+\/n\/([^\/\?]+)/);
    return match?.[1] || '';
  };

  const firstTruthy = (promises) => new Promise((resolve) => {
    let done = false;
    let remaining = promises.length;

    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    if (remaining === 0) finish('');

    promises.forEach((promise) => {
      Promise.resolve(promise)
        .then((value) => {
          if (value) finish(value);
        })
        .catch(() => {})
        .finally(() => {
          remaining -= 1;
          if (remaining === 0 && !done) finish('');
        });
    });
  });

  const fetchNoteEyecatch = async (noteKey) => {
    if (!noteKey) return '';
    const cached = getCachedEyecatch(noteKey);
    if (cached) return cached;

    const apiUrl = `https://note.com/api/v3/notes/${noteKey}`;

    // 遅い原因：失敗→別経路…を順番待ちしていたので、最短で取れた経路を採用（並列）
    const tryDirect = (async () => {
      try {
        const res = await fetchWithTimeout(apiUrl, { timeoutMs: 3500 });
        if (!res.ok) return '';
        const json = await res.json();
        const eyecatch = json?.data?.eyecatch;
        return typeof eyecatch === 'string' ? normalizeThumbnailUrl(eyecatch) : '';
      } catch (error) {
        debugWarn('note api direct fetch failed:', error);
        return '';
      }
    })();

    const tryJina = (async () => {
      try {
        const jinaUrl = `https://r.jina.ai/${apiUrl}`;
        const res = await fetchWithTimeout(jinaUrl, { timeoutMs: 4500 });
        if (!res.ok) return '';
        const text = await res.text();
        const marker = 'Markdown Content:';
        const markerIndex = text.indexOf(marker);
        const candidate = markerIndex === -1 ? text : text.slice(markerIndex + marker.length);
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return '';
        const jsonStr = candidate.slice(start, end + 1).trim();
        const json = JSON.parse(jsonStr);
        const eyecatch = json?.data?.eyecatch;
        return typeof eyecatch === 'string' ? normalizeThumbnailUrl(eyecatch) : '';
      } catch (error) {
        debugWarn('r.jina.ai failed:', error);
        return '';
      }
    })();

    const tryAllOriginsRaw = (async () => {
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`;
        const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 4500 });
        if (!res.ok) return '';
        const text = await res.text();
        const json = JSON.parse(text);
        const eyecatch = json?.data?.eyecatch;
        return typeof eyecatch === 'string' ? normalizeThumbnailUrl(eyecatch) : '';
      } catch (error) {
        debugWarn('allorigins raw failed:', error);
        return '';
      }
    })();

    const eyecatch = await firstTruthy([tryDirect, tryJina, tryAllOriginsRaw]);
    if (eyecatch) setCachedEyecatch(noteKey, eyecatch);
    return eyecatch;
  };

  const setThumbImage = (thumbEl, imageUrl, title) => {
    if (!thumbEl || !imageUrl) return;
    if (thumbEl.querySelector('img')) return;

    thumbEl.classList.remove('card__thumb--placeholder');

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = `${title || '記事'}のサムネ`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      thumbEl.classList.add('card__thumb--placeholder');
      img.remove();
    };

    thumbEl.appendChild(img);
  };

  // RSSフィードを取得してパース
  const fetchRSSFeed = async () => {
    try {
      const feedUrl = RSS_PROXY ? `${RSS_PROXY}${encodeURIComponent(RSS_FEED_URL)}` : RSS_FEED_URL;
      
      // RSS2JSONを使う場合
      if (RSS_PROXY.includes('rss2json')) {
        const response = await fetchWithTimeout(feedUrl, { timeoutMs: 8000 });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        debugLog('rss2json items:', Array.isArray(data.items) ? data.items.length : 0);
        
        // RSS2JSONのレスポンス形式に合わせて変換
        if (data.items && Array.isArray(data.items)) {
          return data.items.map(item => {
            // 画像URLを複数の方法で取得
            let imageUrl = '';
            
            // 1. enclosureから取得
            if (item.enclosure) {
              if (typeof item.enclosure === 'string') {
                imageUrl = item.enclosure;
              } else if (item.enclosure.link) {
                imageUrl = item.enclosure.link;
              } else if (item.enclosure.url) {
                imageUrl = item.enclosure.url;
              }
            }
            
            // 2. thumbnailから取得
            if (!imageUrl && item.thumbnail) {
              imageUrl = item.thumbnail;
            }
            
            // 3. descriptionのHTMLから画像を抽出（複数のパターンに対応）
            if (!imageUrl && item.description) {
              // より柔軟な画像抽出パターン
              // パターン1: src="..." または src='...'
              let imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (!imgMatch) {
                // パターン2: src=... (クォートなし)
                imgMatch = item.description.match(/<img[^>]+src=([^\s>]+)/i);
              }
              if (!imgMatch) {
                // パターン3: data-srcやdata-originalなど
                imgMatch = item.description.match(/<img[^>]+(?:data-src|data-original)=["']([^"']+)["']/i);
              }
              if (imgMatch && imgMatch[1]) {
                imageUrl = imgMatch[1].replace(/["']/g, '').trim();
                // HTMLエンティティをデコード
                imageUrl = imageUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                // 相対URLの場合は絶対URLに変換
                if (imageUrl.startsWith('//')) {
                  imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                  imageUrl = 'https://note.com' + imageUrl;
                }
                // Noteの画像URLの正規化（widthパラメータを追加して高解像度画像を取得）
                if (imageUrl.includes('assets.st-note.com') && !imageUrl.includes('width=')) {
                  imageUrl += (imageUrl.includes('?') ? '&' : '?') + 'width=640';
                }
              }
            }
            
            // 4. contentから取得（RSS2JSONのcontentフィールド）
            if (!imageUrl && item.content) {
              let imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (!imgMatch) {
                imgMatch = item.content.match(/<img[^>]+src=([^\s>]+)/i);
              }
              if (imgMatch && imgMatch[1]) {
                imageUrl = imgMatch[1].replace(/["']/g, '');
                if (imageUrl.startsWith('//')) {
                  imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                  imageUrl = 'https://note.com' + imageUrl;
                }
              }
            }
            
            // 5. 画像URLが見つからない場合、記事URLからOGP画像を取得（非同期）
            // ただし、ここでは一旦空にして、後で取得する
            
            return {
              title: item.title || '',
              link: item.link || '',
              date: item.pubDate ? formatDate(new Date(item.pubDate)) : '',
              imageUrl: imageUrl, // 空の場合は後でOGPから取得
              description: item.description || ''
            };
          });
        }
        return [];
      }
      
      // 直接RSSを取得する場合
      const response = await fetchWithTimeout(feedUrl, { timeoutMs: 8000 });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const xmlText = await response.text();
      return parseRSS(xmlText);
    } catch (error) {
      console.error('RSS取得エラー:', error);
      return [];
    }
  };

  // RSS XMLをパース
  const parseRSS = (xmlText) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const items = xmlDoc.querySelectorAll('item');
    
    return Array.from(items).map(item => {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const description = item.querySelector('description')?.textContent || '';
      
      // 画像URLを抽出（descriptionから）
      const imgMatch = description.match(/<img[^>]+src="([^"]+)"/i);
      const imageUrl = imgMatch ? imgMatch[1] : '';
      
      // 日付をフォーマット
      const date = pubDate ? formatDate(new Date(pubDate)) : '';
      
      return { title, link, date, imageUrl, description };
    });
  };

  // 日付をフォーマット（YYYY/MM/DD）
  const formatDate = (date) => {
    if (!date || isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  // 記事カードを生成
  const createArticleCard = (article) => {
    const li = document.createElement('li');
    li.className = 'card card--article';
    li.setAttribute('data-rss', 'true');
    
    const link = document.createElement('a');
    link.className = 'card__link';
    link.href = article.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    // バッジ
    const badge = document.createElement('span');
    badge.className = 'badge badge--note badge--corner';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = 'NOTE';
    link.appendChild(badge);
    
    // サムネイル
    const thumb = document.createElement('div');
    thumb.className = 'card__thumb';
    
    if (article.imageUrl && article.imageUrl.trim() !== '') {
      const img = document.createElement('img');
      img.src = article.imageUrl;
      img.alt = `${article.title}のサムネ`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = function() {
        // 画像の読み込みに失敗した場合はプレースホルダーに変更
        console.warn('画像の読み込みに失敗:', article.imageUrl);
        thumb.className = 'card__thumb card__thumb--placeholder';
        thumb.removeChild(img);
      };
      thumb.appendChild(img);
    } else {
      thumb.className += ' card__thumb--placeholder';
    }
    
    link.appendChild(thumb);
    
    // コンテンツ
    const content = document.createElement('div');
    content.className = 'card__content';
    
    if (article.date) {
      const time = document.createElement('time');
      time.className = 'card__date';
      time.setAttribute('datetime', article.date.replace(/\//g, '-'));
      time.textContent = article.date;
      content.appendChild(time);
    }
    
    const h3 = document.createElement('h3');
    h3.textContent = article.title;
    content.appendChild(h3);
    
    link.appendChild(content);
    li.appendChild(link);
    
    return li;
  };

  // カードのサイズを「3つ目（= Coming soonのカード想定）」に合わせて統一（主に高さ）
  // - 参照: 最初の .card--article.card--upcoming（通常 RSS の後＝3つ目）
  // - 他のカードは min-height で揃える（長いタイトルで高くなるカードはそのまま）
  let syncCardsRafId = 0;
  const syncArticleCardMinHeight = (container) => {
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('.card--article'));
    if (cards.length === 0) return;

    // 既存の min-height をクリアして、参照カードの自然な高さを測る
    cards.forEach((card) => {
      card.style.removeProperty('min-height');
    });

    const reference = container.querySelector('.card--article.card--upcoming') || cards[0];
    const targetHeight = Math.round(reference.getBoundingClientRect().height);
    if (!targetHeight || targetHeight < 1) return;

    cards.forEach((card) => {
      if (card === reference) return;
      card.style.minHeight = `${targetHeight}px`;
    });
  };

  const scheduleSyncArticleCardMinHeight = (container) => {
    if (!container) return;
    if (syncCardsRafId) cancelAnimationFrame(syncCardsRafId);
    syncCardsRafId = requestAnimationFrame(() => {
      syncCardsRafId = 0;
      syncArticleCardMinHeight(container);
    });
  };

  // 記事を表示
  const displayArticles = (container, articles, { mode = 'insertBeforeExisting', existingArticles = [], enableSizeSync = false } = {}) => {
    if (!container) return;
    // 既存のRSS記事を削除
    const existingRSSArticles = container.querySelectorAll('[data-rss="true"]');
    existingRSSArticles.forEach(el => el.remove());

    if (mode === 'replaceAll') {
      container.innerHTML = '';
    }

    // 新しい記事を追加（既存の記事の前に挿入）
    const firstExisting = mode === 'insertBeforeExisting' ? (existingArticles[0] || null) : null;
    const notesToHydrate = new Map(); // noteKey -> { title, thumbEls: [] }

    articles.forEach(article => {
      const card = createArticleCard(article);
      if (firstExisting && firstExisting.parentNode) {
        firstExisting.parentNode.insertBefore(card, firstExisting);
      } else {
        container.appendChild(card);
      }

      if (!article.imageUrl) {
        const noteKey = extractNoteKey(article.link);
        const thumbEl = card.querySelector('.card__thumb');
        if (noteKey && thumbEl) {
          const existing = notesToHydrate.get(noteKey) || { title: article.title, thumbEls: [] };
          existing.thumbEls.push(thumbEl);
          notesToHydrate.set(noteKey, existing);
        }
      }
    });

    // 先に高さを揃えてからサムネを後追いで入れる
    if (enableSizeSync) {
      scheduleSyncArticleCardMinHeight(container);
    }

    // サムネは後から（UI表示をブロックしない）
    if (notesToHydrate.size > 0) {
      const entries = Array.from(notesToHydrate.entries()).map(([noteKey, value]) => ({
        noteKey,
        title: value.title,
        thumbEls: value.thumbEls
      }));
      const concurrency = 4;
      let index = 0;

      const worker = async () => {
        while (index < entries.length) {
          const current = entries[index];
          index += 1;

          try {
            const eyecatch = await fetchNoteEyecatch(current.noteKey);
            if (eyecatch) {
              current.thumbEls.forEach((thumbEl) => setThumbImage(thumbEl, eyecatch, current.title));
            }
          } catch (error) {
            debugWarn('thumbnail hydrate failed:', error);
          }
        }
      };

      void Promise.allSettled(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
    }
  };

  // 初期化
  const init = async () => {
    const articles = await fetchRSSFeed();
    if (articles.length > 0) {
      // Articlesページ（縦リスト）
      if (articlesPageContainer) {
        const latestArticles = articles.slice(0, 10);
        const existing = Array.from(articlesPageContainer.querySelectorAll('.card--article:not([data-rss])'));
        displayArticles(articlesPageContainer, latestArticles, { mode: 'insertBeforeExisting', existingArticles: existing, enableSizeSync: true });

        // リサイズやフォントロード後も崩れないように再計算（Articlesページのみ）
        const schedule = () => scheduleSyncArticleCardMinHeight(articlesPageContainer);
        window.addEventListener('resize', schedule, { passive: true });
        if ('fonts' in document && document.fonts && document.fonts.ready) {
          document.fonts.ready.then(schedule).catch(() => {});
        }
      }

      // トップページ（横スクロール）：RSS記事のみ表示
      if (homeArticlesContainer) {
        const latestHome = articles.slice(0, 10);
        displayArticles(homeArticlesContainer, latestHome, { mode: 'replaceAll' });
      }
    } else {
      console.warn('RSSから記事を取得できませんでした');
    }
  };

  // ページ読み込み時に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

