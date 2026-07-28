(() => {
'use strict';

/**
 * 公開したらエントリを足すとリンク化されます。
 * 例: 1: { href: 'articles/xxx.html', title: 'タイトル', image: 'assets/...', platform: 'local' }
 * platform: local | qiita | note | zenn
 */
const ADVENT_ARTICLES = {};

const ADVENT_DAYS = 25;
const READ_STORAGE_KEY = 'advent2026-read';
const VIEW_STORAGE_KEY = 'advent2026-view';
const VALID_VIEWS = new Set(['grid', 'list']);

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
    image: article.image || local?.imageUrl || '',
    platform: article.platform || local?.source || 'local',
  };
};

const formatAdventDate = (day) => {
  const dd = String(day).padStart(2, '0');
  return {
    display: `2026/12/${dd}`,
    datetime: `2026-12-${dd}`,
  };
};

const getPlatformBadge = (platform) => (
  PLATFORM_BADGE[platform] || { label: 'Day', className: 'badge--local' }
);

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

const createLockedDoor = (day, article) => {
  const title = article?.title?.trim();
  const item = document.createElement('li');
  item.className = `advent-door advent-door--locked${title ? ' advent-door--planned' : ''}`;
  item.dataset.day = String(day);

  if (title) {
    item.innerHTML = `
      <div class="advent-door__panel advent-door__panel--article" aria-label="12月${day}日 — ${escapeHtml(title)}（予定）">
        ${createArticleDoorHead(day)}
        <span class="advent-door__title">${escapeHtml(title)}</span>
        <span class="advent-door__hint">予定</span>
      </div>
    `;
  } else {
    item.innerHTML = `
      <div class="advent-door__panel" aria-label="12月${day}日 — 未定">
        ${createSimpleDoorFace(day)}
        <span class="advent-door__hint" aria-hidden="true">—</span>
      </div>
    `;
  }

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

const createReadyDoor = (day, article) => {
  const title = article?.title?.trim();
  const item = document.createElement('li');
  item.className = `advent-door advent-door--ready${title ? ' advent-door--planned' : ''}`;
  item.dataset.day = String(day);

  if (title) {
    item.innerHTML = `
      <div class="advent-door__panel advent-door__panel--article" aria-label="12月${day}日 — ${escapeHtml(title)}（準備中）">
        ${createArticleDoorHead(day)}
        <span class="advent-door__title">${escapeHtml(title)}</span>
        <span class="advent-door__hint">準備中</span>
      </div>
    `;
  } else {
    item.innerHTML = `
      <div class="advent-door__panel" aria-label="12月${day}日 — 準備中">
        ${createSimpleDoorFace(day)}
        <span class="advent-door__hint">準備中</span>
      </div>
    `;
  }

  return item;
};

const createListCard = ({ day, status, article, isRead }) => {
  const meta = article ? resolveArticleMeta(article) : null;
  const date = formatAdventDate(day);
  const isOpen = status === 'open' && meta?.href;
  const plannedTitle = meta?.title?.trim() || '';
  const title = isOpen
    ? (plannedTitle || `12月${day}日`)
    : plannedTitle || (status === 'ready' ? '準備中' : '未定');
  const statusLabel = status === 'ready' ? '準備中' : (plannedTitle ? '予定' : '未定');
  const badge = getPlatformBadge(meta?.platform);

  const item = document.createElement('li');
  item.className = `card card--article${isOpen ? '' : ' card--upcoming'}${isRead ? ' card--read' : ''}`;
  item.dataset.day = String(day);

  const thumbHtml = meta?.image
    ? `<div class="card__thumb"><img src="${escapeHtml(meta.image)}" alt="${escapeHtml(title)}のサムネ" width="272" height="153" loading="lazy" decoding="async" /></div>`
    : `<div class="card__thumb card__thumb--placeholder" aria-hidden="true">${
        isOpen ? '' : `<span class="badge badge--soon">${statusLabel}</span>`
      }</div>`;

  const badgeHtml = `<span class="badge ${badge.className} badge--corner" aria-hidden="true">${escapeHtml(badge.label)}</span>`;

  if (isOpen) {
    item.innerHTML = `
      <a class="card__link" href="${escapeHtml(meta.href)}" title="${escapeHtml(title)}">
        ${badgeHtml}
        ${thumbHtml}
        <div class="card__content">
          <time class="card__date" datetime="${date.datetime}">${date.display}</time>
          <h3>${escapeHtml(title)}</h3>
        </div>
      </a>
    `;
    item.querySelector('.card__link')?.addEventListener('click', () => {
      markDayRead(day);
    });
  } else {
    item.innerHTML = `
      <a class="card__link" href="#!" aria-disabled="true" tabindex="-1">
        ${badgeHtml}
        ${thumbHtml}
        <div class="card__content">
          <time class="card__date" datetime="${date.datetime}">${date.display}</time>
          <h3>${escapeHtml(title)}</h3>
        </div>
      </a>
    `;
    item.querySelector('.card__link')?.addEventListener('click', (event) => {
      event.preventDefault();
    });
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
        grid: () => createArticleDoor(day, article, readDays.has(day)),
        list: () => createListCard({ day, status: 'open', article, isRead: readDays.has(day) }),
      };
    }
    return {
      published: true,
      grid: () => createLockedDoor(day, article),
      list: () => createListCard({ day, status: 'locked', article }),
    };
  }

  if (unlocked) {
    return {
      published: false,
      grid: () => createReadyDoor(day, article),
      list: () => createListCard({ day, status: 'ready', article }),
    };
  }

  return {
    published: false,
    grid: () => createLockedDoor(day, article),
    list: () => createListCard({ day, status: 'locked', article }),
  };
};

const initAdvent2026 = () => {
  const grid = document.getElementById('advent-grid');
  const list = document.getElementById('advent-list');
  if (!grid || !list) return;

  const jst = getJstDate();
  const readDays = getReadDays();
  const dayStates = [];
  let publishedCount = 0;
  let listBuilt = false;

  for (let day = 1; day <= ADVENT_DAYS; day += 1) {
    const state = buildDayState(day, jst, readDays);
    if (state.published) publishedCount += 1;
    dayStates.push(state);
  }

  const gridFragment = document.createDocumentFragment();
  dayStates.forEach((state) => {
    gridFragment.appendChild(state.grid());
  });
  grid.appendChild(gridFragment);

  const ensureListBuilt = () => {
    if (listBuilt) return;
    listBuilt = true;
    const listFragment = document.createDocumentFragment();
    dayStates.forEach((state) => {
      listFragment.appendChild(state.list());
    });
    list.appendChild(listFragment);
  };

  const applyAdventView = (view) => {
    const next = VALID_VIEWS.has(view) ? view : 'grid';
    const isList = next === 'list';

    if (isList) ensureListBuilt();

    grid.hidden = isList;
    list.hidden = !isList;
    grid.dataset.view = next;
    list.dataset.view = next;

    document.querySelectorAll('[data-advent-view]').forEach((btn) => {
      const active = btn.dataset.adventView === next;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable */
    }
  };

  updateProgress(publishedCount);
  applyAdventView(getStoredView());

  document.querySelectorAll('[data-advent-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyAdventView(btn.dataset.adventView);
    });
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdvent2026, { once: true });
} else {
  initAdvent2026();
}
})();
