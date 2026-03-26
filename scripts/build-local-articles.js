#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const contentDir = path.join(rootDir, 'content', 'articles');
const dataDir = path.join(rootDir, 'data');
const articlesOutDir = path.join(rootDir, 'articles');

const SITE_TITLE = 'しおり🔖';
const SITE_DESCRIPTION = 'しおり🔖のローカル記事一覧です。';
const SITE_IMAGE = 'https://i.pinimg.com/736x/59/0c/a0/590ca0a7e1027cea004f6313ca834456.jpg?v=20260105';
const SITE_URL = 'https://shiori-02-14.github.io/Homepage';

const ensureDir = (targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeAttr = (value) => escapeHtml(value).replace(/`/g, '&#96;');

const slugify = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s/]+/g, '-')
  .replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '') || 'article';

const stripInlineMarkdown = (value) => String(value || '')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1')
  .replace(/~~([^~]+)~~/g, '$1')
  .trim();

const stripHtmlTags = (value) => String(value || '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, '\'')
  .replace(/\s+/g, ' ')
  .trim();

const parseFrontmatter = (source) => {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { data: {}, body: normalized };
  }

  const endIdx = normalized.indexOf('\n---\n', 4);
  if (endIdx === -1) {
    return { data: {}, body: normalized };
  }

  const rawFrontmatter = normalized.slice(4, endIdx);
  const body = normalized.slice(endIdx + 5);
  const data = {};

  rawFrontmatter.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIdx = trimmed.indexOf(':');
    if (separatorIdx === -1) return;
    const key = trimmed.slice(0, separatorIdx).trim();
    let value = trimmed.slice(separatorIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  });

  return { data, body };
};

const parseDate = (value) => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDisplayDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
};

const formatLongDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}年${m}月${d}日`;
};

const toAbsoluteSiteUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return SITE_IMAGE;
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  return `${SITE_URL}/${raw.replace(/^\.?\//, '')}`;
};

const buildLinkAttrs = (href) => {
  const value = String(href || '').trim();
  if (!value) return 'href="#"';
  const isExternal = /^https?:\/\//i.test(value);
  if (isExternal) {
    return `href="${escapeAttr(value)}" target="_blank" rel="noopener noreferrer"`;
  }
  return `href="${escapeAttr(value)}"`;
};

