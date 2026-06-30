(() => {
'use strict';

/** 記事URLを追加したらその日の扉が自動でリンク化されます */
const ADVENT_ARTICLES = {
  // 1: { href: 'articles/advent2026-dec01.html', title: '1日目のタイトル', image: 'assets/media/xxx/cover.png' },
};

const ADVENT_DAYS = 25;
const READ_STORAGE_KEY = 'advent2026-read';

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
    image: article.image || local?.imageUrl || '',
  };
};

const createSimpleDoorFace = (day) => `
  <span class="advent-door__month" aria-hidden="true">Dec</span>
  <span class="advent-door__num advent-door__num--large">${day}</span>
`;

const createArticleDoorHead = (day) => `
  <span class="advent-door__head">
    <span class="advent-door__month" aria-hidden="true">Dec</span>
    <span class="advent-door__num">${day}</span>
  </span>
`;

const createLockedDoor = (day) => {
  const item = document.createElement('li');
  item.className = 'advent-door advent-door--locked';
  item.dataset.day = String(day);
  item.innerHTML = `
    <div class="advent-door__panel" aria-label="12月${day}日 — 未公開">
      ${createSimpleDoorFace(day)}
      <span class="advent-door__hint" aria-hidden="true">—</span>
    </div>
  `;
  return item;
};

const createArticleDoor = (day, article, isRead) => {
  const meta = resolveArticleMeta(article);
  const title = meta.title || `12月${day}日`;
  const hint = isRead ? '読了' : '読む';
  const item = document.createElement('li');
  item.className = `advent-door advent-door--open${isRead ? ' advent-door--read' : ''}`;
  item.dataset.day = String(day);

  const thumbHtml = meta.image
    ? `<span class="advent-door__thumb"><img src="${escapeHtml(meta.image)}" alt="" width="120" height="68" loading="lazy" decoding="async" /></span>`
    : '';

  item.innerHTML = `
    <a class="advent-door__panel advent-door__link advent-door__panel--article" href="${escapeHtml(meta.href)}" aria-label="12月${day}日 — ${escapeHtml(title)}${isRead ? '（読了）' : ''}">
      ${createArticleDoorHead(day)}
      ${thumbHtml}
      <span class="advent-door__title">${escapeHtml(title)}</span>
      <span class="advent-door__hint">${hint}</span>
    </a>
  `;

  item.querySelector('.advent-door__link')?.addEventListener('click', () => {
    markDayRead(day);
  });

  return item;
};

const createReadyDoor = (day) => {
  const item = document.createElement('li');
  item.className = 'advent-door advent-door--ready';
  item.dataset.day = String(day);
  item.innerHTML = `
    <div class="advent-door__panel" aria-label="12月${day}日 — 準備中">
      ${createSimpleDoorFace(day)}
      <span class="advent-door__hint">準備中</span>
    </div>
  `;
  return item;
};

const replaceDoor = (current, next) => {
  current.replaceWith(next);
  return next;
};

const updateProgress = (publishedCount) => {
  const el = document.getElementById('advent-progress');
  if (!el) return;
  el.textContent = `${publishedCount} / ${ADVENT_DAYS} 公開済み`;
};

const renderAdventGrid = () => {
  const grid = document.getElementById('advent-grid');
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  for (let day = 1; day <= ADVENT_DAYS; day += 1) {
    fragment.appendChild(createLockedDoor(day));
  }
  grid.appendChild(fragment);
};

const initAdvent2026 = () => {
  renderAdventGrid();

  const grid = document.getElementById('advent-grid');
  if (!grid) return;

  const jst = getJstDate();
  const readDays = getReadDays();
  let publishedCount = 0;

  grid.querySelectorAll('.advent-door[data-day]').forEach((item) => {
    const day = Number.parseInt(item.dataset.day, 10);
    if (!Number.isFinite(day)) return;

    const article = ADVENT_ARTICLES[day];
    const unlocked = isDayUnlocked(day, jst);

    if (article?.href) {
      publishedCount += 1;
      if (unlocked || isBeforeAdventSeason(jst)) {
        replaceDoor(item, createArticleDoor(day, article, readDays.has(day)));
      }
      return;
    }

    if (!unlocked) return;

    replaceDoor(item, createReadyDoor(day));
  });

  updateProgress(publishedCount);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdvent2026, { once: true });
} else {
  initAdvent2026();
}
})();
