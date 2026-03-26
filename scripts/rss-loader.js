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
  const PREVIEW_DEFAULT_AUTHOR = 'しおり🔖';
  const PREVIEW_FALLBACK_AVATAR = 'https://i.pinimg.com/736x/59/0c/a0/590ca0a7e1027cea004f6313ca834456.jpg';
  const articleListCacheStorageKey = '__SHIORI_ARTICLES_CACHE_V2__';
  const articleListCacheTtlMs = 30 * 60 * 1000; // 30分
  
  // CORSプロキシ（必要に応じて変更可能）
  // オプション1: RSS2JSON（無料プランあり）- 現在有効
  const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';
  
  // オプション2: CORS Anywhere（開発用、本番では使わない）
  // const RSS_PROXY = 'https://cors-anywhere.herokuapp.com/';
  
  // オプション3: 直接取得（CORSが許可されている場合）
  // const RSS_PROXY = '';

  // 記事を表示するコンテナ（Articlesページ / トップページ）
  // ホームは #top 配下に限定しない（body の id 変更・テンプレ差で取りこぼさない）
  const articlesPageContainer = document.querySelector('#articles-page .cards, #articles-list.cards');
  const homeArticlesContainer = document.querySelector('[data-rss="home-articles"]');
  if (!articlesPageContainer && !homeArticlesContainer) return;
  const isFileProtocol = window.location.protocol === 'file:';
  const canUseFetch = typeof window.fetch === 'function';

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
      next = next.replace(/([?&]width=)\d+/, (_, prefix) => `${prefix}640`);
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

  const fetchWithTimeout = (url, { timeoutMs = 8000 } = {}) => {
    if (typeof AbortController === 'function') {
      const controller = new AbortController();
      const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
      return fetch(url, { signal: controller.signal })
        .then((response) => {
          window.clearTimeout(timerId);
          return response;
        })
        .catch((error) => {
          window.clearTimeout(timerId);
          throw error;
        });
    }

    // 古いブラウザ向け: AbortController 非対応時は Promise.race でタイムアウトを模擬
    return new Promise((resolve, reject) => {
      let settled = false;
      const timerId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`fetch timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      Promise.resolve(fetch(url))
        .then((response) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timerId);
          resolve(response);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timerId);
          reject(error);
        });
    });
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

  const promiseAllSettled = (promises) => {
    if (typeof Promise.allSettled === 'function') {
      return Promise.allSettled(promises);
    }
    return Promise.all((Array.isArray(promises) ? promises : []).map((promise) =>
      Promise.resolve(promise).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      )
    ));
  };

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
          source: item.source || '',
          description: item.description || '',
          excerpt: item.excerpt || '',
          authorName: item.authorName || '',
          authorAvatarUrl: item.authorAvatarUrl || '',
          external: item.external !== false && item.source !== 'local'
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
          source: item?.source || '',
          description: item?.description || '',
          excerpt: item?.excerpt || '',
          authorName: item?.authorName || '',
          authorAvatarUrl: item?.authorAvatarUrl || '',
          external: item?.external !== false && item?.source !== 'local'
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

  const normalizeLocalArticle = (item) => {
    const title = String(item?.title || '').trim();
    const link = String(item?.link || '').trim();
    return {
      title,
      link,
      date: String(item?.date || '').trim(),
      dateMs: Number.isFinite(item?.dateMs) ? item.dateMs : 0,
      imageUrl: String(item?.imageUrl || '').trim(),
      source: 'local',
      description: String(item?.description || '').trim(),
      excerpt: String(item?.excerpt || '').trim(),
      external: false
    };
  };

  const readSeededLocalArticles = () => {
    const seeded = window.__LOCAL_ARTICLES__;
    return (Array.isArray(seeded) ? seeded : [])
      .map(normalizeLocalArticle)
      .filter((item) => item.title && item.link);
  };

  const fetchLocalArticles = async () => {
    const seeded = readSeededLocalArticles();
    if (seeded.length > 0) return seeded;
    if (!canUseFetch) return [];
    if (isFileProtocol) return [];

    const response = await fetchWithTimeout('data/local-articles.json', { timeoutMs: 4000 });
    if (!response.ok) {
      throw new Error(`local manifest request failed: ${response.status}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
    return items
      .map(normalizeLocalArticle)
      .filter((item) => item.title && item.link);
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

    const tryCorsProxyIo = (async () => {
      try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
        const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 4500 });
        if (!res.ok) return '';
        const json = await res.json();
        const eyecatch = json?.data?.eyecatch;
        return typeof eyecatch === 'string' ? normalizeThumbnailUrl(eyecatch) : '';
      } catch (error) {
        debugWarn('corsproxy.io note api failed:', error);
        return '';
      }
    })();

    const eyecatch = await firstTruthy([tryDirect, tryCorsProxyIo, tryJina, tryAllOriginsRaw]);
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

  // OGP画像キャッシュ（記事URL → { url, ts }）、24時間
  const ogpCacheStorageKey = '__SHIORI_OGP_IMAGE_CACHE_V1__';
  const ogpCacheTtlMs = 24 * 60 * 60 * 1000;
  const ogpCache = (() => {
    try {
      const raw = localStorage.getItem(ogpCacheStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  })();

  const getCachedOgp = (articleUrl) => {
    const entry = ogpCache?.[articleUrl];
    if (!entry || typeof entry !== 'object') return '';
    const url = typeof entry.url === 'string' ? entry.url : '';
    const ts = typeof entry.ts === 'number' ? entry.ts : 0;
    if (!url || !ts || Date.now() - ts > ogpCacheTtlMs) return '';
    return url;
  };

  const setCachedOgp = (articleUrl, imageUrl) => {
    if (!articleUrl || !imageUrl) return;
    try {
      ogpCache[articleUrl] = { url: imageUrl, ts: Date.now() };
      localStorage.setItem(ogpCacheStorageKey, JSON.stringify(ogpCache));
    } catch (_) {}
  };

  const extractOgpImageFromHtml = (html) => {
    if (!html || typeof html !== 'string') return '';
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) {
        const url = m[1].replace(/&amp;/g, '&').trim();
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) return url;
      }
    }
    return '';
  };

  const OGP_PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];

  const fetchOgpImage = async (articleUrl) => {
    if (!articleUrl || !articleUrl.startsWith('http')) return '';
    const cached = getCachedOgp(articleUrl);
    if (cached) return cached;

    for (const toProxyUrl of OGP_PROXIES) {
      try {
        const proxyUrl = toProxyUrl(articleUrl);
        const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 6000 });
        if (!res.ok) continue;
        const html = await res.text();
        const imageUrl = extractOgpImageFromHtml(html);
        if (imageUrl) {
          setCachedOgp(articleUrl, imageUrl);
          return imageUrl;
        }
      } catch (e) {
        debugWarn('OGP fetch failed:', articleUrl, e);
      }
    }
    return '';
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
      const res = await fetchWithTimeout(apiUrl, { timeoutMs: 4500 });
      if (!res.ok) throw new Error(`Qiita API error: ${res.status}`);
      return res.json();
    };

    const tryViaProxy = async () => {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`;
      const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 5500 });
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

  // Zenn API（直アクセス + 1 プロキシのみ・タイムアウト短めで体感を優先）
  const fetchZennItemsViaAPI = async () => {
    const fetchAndNormalize = async (url, label, timeoutMs) => {
      try {
        const res = await fetchWithTimeout(url, { timeoutMs });
        if (!res.ok) throw new Error(`${label} error: ${res.status}`);
        const payload = await res.json();
        return normalizeZennApiItems(payload);
      } catch (error) {
        debugWarn(`Zenn API ${label} fetch failed:`, error);
        return [];
      }
    };

    return firstNonEmptyArray([
      fetchAndNormalize(ZENN_API_URL, 'direct', 3800),
      fetchAndNormalize(`https://api.allorigins.win/raw?url=${encodeURIComponent(ZENN_API_URL)}`, 'allorigins', 3800)
    ]);
  };

  // Qiita Atom をプロキシ経由で取得してパース（RSS2JSONはQiita形式で空になるため）
  const CORS_PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];

  // noteは rss2json 単独だと更新遅延・取得失敗時に止まりやすいため、直接RSS取得も併用
  const fetchNoteViaRssRaw = async () => {
    return firstNonEmptyArray(CORS_PROXIES.map((toProxyUrl) => (async () => {
      try {
        const proxyUrl = toProxyUrl(NOTE_FEED_URL);
        const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 3200 });
        if (!res.ok) return [];
        const xmlText = await res.text();
        if (!xmlText || xmlText.length < 100) return [];
        return mapParsedRssItems(parseRSS(xmlText), 'note');
      } catch (e) {
        debugWarn('note RSS proxy failed:', e);
        return [];
      }
    })()));
  };

  const normalizeArticleLink = (url) => String(url || '').trim().replace(/\/$/, '');

  // rss2json が先に返るとサムネ無しで確定してしまうため、生RSSの imageUrl をリンク単位で上書きマージする
  const mergeNoteFeedWithRawThumbs = (rawItems, jsonItems) => {
    const raw = Array.isArray(rawItems) ? rawItems : [];
    const json = Array.isArray(jsonItems) ? jsonItems : [];
    const thumbByLink = new Map();
    raw.forEach((item) => {
      const link = normalizeArticleLink(item?.link);
      const url = String(item?.imageUrl || '').trim();
      if (link && url) thumbByLink.set(link, url);
    });
    const base = json.length ? json : raw;
    if (!base.length) return [];
    return base.map((item) => {
      const link = normalizeArticleLink(item?.link);
      const fromRaw = link ? thumbByLink.get(link) : '';
      return {
        ...item,
        imageUrl: fromRaw || String(item?.imageUrl || '').trim()
      };
    });
  };

  const fetchNoteArticlesMerged = async () => {
    const [raw, json] = await Promise.all([
      fetchNoteViaRssRaw().catch(() => []),
      fetchFeedItems(NOTE_FEED_URL, 'note', { timeoutMs: 3800 }).catch(() => [])
    ]);
    return mergeNoteFeedWithRawThumbs(raw, json);
  };

  const fetchQiitaViaAtomRaw = async () => {
    return firstNonEmptyArray(CORS_PROXIES.map((toProxyUrl) => (async () => {
      try {
        const proxyUrl = toProxyUrl(QIITA_FEED_URL);
        const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 4000 });
        if (!res.ok) return [];
        const xmlText = await res.text();
        if (!xmlText || xmlText.length < 100) return [];
        return parseAtomFeed(xmlText, 'qiita');
      } catch (e) {
        debugWarn('Qiita Atom proxy failed:', e);
        return [];
      }
    })()));
  };

  const fetchZennViaFeedRaw = async () => {
    return firstNonEmptyArray(CORS_PROXIES.map((toProxyUrl) => (async () => {
      try {
        const proxyUrl = toProxyUrl(ZENN_FEED_URL);
        const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 4000 });
        if (!res.ok) return [];
        const xmlText = await res.text();
        if (!xmlText || xmlText.length < 100) return [];
        return parseFeedItemsAuto(xmlText, 'zenn');
      } catch (e) {
        debugWarn('Zenn feed proxy failed:', e);
        return [];
      }
    })()));
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
      if (source !== 'qiita') {
        const content = entry.querySelector('content')?.textContent || entry.querySelector('summary')?.textContent || '';
        if (content) {
          const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i) || content.match(/src=["']([^"']+)["']/i);
          if (imgMatch && imgMatch[1]) {
            imageUrl = imgMatch[1].replace(/&amp;/g, '&');
            if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
          }
        }
      }

      return { title, link, date: dateText, dateMs, imageUrl, source };
    }).filter((a) => a.link && a.title);
  };

  // フィード形式が Atom/RSS のどちらでも扱えるようにする（Zenn は RSS のことがある）
  const parseFeedItemsAuto = (xmlText, source) => {
    const atomItems = parseAtomFeed(xmlText, source);
    if (atomItems.length > 0) return atomItems;
    return mapParsedRssItems(parseRSS(xmlText), source);
  };

  const normalizeQiitaApiItems = (items) => {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      const { dateMs, dateText } = parseItemDate({ created: item.created_at });
      const u = item.user || {};
      return {
        title: item.title || '',
        link: item.url || '',
        date: dateText,
        dateMs,
        imageUrl: '',
        authorName: (u.name && String(u.name).trim()) || u.id || PREVIEW_DEFAULT_AUTHOR,
        authorAvatarUrl: u.profile_image_url || '',
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

      const u = item.user || {};
      return {
        title: item.title || '',
        link,
        date: dateText,
        dateMs,
        imageUrl: '',
        authorName: (u.name && String(u.name).trim()) || PREVIEW_DEFAULT_AUTHOR,
        authorAvatarUrl: u.avatar_small_url || u.avatar_url || '',
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

      if (source === 'qiita') {
        imageUrl = '';
      }

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

  const fetchFeedItemsViaJsonp = (feedUrlRaw, source, timeoutMs = 4000) => new Promise((resolve) => {
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

    const timerId = window.setTimeout(() => finish([]), timeoutMs);

    window[callbackName] = (data) => {
      debugLog('rss2json jsonp items:', Array.isArray(data?.items) ? data.items.length : 0);
      finish(normalizeRss2JsonItems(data, source));
    };

    script.async = true;
    script.src = feedUrl;
    script.onerror = () => finish([]);
    document.head.appendChild(script);
  });

  const mapParsedRssItems = (entries, source) => {
    return (Array.isArray(entries) ? entries : []).map((entry) => {
      const fallbackDate = entry?.date ? new Date(String(entry.date).replace(/\//g, '-')) : null;
      const fallbackDateMs = fallbackDate && !Number.isNaN(fallbackDate.getTime()) ? fallbackDate.getTime() : 0;
      return {
        ...entry,
        dateMs: Number.isFinite(entry?.dateMs) ? entry.dateMs : fallbackDateMs,
        source: source || entry?.source || 'rss'
      };
    });
  };

  // RSS/Atomフィードを取得してパース（options.timeoutMs で待ち上限を調整可能）
  const fetchFeedItems = async (feedUrlRaw, source, options = {}) => {
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 4200;
    try {
      if (!feedUrlRaw) return [];
      const feedUrl = RSS_PROXY ? `${RSS_PROXY}${encodeURIComponent(feedUrlRaw)}` : feedUrlRaw;
      
      // RSS2JSONを使う場合
      if (RSS_PROXY.includes('rss2json')) {
        if (isFileProtocol) {
          return await fetchFeedItemsViaJsonp(feedUrlRaw, source, timeoutMs);
        }

        const viaFetch = (async () => {
          const response = await fetchWithTimeout(feedUrl, { timeoutMs });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const data = await response.json();
          debugLog('rss2json items:', Array.isArray(data.items) ? data.items.length : 0);
          return normalizeRss2JsonItems(data, source);
        })();

        // fetch が失敗するブラウザ向けに JSONP も同時に試し、早く取れた方を使う
        return await firstNonEmptyArray([viaFetch, fetchFeedItemsViaJsonp(feedUrlRaw, source, timeoutMs)]);
      }
      
      // 直接RSSを取得する場合
      const response = await fetchWithTimeout(feedUrl, { timeoutMs });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const xmlText = await response.text();
      return mapParsedRssItems(parseRSS(xmlText), source);
    } catch (error) {
      console.error(`RSS取得エラー(${source || 'rss'}):`, error);
      return [];
    }
  };

  // Yahoo Media RSS（note の <media:thumbnail> など）
  const MRSS_NS = 'http://search.yahoo.com/mrss/';

  const extractMrssThumbnail = (itemEl) => {
    if (!itemEl || !itemEl.getElementsByTagNameNS) return '';
    const nodes = itemEl.getElementsByTagNameNS(MRSS_NS, 'thumbnail');
    if (!nodes.length) return '';
    const el = nodes[0];
    const fromAttr = el.getAttribute && el.getAttribute('url');
    const fromText = (el.textContent || '').trim();
    const raw = (fromAttr || fromText || '').trim();
    return raw;
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
      
      // note 等: アイキャッチは media:thumbnail に入る（description には img が無いことが多い）
      let imageUrl = extractMrssThumbnail(item);
      if (!imageUrl) {
        const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i)
          || description.match(/<img[^>]+src="([^"]+)"/i);
        imageUrl = imgMatch ? imgMatch[1].replace(/&amp;/g, '&').trim() : '';
      }
      if (imageUrl && imageUrl.includes('assets.st-note.com') && !imageUrl.includes('width=')) {
        imageUrl += (imageUrl.includes('?') ? '&' : '?') + 'width=640';
      }
      
      // 日付をフォーマット
      const parsedDate = pubDate ? new Date(pubDate) : null;
      const date = parsedDate ? formatDate(parsedDate) : '';
      const dateMs = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getTime() : 0;
      
      return { title, link, date, dateMs, imageUrl, description };
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
    const isExternal = article.external !== false && article.source !== 'local';
    if (isExternal) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    
    // バッジ
    const badgeConfigBySource = {
      note: { label: 'note', className: 'badge--note' },
      qiita: { label: 'Qiita', className: 'badge--qiita' },
      zenn: { label: 'Zenn', className: 'badge--zenn' },
      local: { label: 'Local', className: 'badge--local' }
    };
    const badgeConfig = badgeConfigBySource[article.source] || { label: 'Article', className: 'badge--source' };

    const badge = document.createElement('span');
    badge.className = `badge ${badgeConfig.className} badge--corner`;
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = badgeConfig.label;
    link.appendChild(badge);
    
    // サムネイル（Qiita / Zenn は記事URLの og:image を hydrate。Qiita は公式のデフォルトOGカード）
    const thumb = document.createElement('div');
    thumb.className = 'card__thumb';
    const thumbSrc = (article.imageUrl || '').trim();

    if (thumbSrc) {
      const img = document.createElement('img');
      img.src = thumbSrc;
      img.alt = `${article.title}のサムネ`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = function() {
        console.warn('画像の読み込みに失敗:', thumbSrc);
        thumb.className = 'card__thumb card__thumb--placeholder';
        img.remove();
        if (!thumb.querySelector('img')) {
          thumb.classList.add('card__thumb--placeholder');
        }
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
  // カード高さのJS同期は余白が出やすいため無効化（CSSの自然な高さに任せる）
  const shouldSyncArticleCardSize = () => false;
  const syncArticleCardMinHeight = (container) => {
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('.card--article'));
    if (cards.length === 0) return;

    // 既存の min-height をクリアして、参照カードの自然な高さを測る
    cards.forEach((card) => {
      card.style.removeProperty('min-height');
    });

    // スマホではCSSの自然な高さに任せる（JS同期は崩れの原因になりやすい）
    if (!shouldSyncArticleCardSize()) return;

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
    if (!shouldSyncArticleCardSize()) {
      // モバイルでは過去に設定されたinline min-heightも確実に解除
      const cards = container.querySelectorAll('.card--article');
      cards.forEach((card) => {
        card.style.removeProperty('min-height');
      });
      return;
    }
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
    const ogpToHydrate = []; // { link, title, thumbEl }（Qiita / Zenn の og:image）

    articles.forEach(article => {
      const card = createArticleCard(article);
      if (firstExisting && firstExisting.parentNode) {
        firstExisting.parentNode.insertBefore(card, firstExisting);
      } else {
        container.appendChild(card);
      }

      const shouldHydrateThumbnail = (
        (!article.imageUrl || !article.imageUrl.trim()) &&
        article.external !== false &&
        /^https?:\/\//i.test(article.link || '')
      );
      if (shouldHydrateThumbnail) {
        const thumbEl = card.querySelector('.card__thumb');
        if (!thumbEl) return;
        const noteKey = extractNoteKey(article.link);
        if (noteKey) {
          const existing = notesToHydrate.get(noteKey) || { title: article.title, link: article.link || '', thumbEls: [] };
          if (!existing.link && article.link) existing.link = article.link;
          existing.thumbEls.push(thumbEl);
          notesToHydrate.set(noteKey, existing);
        } else {
          // Qiita / Zenn：記事URLの og:image（Qiita はタイトル入りのデフォルトプレビュー画像）
          ogpToHydrate.push({ link: article.link, title: article.title, thumbEl });
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
        link: value.link || '',
        thumbEls: value.thumbEls
      }));
      const concurrency = 4;
      let index = 0;

      const worker = async () => {
        while (index < entries.length) {
          const current = entries[index];
          index += 1;

          try {
            let imageUrl = await fetchNoteEyecatch(current.noteKey);
            if (!imageUrl && current.link) {
              imageUrl = await fetchOgpImage(current.link);
            }
            if (imageUrl) {
              current.thumbEls.forEach((thumbEl) => setThumbImage(thumbEl, imageUrl, current.title));
            }
          } catch (error) {
            debugWarn('thumbnail hydrate failed:', error);
          }
        }
      };

      void promiseAllSettled(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
    }

    // 画像がないソースは OGP（og:image）を取得（Qiita / Zenn の自動プレビュー含む）
    if (ogpToHydrate.length > 0) {
      const concurrency = 3;
      let idx = 0;
      const ogpWorker = async () => {
        while (idx < ogpToHydrate.length) {
          const current = ogpToHydrate[idx];
          idx += 1;
          try {
            const imageUrl = await fetchOgpImage(current.link);
            if (imageUrl) {
              setThumbImage(current.thumbEl, imageUrl, current.title);
            }
          } catch (err) {
            debugWarn('OGP hydrate failed:', current.link, err);
          }
        }
      };
      void promiseAllSettled(Array.from({ length: Math.min(concurrency, ogpToHydrate.length) }, ogpWorker));
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
      displayArticles(articlesPageContainer, latestArticles, {
        mode: 'insertBeforeExisting',
        existingArticles: existing,
        enableSizeSync: shouldSyncArticleCardSize()
      });

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
    try {
      const cachedArticles = readArticleListCache();
      if (cachedArticles.length > 0) {
        renderArticlesToContainers(cachedArticles);
      }

      const sourceArticles = {
        local: readSeededLocalArticles(),
        note: [],
        qiita: [],
        zenn: []
      };

      const renderAndCache = () => {
        const rendered = renderArticlesToContainers([
          ...sourceArticles.local,
          ...sourceArticles.note,
          ...sourceArticles.qiita,
          ...sourceArticles.zenn
        ]);
        if (rendered.length > 0) {
          saveArticleListCache(rendered);
        }
        return rendered;
      };

      if (sourceArticles.local.length > 0) {
        renderAndCache();
      }

      const localTask = fetchLocalArticles()
        .then((items) => {
          sourceArticles.local = Array.isArray(items) ? items : [];
          renderAndCache();
        })
        .catch((error) => {
          if (sourceArticles.local.length === 0) {
            sourceArticles.local = [];
          }
          debugWarn('local fetch failed:', error);
        });

      // 生RSS と rss2json を並列取得し、MRSS のサムネをリンクでマージ（先勝ちレースだとサムネが落ちる）
      const noteTask = fetchNoteArticlesMerged()
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
        fetchQiitaViaAtomRaw()
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
        fetchZennViaFeedRaw()
      ])
        .then((items) => {
          sourceArticles.zenn = Array.isArray(items) ? items : [];
          renderAndCache();
        })
        .catch((error) => {
          sourceArticles.zenn = [];
          debugWarn('zenn fetch failed:', error);
        });

      await promiseAllSettled([localTask, noteTask, qiitaTask, zennTask]);

      const finalArticles = renderAndCache();
      if (finalArticles.length === 0 && cachedArticles.length === 0) {
        console.warn('記事を取得できませんでした');
      }

      if (articlesPageContainer) {
        const activeTab = document.querySelector('.articles-filter__tab[aria-selected="true"]');
        const activeFilter = activeTab?.getAttribute('data-filter') || 'all';
        updateEmptyState(articlesPageContainer, activeFilter);
      }
    } catch (err) {
      console.warn('[rss-loader] init failed:', err);
      try {
        const merged = mergeAndSortArticles([
          ...readSeededLocalArticles(),
          ...readArticleListCache()
        ]);
        if (merged.length > 0) {
          renderArticlesToContainers(merged);
        }
      } catch (_) {}
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
      } else if (filter === 'local') {
        emptyDiv.innerHTML = '<p class="articles-empty__text">ローカル記事がありません</p>';
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

    // load 後に再計算（defer スクリプトと遅延 fetch の完了タイミングがブラウザで差が出るため）
    const runInitialEmptyCheck = () => updateEmptyState(articlesList, 'all');
    if (document.readyState === 'complete') {
      window.requestAnimationFrame(runInitialEmptyCheck);
    } else {
      window.addEventListener('load', () => window.requestAnimationFrame(runInitialEmptyCheck), { once: true });
    }
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

