(() => {
'use strict';

/**
 * 公開したら href を足すとリンクになります。title は公開記事のタイトルで上書きできます。
 * 例: 1: { href: 'articles/xxx.html', title: 'タイトル', image: 'assets/...', platform: 'local' }
 * サムネイルは、公開済み記事のタイトルか href から自動で取ります。image があればそれを優先します。
 * platform: local | qiita | note | zenn
 */
const ADVENT_ARTICLES = Object.fromEntries(
  Array.from({ length: 25 }, (_, index) => [index + 1, { title: 'タイトル未定' }])
);

const ADVENT_DAYS = 25;
const READ_STORAGE_KEY = 'advent2026-read';
const VIEW_STORAGE_KEY = 'advent2026-view';
const VALID_VIEWS = new Set(['grid', 'list']);

const UNPUBLISHED_THUMB = 'assets/media/advent/unpublished.jpg';

const PLATFORM_BADGE = {
  local: { label: 'Local', className: 'badge--local' },
  qiita: { label: 'Qiita', className: 'badge--qiita' },
  note: { label: 'note', className: 'badge--note' },
  zenn: { label: 'Zenn', className: 'badge--zenn' },
};

const getJstDate = () => {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 3600000);
};

const isDayUnlocked = (day, jst) => {
  const year = jst.getFullYear();
  const month = jst.getMonth();
  const date = jst.getDate();

  if (year > 2026) return true;
  if (year < 2026) return false;
  if (month > 11) return true;
  if (month < 11) return false;
  return date >= day;
};

/** 12月前は登録済み記事をプレビュー表示 */
const isBeforeAdventSeason = (jst) => {
  const year = jst.getFullYear();
  const month = jst.getMonth();
  return year < 2026 || (year === 2026 && month < 11);
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const getReadDays = () => {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : []);
  } catch {
    return new Set();
  }
};

const markDayRead = (day) => {
  try {
    const read = getReadDays();
    read.add(day);
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...read].sort((a, b) => a - b)));
  } catch {
    /* localStorage unavailable */
  }
};

const resolveArticleMeta = (article) => {
  if (!article) return article;

  const local = window.__LOCAL_ARTICLES__?.find((item) => item.link === article.href);
  return {
    ...article,
    title: article.title || local?.title || '',
    image: article.image || local?.imageUrl || lookupManifestImage(article.href) || '',
    platform: article.platform || local?.source || '',
  };
};

const formatAdventDate = (day) => {
  const dd = String(day).padStart(2, '0');
  return {
    display: `Day ${day}`,
    datetime: `2026-12-${dd}`,
  };
};

const getPlatformBadge = (platform) => (
  PLATFORM_BADGE[platform] || { label: 'Day', className: 'badge--local' }
);

const createPadCell = () => {
  const item = document.createElement('li');
  item.className = 'advent-cell advent-cell--pad';
  item.setAttribute('aria-hidden', 'true');
  return item;
};

const createCalendarCell = (day, article, status) => {
  const meta = article ? resolveArticleMeta(article) : null;
  const title = meta?.title?.trim() || '';
  const isOpen = status === 'open' && Boolean(meta?.href);
  const item = document.createElement('li');
  item.className = 'advent-cell';
  item.dataset.day = String(day);
  if (title) item.classList.add('advent-cell--entry');
  if (isOpen) item.classList.add('advent-cell--open');
  if (status === 'ready') item.classList.add('advent-cell--ready');

  const image = String(meta?.image || '').trim();
  const unpublished = Boolean(title) && !isOpen && !image;
  if (image) item.classList.add('advent-cell--has-thumb');
  const label = title ? `12月${day}日 — ${title}${unpublished ? '（未公開）' : ''}` : `12月${day}日`;
  const thumb = image
    ? `<span class="advent-cell__thumb"><img src="${escapeHtml(image)}" alt="" /></span>`
    : '';
  const statusHtml = unpublished ? '<span class="advent-cell__status">未公開</span>' : '';
  const body = `
    <span class="advent-cell__date">${day}</span>
    ${thumb}
    ${statusHtml}
  `;

  if (isOpen) {
    item.innerHTML = `<a class="advent-cell__body" href="${escapeHtml(meta.href)}" aria-label="${escapeHtml(label)}">${body}</a>`;
    item.querySelector('a')?.addEventListener('click', () => {
      markDayRead(day);
    });
  } else {
    item.innerHTML = `<div class="advent-cell__body" aria-label="${escapeHtml(label)}">${body}</div>`;
  }

  return item;
};

