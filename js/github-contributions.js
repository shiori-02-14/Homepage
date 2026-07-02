(() => {
  const GITHUB_USER = 'shiori-02-14';
  const DATA_URLS = [
    'data/github-contributions.json',
    'data/github-contributions.js',
    'https://raw.githubusercontent.com/shiori-02-14/Homepage/main/data/github-contributions.json',
  ];
  const FALLBACK_API_URL = `https://github-contributions-api.jogruber.de/v4/${GITHUB_USER}?y=last`;
  const DATA_KEY = '__GITHUB_CONTRIBUTIONS__';

  const root = document.getElementById('profile-github');
  if (!root) return;

  const graphEl = root.querySelector('.profile-github__graph');
  const totalEl = root.querySelector('.profile-github__total-value');
  const tooltipEl = root.querySelector('.profile-github__tooltip');

  if (!graphEl || !totalEl) return;

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const formatCount = (count) => `${count} contribution${count === 1 ? '' : 's'}`;

  const groupByWeeks = (contributions) => {
    const weeks = [];
    let week = [];

    contributions.forEach((day, index) => {
      const dayOfWeek = new Date(`${day.date}T12:00:00`).getDay();

      if (index === 0 && dayOfWeek !== 0) {
        for (let i = 0; i < dayOfWeek; i += 1) {
          week.push(null);
        }
      }

      week.push(day);

      if (dayOfWeek === 6 || index === contributions.length - 1) {
        while (week.length < 7) {
          week.push(null);
        }
        weeks.push(week);
        week = [];
      }
    });

    return weeks;
  };

  const hideTooltip = () => {
    if (!tooltipEl) return;
    tooltipEl.hidden = true;
  };

  const formatTooltipDate = (iso) => {
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const showTooltip = (cell) => {
    if (!tooltipEl || !cell.dataset.date) return;

    const count = Number(cell.dataset.count || 0);
    tooltipEl.innerHTML = `<strong>${formatCount(count)}</strong><span>${formatTooltipDate(cell.dataset.date)}</span>`;
    tooltipEl.hidden = false;

    const host = root.querySelector('.profile-github__graph-wrap');
    if (!host) return;

    const hostRect = host.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    let left = cellRect.left - hostRect.left + (cellRect.width / 2) - (tooltipRect.width / 2);
    let top = cellRect.top - hostRect.top - tooltipRect.height - 10;
    let below = false;

    if (top < 0) {
      top = cellRect.bottom - hostRect.top + 10;
      below = true;
    }

    const minLeft = 4;
    const maxLeft = hostRect.width - tooltipRect.width - 4;
    const clampedLeft = Math.max(minLeft, Math.min(left, maxLeft));

    const caretX = cellRect.left - hostRect.left + (cellRect.width / 2) - clampedLeft;
    tooltipEl.style.setProperty('--gh-tip-caret', `${caretX}px`);
    tooltipEl.classList.toggle('profile-github__tooltip--below', below);
    tooltipEl.style.left = `${clampedLeft}px`;
    tooltipEl.style.top = `${top}px`;
  };

  const bindCell = (cell) => {
    cell.addEventListener('mouseenter', () => showTooltip(cell));
    cell.addEventListener('focus', () => showTooltip(cell));
    cell.addEventListener('mouseleave', hideTooltip);
    cell.addEventListener('blur', hideTooltip);
  };

  const firstDayOf = (weekDays) => weekDays.find((day) => day) || null;

  const buildMonths = (visibleWeeks) => {
    const months = document.createElement('div');
    months.className = 'profile-github__months';
    months.setAttribute('aria-hidden', 'true');

    let prevMonth = -1;
    visibleWeeks.forEach((weekDays) => {
      const slot = document.createElement('span');
      const day = firstDayOf(weekDays);
      if (day) {
        const month = new Date(`${day.date}T12:00:00`).getMonth();
        if (month !== prevMonth) {
          slot.textContent = MONTH_LABELS[month];
          prevMonth = month;
        }
      }
      months.appendChild(slot);
    });

    return months;
  };

  const trimLeadingEmptyWeeks = (weeks) => {
    const firstActive = weeks.findIndex((weekDays) =>
      weekDays.some((day) => day && day.count > 0)
    );
    return firstActive === -1 ? weeks : weeks.slice(firstActive);
  };

  const getGraphWidth = () => {
    const width = graphEl.clientWidth;
    if (width > 0) return width;

    const layout = root.querySelector('.profile-github__graph-layout');
    const weekdays = root.querySelector('.profile-github__weekdays');
    if (!layout) return 0;

    const weekdaysWidth = weekdays?.getBoundingClientRect().width ?? 0;
    return Math.max(0, layout.clientWidth - weekdaysWidth - 8);
  };

  const fitWeeksToWidth = (weeks) => {
    const width = getGraphWidth();
    if (!width || !weeks.length) return weeks;

    const minCell = width < 520 ? 10 : 8;
    let count = weeks.length;

    const cellSizeFor = (weekCount, gapSize) =>
      (width - (weekCount - 1) * gapSize) / weekCount;

    while (count > 12) {
      let gapSize = width < 520 ? 2 : 4;
      let cellSize = cellSizeFor(count, gapSize);

      while (cellSize < minCell && gapSize > 1) {
        gapSize -= 1;
        cellSize = cellSizeFor(count, gapSize);
      }

      if (cellSize >= minCell) {
        root.style.setProperty('--gh-cell-gap', `${gapSize}px`);
        return weeks.slice(weeks.length - count);
      }

      count -= 1;
    }

    root.style.setProperty('--gh-cell-gap', '1px');
    return weeks.slice(-count);
  };

  const fitGraphLayout = () => {
    const width = graphEl.clientWidth;
    const count = Number(getComputedStyle(root).getPropertyValue('--gh-week-count')) || 0;
    if (width > 0 && count > 0) {
      const gap = Number.parseFloat(getComputedStyle(root).getPropertyValue('--gh-cell-gap')) || 4;
      const cellSize = (width - (count - 1) * gap) / count;
      if (cellSize > 0) {
        root.style.setProperty('--gh-cell-size', `${cellSize}px`);
      }
    }
  };

  let lastContributions = null;

  const renderGraph = (contributions) => {
    lastContributions = contributions;
    graphEl.replaceChildren();
    graphEl.setAttribute('role', 'img');

    const weeks = fitWeeksToWidth(trimLeadingEmptyWeeks(groupByWeeks(contributions)));
    const yearlyTotal = contributions.reduce((sum, day) => sum + day.count, 0);

    root.style.setProperty('--gh-week-count', String(weeks.length));

    graphEl.setAttribute(
      'aria-label',
      `Past year of GitHub contributions (${formatCount(yearlyTotal)})`
    );

    const layoutEl = root.querySelector('.profile-github__graph-layout');
    layoutEl?.querySelector('.profile-github__months')?.remove();
    layoutEl?.insertBefore(buildMonths(weeks), graphEl);

    const inner = document.createElement('div');
    inner.className = 'profile-github__graph-inner';

    const grid = document.createElement('div');
    grid.className = 'profile-github__grid';
    grid.setAttribute('role', 'grid');

    weeks.forEach((weekDays, weekIndex) => {
      const column = document.createElement('div');
      column.className = 'profile-github__week';
      column.setAttribute('role', 'presentation');

      weekDays.forEach((day) => {
        const cell = document.createElement('span');
        cell.className = 'profile-github__cell';

        if (!day) {
          cell.classList.add('profile-github__cell--empty');
          cell.setAttribute('aria-hidden', 'true');
        } else {
          cell.dataset.date = day.date;
          cell.dataset.count = String(day.count);
          cell.dataset.level = String(day.level);
          cell.tabIndex = 0;
          cell.setAttribute('role', 'gridcell');
          cell.setAttribute('aria-label', `${day.date}: ${formatCount(day.count)}`);
          if (!prefersReducedMotion) {
            cell.style.setProperty('--gh-col', String(weekIndex));
          }
          bindCell(cell);
        }

        column.appendChild(cell);
      });

      grid.appendChild(column);
    });

    inner.appendChild(grid);
    graphEl.appendChild(inner);

    if (!prefersReducedMotion) {
      grid.classList.add('profile-github__grid--animate');
    }

    window.requestAnimationFrame(fitGraphLayout);
  };

  const renderError = () => {
    graphEl.replaceChildren();
    graphEl.removeAttribute('role');

    const message = document.createElement('p');
    message.className = 'profile-github__error';
    message.textContent = 'Contribution data could not be loaded.';
    graphEl.appendChild(message);
  };

  const parsePayload = (payload) => {
    if (payload && typeof payload === 'object' && Array.isArray(payload.contributions)) {
      return payload;
    }
    return null;
  };

  const fetchDataSource = async (url) => {
    const response = await fetch(url);
    if (!response.ok) return null;

    if (url.endsWith('.js')) {
      const scriptText = await response.text();
      const module = { exports: {} };
      const runner = new Function('window', 'module', 'exports', `${scriptText}; return window.${DATA_KEY};`);
      return parsePayload(runner(window, module, module.exports));
    }

    return parsePayload(await response.json());
  };

  const loadContributions = async () => {
    const applyData = (data) => {
      const contributions = Array.isArray(data.contributions) ? data.contributions : [];
      const yearlyTotal = data.total?.lastYear ?? contributions.reduce((sum, day) => sum + day.count, 0);
      totalEl.textContent = String(yearlyTotal);
      graphEl.removeAttribute('aria-busy');
      renderGraph(contributions);
    };

    if (window[DATA_KEY]) {
      const cached = parsePayload(window[DATA_KEY]);
      if (cached) {
        applyData(cached);
        return;
      }
    }

    for (const url of DATA_URLS) {
      try {
        const data = await fetchDataSource(url);
        if (data?.contributions?.length) {
          applyData(data);
          return;
        }
      } catch (_) {
        // try next source
      }
    }

    try {
      const response = await fetch(FALLBACK_API_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      applyData(await response.json());
    } catch (_) {
      graphEl.removeAttribute('aria-busy');
      totalEl.textContent = '—';
      renderError();
    }
  };

  root.addEventListener('mouseleave', hideTooltip);

  let resizeTimer;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (lastContributions) renderGraph(lastContributions);
    }, 120);
  });

  loadContributions();
})();
