(() => {
  'use strict';

  const DEBUG = false;
  const debugLog = (...args) => {
    if (DEBUG) console.log(...args);
  };
  const debugWarn = (...args) => {
    if (DEBUG) console.warn(...args);
  };

  // RSS/Atom フィード
  const NOTE_FEED_URL = 'https://note.com/shiori_02_14_/rss';
  const QIITA_FEED_URL = 'https://qiita.com/shiori_02_14_/feed.atom';
  const QIITA_USER_ID = 'shiori_02_14_';
  const QIITA_API_URL = `https://qiita.com/api/v2/users/${QIITA_USER_ID}/items`;
  const ZENN_USER_ID = 'shiori_02_14';
  const ZENN_FEED_URL = `https://zenn.dev/${ZENN_USER_ID}/feed`;
  const ZENN_API_URL = `https://zenn.dev/api/articles?username=${ZENN_USER_ID}&order=latest`;
  const articleListCacheStorageKey = '__SHIORI_ARTICLES_CACHE_V1__';
  const articleListCacheTtlMs = 30 * 60 * 1000; // 30分
  
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
  const isFileProtocol = window.location.protocol === 'file:';

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

  const firstNonEmptyArray = (promises) => new Promise((resolve) => {
    let done = false;
    let remaining = promises.length;
    let fallback = [];

    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(Array.isArray(value) ? value : []);
    };

    if (remaining === 0) finish([]);

    promises.forEach((promise) => {
      Promise.resolve(promise)
        .then((value) => {
          const items = Array.isArray(value) ? value : [];
          if (!fallback.length && items.length > 0) {
            fallback = items;
          }
          if (items.length > 0) {
            finish(items);
          }
        })
        .catch(() => {})
        .finally(() => {
          remaining -= 1;
          if (remaining === 0 && !done) {
            finish(fallback);
          }
        });
    });
  });

  const readArticleListCache = () => {
    try {
      const raw = localStorage.getItem(articleListCacheStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const ts = typeof parsed?.ts === 'number' ? parsed.ts : 0;
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      if (!ts || Date.now() - ts > articleListCacheTtlMs) return [];
      return items
        .filter((item) => item && item.link && item.title)
        .map((item) => ({
          title: item.title || '',
          link: item.link || '',
          date: item.date || '',
          dateMs: Number.isFinite(item.dateMs) ? item.dateMs : 0,
          imageUrl: item.imageUrl || '',
          source: item.source || ''
        }));
    } catch (_) {
      return [];
    }
  };

  const saveArticleListCache = (articles) => {
    try {
      const items = (Array.isArray(articles) ? articles : [])
        .slice(0, 30)
        .map((item) => ({
          title: item?.title || '',
          link: item?.link || '',
          date: item?.date || '',
          dateMs: Number.isFinite(item?.dateMs) ? item.dateMs : 0,
          imageUrl: item?.imageUrl || '',
          source: item?.source || ''
        }))
        .filter((item) => item.link && item.title);
      localStorage.setItem(articleListCacheStorageKey, JSON.stringify({
        ts: Date.now(),
        items
      }));
    } catch (_) {
      // ignore
    }
  };

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

  const parseItemDate = (item) => {
    const raw = item?.pubDate || item?.published || item?.updated || item?.created || '';
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return { dateMs: 0, dateText: '' };
    return { dateMs: date.getTime(), dateText: formatDate(date) };
  };

  // Qiita API v2 で記事を直接取得（認証不要・JSONで安定）
  const fetchQiitaItemsViaAPI = async () => {
    const apiUrl = QIITA_API_URL + '?per_page=20';
    const tryDirect = async () => {
      const res = await fetchWithTimeout(apiUrl, { timeoutMs: 6000 });
      if (!res.ok) throw new Error(`Qiita API error: ${res.status}`);
      return res.json();
    };

    const tryViaProxy = async () => {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`;
      const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 8000 });
      if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
      return res.json();
    };

    try {
      const items = await tryDirect();
      return normalizeQiitaApiItems(items);
    } catch (e1) {
      debugWarn('Qiita API direct fetch failed, trying proxy:', e1);
      try {
        const items = await tryViaProxy();
        return normalizeQiitaApiItems(items);
      } catch (e2) {
        debugWarn('Qiita API proxy fetch failed:', e2);
        return [];
      }
    }
  };

  // Zenn API で記事を取得（失敗時はプロキシをフォールバック）
  const fetchZennItemsViaAPI = async () => {
    const tryDirect = async () => {
      const res = await fetchWithTimeout(ZENN_API_URL, { timeoutMs: 6000 });
      if (!res.ok) throw new Error(`Zenn API error: ${res.status}`);
      return res.json();
    };

    const tryViaProxy = async () => {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ZENN_API_URL)}`;
      const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 8000 });
      if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
      return res.json();
    };

    try {
      const payload = await tryDirect();
      return normalizeZennApiItems(payload);
    } catch (e1) {
      debugWarn('Zenn API direct fetch failed, trying proxy:', e1);
      try {
        const payload = await tryViaProxy();
        return normalizeZennApiItems(payload);
      } catch (e2) {
        debugWarn('Zenn API proxy fetch failed:', e2);
        return [];
      }
    }
  };

  // Qiita Atom をプロキシ経由で取得してパース（RSS2JSONはQiita形式で空になるため）
  const CORS_PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  const fetchQiitaViaAtomRaw = async () => {
    for (const toProxyUrl of CORS_PROXIES) {
      try {
        const proxyUrl = toProxyUrl(QIITA_FEED_URL);
        const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 5000 });
        if (!res.ok) continue;
        const xmlText = await res.text();
        if (!xmlText || xmlText.length < 100) continue;
        const items = parseAtomFeed(xmlText, 'qiita');
        if (items.length > 0) return items;
      } catch (e) {
        debugWarn('Qiita Atom proxy failed:', e);
      }
    }
    return [];
  };

  const parseAtomFeed = (xmlText, source) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const entries = doc.querySelectorAll('entry');
    if (!entries.length) return [];

    return Array.from(entries).map((entry) => {
      const title = entry.querySelector('title')?.textContent?.trim() || '';
      const linkEl = entry.querySelector('link[href]');
      const link = linkEl?.getAttribute('href') || entry.querySelector('id')?.textContent || '';
      const rawDate = entry.querySelector('updated')?.textContent || entry.querySelector('published')?.textContent || '';
      const { dateMs, dateText } = parseItemDate({ updated: rawDate, published: rawDate });

      let imageUrl = '';
      const content = entry.querySelector('content')?.textContent || entry.querySelector('summary')?.textContent || '';
      if (content) {
        const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i) || content.match(/src=["']([^"']+)["']/i);
        if (imgMatch && imgMatch[1]) {
          imageUrl = imgMatch[1].replace(/&amp;/g, '&');
          if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
        }
      }

      return { title, link, date: dateText, dateMs, imageUrl, source };
    }).filter((a) => a.link && a.title);
  };

  const normalizeQiitaApiItems = (items) => {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      const { dateMs, dateText } = parseItemDate({ created: item.created_at });
      let imageUrl = '';
      const html = item.rendered_body || '';
      const md = item.body || '';
      if (html) {
        const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch && imgMatch[1]) {
          imageUrl = imgMatch[1].replace(/&amp;/g, '&');
          if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
        }
      }
      if (!imageUrl && md) {
        const mdImgMatch = md.match(/!\[.*?\]\((https?:\/\/[^)\s]+)\)/);
        if (mdImgMatch && mdImgMatch[1]) imageUrl = mdImgMatch[1];
      }
      return {
        title: item.title || '',
        link: item.url || '',
        date: dateText,
        dateMs,
        imageUrl,
        source: 'qiita'
      };
    });
  };

  const normalizeZennApiItems = (payload) => {
    const items = Array.isArray(payload?.articles) ? payload.articles : [];
    return items.map((item) => {
      const { dateMs, dateText } = parseItemDate({
        created: item.published_at || item.body_updated_at
      });

      const rawPath = typeof item.path === 'string' && item.path
        ? item.path
        : (item.slug ? `/${ZENN_USER_ID}/articles/${item.slug}` : '');
      const link = rawPath ? `https://zenn.dev${rawPath}` : '';

      return {
        title: item.title || '',
        link,
        date: dateText,
        dateMs,
        imageUrl: '',
        source: 'zenn'
      };
    }).filter((item) => item.link && item.title);
  };

  const normalizeRss2JsonItems = (data, source) => {
    if (!data?.items || !Array.isArray(data.items)) return [];
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
      
      const { dateMs, dateText } = parseItemDate(item);

      return {
        title: item.title || '',
        link: item.link || item.guid || '',
        date: dateText,
        dateMs,
        imageUrl: imageUrl, // 空の場合は後で取得
        description: item.description || '',
        source: source || 'rss'
      };
    });
  };

  const fetchFeedItemsViaJsonp = (feedUrlRaw, source) => new Promise((resolve) => {
    if (!feedUrlRaw || !RSS_PROXY.includes('rss2json')) {
      resolve([]);
      return;
    }

    const callbackName = `__shioriRss2Jsonp_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const feedUrl = `${RSS_PROXY}${encodeURIComponent(feedUrlRaw)}&callback=${callbackName}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      try {
        delete window[callbackName];
      } catch (_) {
        window[callbackName] = undefined;
      }
      script.remove();
    };

    const finish = (items) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timerId);
      cleanup();
      resolve(Array.isArray(items) ? items : []);
    };

    const timerId = window.setTimeout(() => finish([]), 5000);

    window[callbackName] = (data) => {
      debugLog('rss2json jsonp items:', Array.isArray(data?.items) ? data.items.length : 0);
      finish(normalizeRss2JsonItems(data, source));
    };

    script.async = true;
    script.src = feedUrl;
    script.onerror = () => finish([]);
    document.head.appendChild(script);
  });

  // RSS/Atomフィードを取得してパース
  const fetchFeedItems = async (feedUrlRaw, source) => {
    try {
      if (!feedUrlRaw) return [];
      const feedUrl = RSS_PROXY ? `${RSS_PROXY}${encodeURIComponent(feedUrlRaw)}` : feedUrlRaw;
      
      // RSS2JSONを使う場合
      if (RSS_PROXY.includes('rss2json')) {
        if (isFileProtocol) {
          return await fetchFeedItemsViaJsonp(feedUrlRaw, source);
        }

        const response = await fetchWithTimeout(feedUrl, { timeoutMs: 5000 });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        debugLog('rss2json items:', Array.isArray(data.items) ? data.items.length : 0);
        return normalizeRss2JsonItems(data, source);
      }
      
      // 直接RSSを取得する場合
      const response = await fetchWithTimeout(feedUrl, { timeoutMs: 5000 });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const xmlText = await response.text();
      return parseRSS(xmlText).map((entry) => ({
        ...entry,
        dateMs: entry.date ? new Date(entry.date).getTime() : 0,
        source: source || 'rss'
      }));
    } catch (error) {
      console.error(`RSS取得エラー(${source || 'rss'}):`, error);
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
    if (article.source) {
      li.setAttribute('data-source', article.source);
    }
    
    const link = document.createElement('a');
    link.className = 'card__link';
    link.href = article.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    // バッジ
    const badgeConfigBySource = {
      note: { label: 'note', className: 'badge--note' },
      qiita: { label: 'QIITA', className: 'badge--qiita' },
      zenn: { label: 'ZENN', className: 'badge--zenn' }
    };
    const badgeConfig = badgeConfigBySource[article.source] || { label: 'ARTICLE', className: 'badge--source' };

    const badge = document.createElement('span');
    badge.className = `badge ${badgeConfig.className} badge--corner`;
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = badgeConfig.label;
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

  const mergeAndSortArticles = (articles) => {
    const seenLinks = new Set();
    return (Array.isArray(articles) ? articles : [])
      .filter((item) => item && item.link && item.title)
      .filter((item) => {
        if (seenLinks.has(item.link)) return false;
        seenLinks.add(item.link);
        return true;
      })
      .sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
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

  let articleSizeSyncInitialized = false;

  const renderArticlesToContainers = (articles) => {
    const merged = mergeAndSortArticles(articles);
    if (merged.length === 0) return [];

    // Articlesページ（縦リスト）
    if (articlesPageContainer) {
      const latestArticles = merged.slice(0, 10);
      const existing = Array.from(articlesPageContainer.querySelectorAll('.card--article:not([data-rss])'));
      displayArticles(articlesPageContainer, latestArticles, { mode: 'insertBeforeExisting', existingArticles: existing, enableSizeSync: true });

      const activeTab = document.querySelector('.articles-filter__tab[aria-selected="true"]');
      const activeFilter = activeTab?.getAttribute('data-filter') || 'all';
      const allCards = articlesPageContainer.querySelectorAll('.card--article');
      allCards.forEach((card) => {
        if (activeFilter === 'all') {
          card.style.display = '';
          return;
        }
        const source = card.getAttribute('data-source');
        card.style.display = source === activeFilter ? '' : 'none';
      });
      updateEmptyState(articlesPageContainer, activeFilter);

      if (!articleSizeSyncInitialized) {
        const schedule = () => scheduleSyncArticleCardMinHeight(articlesPageContainer);
        window.addEventListener('resize', schedule, { passive: true });
        if ('fonts' in document && document.fonts && document.fonts.ready) {
          document.fonts.ready.then(schedule).catch(() => {});
        }
        articleSizeSyncInitialized = true;
      }
    }

    // トップページ（横スクロール）
    if (homeArticlesContainer) {
      const latestHome = merged.slice(0, 10);
      displayArticles(homeArticlesContainer, latestHome, { mode: 'replaceAll' });
    }

    return merged;
  };

  // 初期化
  const init = async () => {
    const cachedArticles = readArticleListCache();
    if (cachedArticles.length > 0) {
      renderArticlesToContainers(cachedArticles);
    }

    const sourceArticles = {
      note: [],
      qiita: [],
      zenn: []
    };

    const renderAndCache = () => {
      const rendered = renderArticlesToContainers([
        ...sourceArticles.note,
        ...sourceArticles.qiita,
        ...sourceArticles.zenn
      ]);
      if (rendered.length > 0) {
        saveArticleListCache(rendered);
      }
      return rendered;
    };

    const noteTask = fetchFeedItems(NOTE_FEED_URL, 'note')
      .then((items) => {
        sourceArticles.note = Array.isArray(items) ? items : [];
        renderAndCache();
      })
      .catch((error) => {
        sourceArticles.note = [];
        debugWarn('note fetch failed:', error);
      });

    const qiitaTask = firstNonEmptyArray([
      fetchQiitaItemsViaAPI(),
      fetchQiitaViaAtomRaw(),
      fetchFeedItems(QIITA_FEED_URL, 'qiita')
    ])
      .then((items) => {
        sourceArticles.qiita = Array.isArray(items) ? items : [];
        renderAndCache();
      })
      .catch((error) => {
        sourceArticles.qiita = [];
        debugWarn('qiita fetch failed:', error);
      });

    const zennTask = firstNonEmptyArray([
      fetchZennItemsViaAPI(),
      fetchFeedItems(ZENN_FEED_URL, 'zenn')
    ])
      .then((items) => {
        sourceArticles.zenn = Array.isArray(items) ? items : [];
        renderAndCache();
      })
      .catch((error) => {
        sourceArticles.zenn = [];
        debugWarn('zenn fetch failed:', error);
      });

    await Promise.allSettled([noteTask, qiitaTask, zennTask]);

    const finalArticles = renderAndCache();
    if (finalArticles.length === 0 && cachedArticles.length === 0) {
      console.warn('RSSから記事を取得できませんでした');
    }
  };

  // 空の状態メッセージを表示/非表示
  const updateEmptyState = (articlesList, filter) => {
    // 既存の空の状態メッセージを削除
    const existingEmpty = articlesList.querySelector('.articles-empty');
    if (existingEmpty) {
      existingEmpty.remove();
    }

    // 表示されている記事数をカウント
    const allCards = articlesList.querySelectorAll('.card--article');
    let visibleCount = 0;
    allCards.forEach(card => {
      if (card.style.display !== 'none') {
        visibleCount++;
      }
    });

    // 記事が0件の場合、メッセージを表示
    if (visibleCount === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'articles-empty';
      
      if (filter === 'qiita') {
        emptyDiv.innerHTML = '<p class="articles-empty__text">まだ記事何もないです<br>毎日投稿で何か書きたいです</p>';
      } else if (filter === 'zenn') {
        emptyDiv.innerHTML = '<p class="articles-empty__text">Zennの記事がまだありません</p>';
      } else {
        emptyDiv.innerHTML = '<p class="articles-empty__text">記事がありません</p>';
      }
      
      articlesList.appendChild(emptyDiv);
    }
  };

  // フィルタリング機能（Articlesページのみ）
  const setupArticleFilter = () => {
    const filterTabs = document.querySelectorAll('.articles-filter__tab');
    const articlesList = document.getElementById('articles-list');
    if (!filterTabs.length || !articlesList) return;

    // 初期状態で「全て」タブをアクティブにする
    const allTab = document.getElementById('filter-all');
    if (allTab) {
      allTab.classList.add('articles-filter__tab--active');
    }

    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const filter = tab.getAttribute('data-filter');
        
        // タブの状態を更新
        filterTabs.forEach(t => {
          t.setAttribute('aria-selected', 'false');
          t.classList.remove('articles-filter__tab--active');
        });
        tab.setAttribute('aria-selected', 'true');
        tab.classList.add('articles-filter__tab--active');

        // 記事をフィルタリング
        const allCards = articlesList.querySelectorAll('.card--article');
        allCards.forEach(card => {
          if (filter === 'all') {
            card.style.display = '';
          } else {
            const source = card.getAttribute('data-source');
            card.style.display = source === filter ? '' : 'none';
          }
        });

        // 空の状態メッセージを更新
        updateEmptyState(articlesList, filter);

        // カードの高さを再同期
        scheduleSyncArticleCardMinHeight(articlesList);
      });
    });

    // 初期状態でも空の状態をチェック
    setTimeout(() => {
      updateEmptyState(articlesList, 'all');
    }, 100);
  };

  // ページ読み込み時に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      setupArticleFilter();
    });
  } else {
    init();
    setupArticleFilter();
  }
})();