const createListCard = ({ day, article, isRead }) => {
  const meta = article ? resolveArticleMeta(article) : null;
  const title = meta?.title?.trim() || 'タイトル未定';

  const date = formatAdventDate(day);
  const isOpen = Boolean(meta?.href);
  const badge = meta?.platform ? getPlatformBadge(meta.platform) : null;
  const item = document.createElement('li');
  item.className = `card card--article${isOpen ? '' : ' card--upcoming'}${isOpen && isRead ? ' card--read' : ''}`;
  item.dataset.day = String(day);

  const thumbHtml = isOpen && meta?.image
    ? `<div class="card__thumb"><img src="${escapeHtml(meta.image)}" alt="" width="272" height="153" loading="lazy" decoding="async" /></div>`
    : `<div class="card__thumb card__thumb--unpublished"><img src="${UNPUBLISHED_THUMB}" alt="" width="1024" height="576" loading="lazy" decoding="async" /></div>`;
  const badgeHtml = badge
    ? `<span class="badge ${badge.className} badge--corner">${escapeHtml(badge.label)}</span>`
    : '';
  const body = `
    ${thumbHtml}
    <div class="card__content">
      <div class="card__head">
        <time class="card__date" datetime="${date.datetime}">${date.display}</time>
        ${badgeHtml}
      </div>
      <h3>${escapeHtml(title)}</h3>
    </div>
  `;

  if (isOpen) {
    item.innerHTML = `<a class="card__link" href="${escapeHtml(meta.href)}">${body}</a>`;
    item.querySelector('a')?.addEventListener('click', () => {
      markDayRead(day);
    });
  } else {
    item.innerHTML = `<div class="card__link">${body}</div>`;
  }

  return item;
};

const updateProgress = (publishedCount) => {
  const el = document.getElementById('advent-progress');
  if (!el) return;
  el.textContent = `${publishedCount} / ${ADVENT_DAYS} 公開済み`;
};

const getStoredView = () => {
  try {
    const value = localStorage.getItem(VIEW_STORAGE_KEY);
    return VALID_VIEWS.has(value) ? value : 'grid';
  } catch {
    return 'grid';
  }
};

const buildDayState = (day, jst, readDays) => {
  const article = ADVENT_ARTICLES[day];
  const unlocked = isDayUnlocked(day, jst);
  const canPreview = unlocked || isBeforeAdventSeason(jst);

  if (article?.href) {
    if (canPreview) {
      return {
        published: true,
        grid: () => createCalendarCell(day, article, 'open'),
        list: () => createListCard({ day, article, isRead: readDays.has(day) }),
      };
    }
    return {
      published: true,
      grid: () => createCalendarCell(day, article, 'locked'),
      list: () => createListCard({ day, article, isRead: readDays.has(day) }),
    };
  }

  if (unlocked) {
    return {
      published: false,
      grid: () => createCalendarCell(day, article, 'ready'),
      list: () => createListCard({ day, article, isRead: readDays.has(day) }),
    };
  }

  return {
    published: false,
    grid: () => createCalendarCell(day, article, 'locked'),
    list: () => createListCard({ day, article, isRead: readDays.has(day) }),
  };
};

const normalizeTitle = (value) => String(value || '')
  .replace(/\s+/g, '')
  .replace(/[～〜]/g, '~')
  .toLowerCase();

const lookupManifestImage = (link) => {
  const images = window.__ARTICLE_IMAGES__;
  if (!images || !link) return '';
  const key = String(link).trim().replace(/\/$/, '');
  return images[key] || images[link] || '';
};

const mountListThumb = (day, imageUrl) => {
  const card = document.querySelector(`#advent-list [data-day="${day}"]`);
  const slot = card?.querySelector('.card__thumb');
  if (!slot || !imageUrl || slot.querySelector('img')) return;
  slot.classList.remove('card__thumb--placeholder');
  card.querySelector('.advent-entry__status')?.remove();
  const img = document.createElement('img');
  img.alt = '';
  img.width = 272;
  img.height = 153;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = imageUrl;
  slot.appendChild(img);
};

const mountCellThumb = (day, imageUrl) => {
  mountListThumb(day, imageUrl);
  const cell = document.querySelector(`#advent-grid [data-day="${day}"]`);
  const body = cell?.querySelector('.advent-cell__body');
  if (!cell || !body || !imageUrl || cell.querySelector('.advent-cell__thumb')) return;
  cell.classList.add('advent-cell--has-thumb');
  cell.querySelector('.advent-cell__status')?.remove();
  const thumb = document.createElement('span');
  thumb.className = 'advent-cell__thumb';
  const img = document.createElement('img');
  img.alt = '';
  img.src = imageUrl;
  thumb.appendChild(img);
  body.appendChild(thumb);
};

const fetchJson = async (url, timeoutMs = 6000) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
};