const renderInline = (input) => {
  const codeTokens = [];
  let text = String(input || '').replace(/`([^`]+)`/g, (_, code) => {
    const token = `__CODE_TOKEN_${codeTokens.length}__`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = escapeHtml(text);
  text = text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async" />`)
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a ${buildLinkAttrs(href)}>${label}</a>`);

  codeTokens.forEach((html, index) => {
    text = text.replace(`__CODE_TOKEN_${index}__`, html);
  });

  return text;
};

const joinParagraphLines = (lines) => {
  const tokens = [];
  (Array.isArray(lines) ? lines : []).forEach((line, index) => {
    const hasHardBreak = /\s{2,}$/.test(line);
    tokens.push(line.replace(/\s+$/, ''));
    if (index < lines.length - 1) {
      tokens.push(hasHardBreak ? '__BR__' : ' ');
    }
  });
  return tokens.join('');
};

const parseTableRow = (line) => {
  const trimmed = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
};

const isTableSeparator = (line) => /^\|?(?:\s*:?-{3,}:?\s*\|)+(?:\s*:?-{3,}:?\s*)?\|?$/.test(String(line || '').trim());

const renderMarkdown = (source) => {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const htmlParts = [];
  const headings = [];
  const slugCounts = new Map();
  let topHeadingCount = 0;
  let index = 0;

  const nextHeadingId = (text) => {
    const base = slugify(stripInlineMarkdown(text));
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  const isSpecialLine = (line, nextLine) => {
    const value = String(line || '');
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return true;
    if (/^```/.test(trimmed)) return true;
    if (/^\s*>\s?/.test(value)) return true;
    if (/^\s*[-*]\s+/.test(value)) return true;
    if (/^\s*\d+\.\s+/.test(value)) return true;
    if (value.includes('|') && isTableSeparator(nextLine || '')) return true;
    return false;
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = String(line || '').trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const lang = trimmed.replace(/^```/, '').trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(String(lines[index] || '').trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const className = lang ? ` class="language-${escapeAttr(lang)}"` : '';
      htmlParts.push(`<pre><code${className}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const rawLevel = headingMatch[1].length;
      let level = rawLevel;
      const text = headingMatch[2].trim();
      if (rawLevel === 1) {
        topHeadingCount += 1;
      }
      if (topHeadingCount > 0) {
        if (topHeadingCount === 1 && rawLevel === 1) {
          level = 1;
        } else {
          level = Math.min(rawLevel + 1, 6);
        }
      }
      const id = nextHeadingId(text);
      if (level >= 2 && level <= 3) {
        headings.push({ level, id, text: stripInlineMarkdown(text) });
      }
      htmlParts.push(`<h${level} id="${escapeAttr(id)}">${renderInline(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      htmlParts.push('<hr />');
      index += 1;
      continue;
    }

    if (trimmed.includes('|') && isTableSeparator(lines[index + 1] || '')) {
      const headerCells = parseTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && String(lines[index] || '').trim().startsWith('|')) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      const headHtml = headerCells.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join('');
      const bodyHtml = rows.map((row) => {
        const cellsHtml = row.map((cell, cellIndex) => {
          const headerLabel = stripInlineMarkdown(headerCells[cellIndex] || '');
          const labelAttr = headerLabel ? ` data-label="${escapeAttr(headerLabel)}"` : '';
          return `<td${labelAttr}>${renderInline(cell)}</td>`;
        }).join('');
        return `<tr>${cellsHtml}</tr>`;
      }).join('\n');
      htmlParts.push(`<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^\s*>\s?/.test(String(lines[index] || ''))) {
        quoteLines.push(String(lines[index]).replace(/^\s*>\s?/, ''));
        index += 1;
      }
      const quoteText = renderInline(joinParagraphLines(quoteLines)).replace(/__BR__/g, '<br />');
      htmlParts.push(`<blockquote><p>${quoteText}</p></blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const isOrdered = /^\s*\d+\.\s+/.test(line);
      const tagName = isOrdered ? 'ol' : 'ul';
      const items = [];
      while (index < lines.length) {
        const current = String(lines[index] || '');
        const match = isOrdered
          ? current.match(/^\s*\d+\.\s+(.+)$/)
          : current.match(/^\s*[-*]\s+(.+)$/);
        if (!match) break;
        items.push(`<li>${renderInline(match[1].trim())}</li>`);
        index += 1;
      }
      htmlParts.push(`<${tagName}>${items.join('')}</${tagName}>`);
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && !isSpecialLine(lines[index], lines[index + 1])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    const paragraphHtml = renderInline(joinParagraphLines(paragraphLines)).replace(/__BR__/g, '<br />');
    htmlParts.push(`<p>${paragraphHtml}</p>`);
  }

  return { html: htmlParts.join('\n'), headings };
};

const extractExcerptFromHtml = (html) => {
  const paragraphs = String(html || '').match(/<p>[\s\S]*?<\/p>/g) || [];
  for (const paragraph of paragraphs) {
    const text = stripHtmlTags(paragraph);
    if (text) return text;
  }
  return '';
};

const buildTocHtml = (headings) => {
  const items = (Array.isArray(headings) ? headings : []).filter((item) => item.level === 2 || item.level === 3);
  if (items.length === 0) return '';

  const groups = [];
  let currentGroup = null;

  items.forEach((item) => {
    if (item.level === 2 || !currentGroup) {
      currentGroup = {
        parent: item.level === 2 ? item : null,
        children: item.level === 3 ? [item] : []
      };
      groups.push(currentGroup);
      return;
    }
    currentGroup.children.push(item);
  });

  const groupsHtml = groups.map((group) => {
    const parent = group.parent;
    const childHtml = group.children.length > 0
      ? [
          '      <ol class="article-toc__sublist">',
          ...group.children.map((child) => `        <li class="article-toc__subitem"><a class="article-toc__subitem-link" href="#${escapeAttr(child.id)}">${escapeHtml(child.text)}</a></li>`),
          '      </ol>'
        ].join('\n')
      : '';

    if (!parent) {
      return childHtml;
    }

    return [
      '    <li class="article-toc__item">',
      `      <a class="article-toc__link" href="#${escapeAttr(parent.id)}">${escapeHtml(parent.text)}</a>`,
      childHtml,
      '    </li>'
    ].join('\n');
  }).join('\n');

  return [
    '<nav class="article-toc" aria-label="目次">',
    '  <div class="article-toc__header">',
    '    <p class="article-toc__title">目次</p>',
    `    <p class="article-toc__hint">${items.length}項目あります。気になるところから読めます。</p>`,
    '  </div>',
    '  <ol class="article-toc__list">',
    groupsHtml,
    '  </ol>',
    '</nav>'
  ].join('\n');
};

const buildArticleHtml = (article) => {
  const tocHtml = buildTocHtml(article.headings);
  const articleImageSrc = article.image ? `../${article.image}` : '';
  const shareUrl = `${SITE_URL}/articles/${article.slug}.html`;
  const pageDescription = String(article.description || '').trim();
  const coverImage = article.image
    ? [
        '      <figure class="article-cover">',
        `        <img src="${escapeAttr(articleImageSrc)}" alt="${escapeAttr(article.imageAlt || `${article.title} の画像`)}" loading="eager" decoding="async" />`,
        '      </figure>'
      ].join('\n')
    : '';
  const shareImage = toAbsoluteSiteUrl(article.image || SITE_IMAGE);
  const jsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    image: shareImage,
    datePublished: article.dateIso,
    dateModified: article.dateIso,
    author: {
      '@type': 'Person',
      name: SITE_TITLE
    },
    mainEntityOfPage: shareUrl
  };
  if (pageDescription) {
    jsonLdObject.description = pageDescription;
  }
  const jsonLd = JSON.stringify(jsonLdObject, null, 2);

  return `<!doctype html>
<html lang="ja" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(article.title)} | ${SITE_TITLE}</title>
  <meta name="keywords" content="しおり,記事,ブログ,電気通信大学" />
  <link rel="canonical" href="${escapeAttr(shareUrl)}" />
${pageDescription ? `  <meta name="description" content="${escapeAttr(pageDescription)}" />` : ''}

  <meta property="og:site_name" content="${escapeAttr(SITE_TITLE)}" />
  <meta property="og:title" content="${escapeAttr(article.title)} | ${SITE_TITLE}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeAttr(shareUrl)}" />
  <meta property="og:locale" content="ja_JP" />
  <meta property="og:image" content="${escapeAttr(shareImage)}" />
  <meta property="og:image:secure_url" content="${escapeAttr(shareImage)}" />
  <meta property="og:image:alt" content="${escapeAttr(article.imageAlt || `${article.title} の画像`)}" />
${pageDescription ? `  <meta property="og:description" content="${escapeAttr(pageDescription)}" />` : ''}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(article.title)} | ${SITE_TITLE}" />
  <meta name="twitter:url" content="${escapeAttr(shareUrl)}" />
  <meta name="twitter:image" content="${escapeAttr(shareImage)}" />
  <meta name="twitter:image:alt" content="${escapeAttr(article.imageAlt || `${article.title} の画像`)}" />
