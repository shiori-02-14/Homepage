(() => {
'use strict';

/** 記事URLを追加したらその日の扉が自動でリンク化されます */
const ADVENT_ARTICLES = {
  // 1: { href: 'articles/advent2026-dec01.html', title: '1日目のタイトル' },
};

const ADVENT_DAYS = 25;

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

const createDoorFace = (day) => `
  <span class="advent-door__month" aria-hidden="true">Dec</span>
  <span class="advent-door__num">${day}</span>
`;

const createLockedDoor = (day) => {
  const item = document.createElement('li');
  item.className = 'advent-door advent-door--locked';
  item.dataset.day = String(day);
  item.innerHTML = `
    <div class="advent-door__panel" aria-label="12月${day}日 — 未公開">
      ${createDoorFace(day)}
      <span class="advent-door__hint" aria-hidden="true">—</span>
    </div>
  `;
  return item;
};

const createOpenDoor = (day, href, title) => {
  const item = document.createElement('li');
  item.className = 'advent-door advent-door--open';
  item.dataset.day = String(day);
  item.innerHTML = `
    <a class="advent-door__panel advent-door__link" href="${href}" aria-label="12月${day}日 — ${title}">
      ${createDoorFace(day)}
      <span class="advent-door__hint">読む</span>
    </a>
  `;
  return item;
};

const createReadyDoor = (day) => {
  const item = document.createElement('li');
  item.className = 'advent-door advent-door--ready';
  item.dataset.day = String(day);
  item.innerHTML = `
    <div class="advent-door__panel" aria-label="12月${day}日 — 準備中">
      ${createDoorFace(day)}
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
  let publishedCount = 0;

  grid.querySelectorAll('.advent-door[data-day]').forEach((item) => {
    const day = Number.parseInt(item.dataset.day, 10);
    if (!Number.isFinite(day)) return;

    const article = ADVENT_ARTICLES[day];
    if (article?.href) publishedCount += 1;

    if (!isDayUnlocked(day, jst)) return;

    if (article?.href) {
      replaceDoor(
        item,
        createOpenDoor(day, article.href, article.title || `12月${day}日`)
      );
      return;
    }

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