const extractOgpImage = (html) => {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (!match?.[1]) continue;
    const url = match[1].replace(/&amp;/g, '&').trim();
    if (url.startsWith('http')) return url;
  }
  return '';
};

const fetchOgpImage = async (pageUrl) => {
  const seeded = lookupManifestImage(pageUrl);
  if (seeded) return seeded;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://r.jina.ai/${pageUrl}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'X-Return-Format': 'html',
        Accept: 'text/html'
      }
    });
    if (!response.ok) return '';
    return extractOgpImage(await response.text());
  } catch (_) {
    return '';
  } finally {
    window.clearTimeout(timer);
  }
};

const collectKnownArticles = async () => {
  const items = [];
  const push = (title, link, imageUrl) => {
    const name = String(title || '').trim();
    const href = String(link || '').trim();
    if (!name || !href) return;
    items.push({
      title: name,
      link: href,
      imageUrl: String(imageUrl || '').trim() || lookupManifestImage(href)
    });
  };

  (window.__LOCAL_ARTICLES__ || []).forEach((item) => {
    push(item.title, item.link, item.imageUrl);
  });
  (window.__NOTE_FEED__ || []).forEach((item) => {
    push(item.title, item.link, item.imageUrl);
  });

  try {
    const qiita = await fetchJson('https://qiita.com/api/v2/users/shiori_02_14_/items?per_page=100');
    if (Array.isArray(qiita)) {
      qiita.forEach((item) => push(item.title, item.url, ''));
    }
  } catch (_) {}

  try {
    const zenn = await fetchJson('https://zenn.dev/api/articles?username=shiori_02_14&order=latest', 4000);
    const articles = Array.isArray(zenn?.articles) ? zenn.articles : [];
    articles.forEach((item) => {
      const path = item.path || (item.slug ? `/shiori_02_14/articles/${item.slug}` : '');
      push(item.title, path ? `https://zenn.dev${path}` : '', '');
    });
  } catch (_) {}

  return items;
};

const hydrateAdventThumbs = async () => {
  const known = await collectKnownArticles();
  const byTitle = new Map();
  known.forEach((item) => {
    const key = normalizeTitle(item.title);
    if (key && !byTitle.has(key)) byTitle.set(key, item);
  });

  const jobs = [];
  for (let day = 1; day <= ADVENT_DAYS; day += 1) {
    const article = ADVENT_ARTICLES[day];
    if (!article?.title || article.image) {
      if (article?.image) mountCellThumb(day, article.image);
      continue;
    }
    const matched = byTitle.get(normalizeTitle(article.title));
    const link = String(article.href || matched?.link || '').trim();
    const directImage = matched?.imageUrl || lookupManifestImage(link);
    if (directImage) {
      mountCellThumb(day, directImage);
      continue;
    }
    if (/^https?:\/\//i.test(link)) jobs.push({ day, link });
  }

  let index = 0;
  const worker = async () => {
    while (index < jobs.length) {
      const job = jobs[index];
      index += 1;
      const imageUrl = await fetchOgpImage(job.link);
      if (imageUrl) mountCellThumb(job.day, imageUrl);
    }
  };
  const workers = Math.min(3, jobs.length);
  if (workers > 0) {
    await Promise.all(Array.from({ length: workers }, worker));
  }
};

const initAdvent2026 = () => {
  const grid = document.getElementById('advent-grid');
  const list = document.getElementById('advent-list');
  if (!grid || !list) return;

  const jst = getJstDate();
  const readDays = getReadDays();
  const dayStates = [];
  let publishedCount = 0;

  for (let day = 1; day <= ADVENT_DAYS; day += 1) {
    const state = buildDayState(day, jst, readDays);
    if (state.published) publishedCount += 1;
    dayStates.push(state);
  }

  const gridFragment = document.createDocumentFragment();
  const leadingBlanks = new Date(Date.UTC(2026, 11, 1)).getUTCDay();
  for (let index = 0; index < leadingBlanks; index += 1) {
    gridFragment.appendChild(createPadCell());
  }
  dayStates.forEach((state) => {
    gridFragment.appendChild(state.grid());
  });
  const trailingBlanks = (leadingBlanks + ADVENT_DAYS) % 7;
  if (trailingBlanks) {
    for (let index = 0; index < 7 - trailingBlanks; index += 1) {
      gridFragment.appendChild(createPadCell());
    }
  }
  grid.appendChild(gridFragment);

  const listFragment = document.createDocumentFragment();
  dayStates.forEach((state) => {
    const row = state.list();
    if (row) listFragment.appendChild(row);
  });
  list.appendChild(listFragment);

  updateProgress(publishedCount);
  void hydrateAdventThumbs();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdvent2026, { once: true });
} else {
  initAdvent2026();
}
})();