${pageDescription ? `  <meta name="twitter:description" content="${escapeAttr(pageDescription)}" />` : ''}

  <link rel="stylesheet" href="../css/main.css?v=20260326-articles-thumb-16-9" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="icon" type="image/jpeg" href="${escapeAttr(SITE_IMAGE)}" />
  <link rel="apple-touch-icon" href="${escapeAttr(SITE_IMAGE)}" />
</head>
<body id="article-page">
  <header class="site-header" aria-label="ヘッダー">
    <div class="site-header__inner">
      <a href="../index.html" class="reload-btn" id="reload-btn" aria-label="ホームへ">
        <span class="reload-icon-wrapper">
          <img src="${escapeAttr(SITE_IMAGE)}" alt="しおり" class="reload-icon" width="42" height="42" loading="eager" decoding="async" referrerpolicy="no-referrer" />
        </span>
        <span class="reload-text">${SITE_TITLE}</span>
      </a>

      <nav class="top-nav" aria-label="サイト内リンク">
        <a href="../index.html">Home</a>
        <a href="../articles.html">Articles</a>
        <a href="../works.html">Works</a>
        <a href="../profile.html">Profile</a>
      </nav>

      <button class="theme-toggle theme-toggle--switch" id="theme-toggle" type="button" role="switch" aria-checked="false" aria-label="ダークモードに切り替え" title="テーマを切り替え">
        <span class="theme-toggle__glyph theme-toggle__glyph--sun" aria-hidden="true">
          <svg class="theme-icon theme-icon--sun" viewBox="0 0 24 24" role="presentation">
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path>
          </svg>
        </span>
        <span class="theme-toggle__track" aria-hidden="true">
          <span class="theme-toggle__knob" aria-hidden="true"></span>
        </span>
        <span class="theme-toggle__glyph theme-toggle__glyph--moon" aria-hidden="true">
          <svg class="theme-icon theme-icon--moon" viewBox="0 0 24 24" role="presentation">
            <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 1 0 11.5 11.5z"></path>
          </svg>
        </span>
        <span class="theme-toggle__text sr-only">ライト</span>
      </button>
    </div>
  </header>

  <main class="wrap">
    <article class="article-shell narrow" aria-labelledby="article-title">
      <header class="article-header section__intro section__intro--bar">
        <p class="article-kicker">Local Article</p>
        <h1 id="article-title" class="page-title">${escapeHtml(article.title)}</h1>
        <div class="article-meta">
          <time datetime="${escapeAttr(article.dateIso)}">${escapeHtml(article.longDate)}</time>
        </div>
      </header>

      ${coverImage}

      ${tocHtml}

      <div class="article-content" itemprop="articleBody">
${article.bodyHtml.split('\n').map((line) => `        ${line}`).join('\n')}
      </div>

      <nav class="article__cta" aria-label="記事の操作">
        <a class="btn btn--ghost" href="../articles.html">← 記事一覧に戻る</a>
      </nav>
    </article>

    <footer class="foot">© <span id="y"></span> ${SITE_TITLE}</footer>
  </main>

  <script src="../scripts/main.js" defer></script>
  <script type="application/ld+json">
${jsonLd}
  </script>
</body>
</html>
`;
};

const createArticleMeta = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const title = String(data.title || '').trim();
  const slug = slugify(data.slug || path.basename(filePath, path.extname(filePath)));
  const date = parseDate(data.date);
  const description = String(data.description || '').trim();
  const excerpt = String(data.excerpt || '').trim();
  const image = String(data.image || '').trim();
  const imageAlt = String(data.imageAlt || `${title} の画像`).trim();

  if (!title) {
    throw new Error(`${path.relative(rootDir, filePath)} に title がありません`);
  }
  if (!date) {
    throw new Error(`${path.relative(rootDir, filePath)} に有効な date がありません`);
  }

  const { html, headings } = renderMarkdown(body);
  const excerptFallback = extractExcerptFromHtml(html);
  return {
    title,
    slug,
    description,
    excerpt: excerpt || description || excerptFallback || title,
    bodyHtml: html,
    headings,
    image,
    imageAlt,
    date,
    dateIso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    dateDisplay: formatDisplayDate(date),
    longDate: formatLongDate(date),
    sourcePath: filePath
  };
};

const build = () => {
  ensureDir(dataDir);

  const sourceFiles = fs.readdirSync(contentDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => path.join(contentDir, fileName));

  const articles = sourceFiles.map(createArticleMeta)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  ensureDir(articlesOutDir);
  articles.forEach((article) => {
    const htmlPath = path.join(articlesOutDir, `${article.slug}.html`);
    const html = buildArticleHtml(article);
    fs.writeFileSync(htmlPath, html, 'utf8');
  });

  const manifest = articles.map((article) => ({
    title: article.title,
    slug: article.slug,
    link: `articles/${article.slug}.html`,
    date: article.dateDisplay,
    dateMs: article.date.getTime(),
    imageUrl: article.image || '',
    source: 'local',
    description: article.description,
    excerpt: article.excerpt,
    external: false
  }));

  fs.writeFileSync(path.join(dataDir, 'local-articles.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(dataDir, 'local-articles.js'), `window.__LOCAL_ARTICLES__ = ${JSON.stringify(manifest, null, 2)};\n`, 'utf8');

  console.log(`Built ${articles.length} local article(s).`);
};

build();
