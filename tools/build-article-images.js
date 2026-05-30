#!/usr/bin/env node
/**
 * 記事URL → サムネURL のマニフェストをビルド時に生成する。
 * ブラウザの CORS / プロキシ制限を避け、一覧の画像を安定表示する。
 *
 * Usage: node js/build-article-images.js
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

const NOTE_FEED_URL = 'https://note.com/shiori_02_14_/rss';
const QIITA_USER_ID = 'shiori_02_14_';
const QIITA_API_URL = `https://qiita.com/api/v2/users/${QIITA_USER_ID}/items`;
const ZENN_USER_ID = 'shiori_02_14';
const ZENN_FEED_URL = `https://zenn.dev/${ZENN_USER_ID}/feed`;
const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';

const MRSS_NS_THUMB_RE = /<media:thumbnail\b[^>]*\burl=["']([^"']+)["']/i;
const MRSS_NS_THUMB_TEXT_RE = /<media:thumbnail[^>]*>([^<]+)<\/media:thumbnail>/i;

const normalizeLink = (url) => String(url || '').trim().replace(/\/$/, '');

const normalizeNoteThumb = (url) => {
  if (!url) return '';
  let next = String(url);
  if (next.includes('assets.st-note.com') && /[?&]width=\d+/.test(next)) {
    next = next.replace(/([?&]width=)\d+/, '$1640');
  } else if (next.includes('assets.st-note.com') && !next.includes('width=')) {
    next += (next.includes('?') ? '&' : '?') + 'width=640';
  }
  return next;
};

const extractOgpImageFromHtml = (html) => {
  if (!html || typeof html !== 'string') return '';
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const url = m[1].replace(/&amp;/g, '&').trim();
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
    }
  }
  return '';
};

const fetchText = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'shiori-homepage-build/1.0' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};

const fetchJson = async (url, timeoutMs = 12000) => {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text);
};

const parseNoteRss = (xmlText) => {
  const items = [];
  const blocks = xmlText.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const link = block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim() || '';
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || '';
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || '';
    const dateMs = pubDate ? Date.parse(pubDate) : 0;
    let imageUrl = '';
    const mrss = block.match(MRSS_NS_THUMB_RE) || block.match(MRSS_NS_THUMB_TEXT_RE);
    if (mrss && mrss[1]) imageUrl = mrss[1].replace(/&amp;/g, '&').trim();
    if (!imageUrl) {
      const imgMatch = block.match(/<description>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) imageUrl = imgMatch[1].replace(/&amp;/g, '&').trim();
    }
    if (link && title) {
      items.push({
        link,
        title,
        date: pubDate,
        dateMs: Number.isFinite(dateMs) ? dateMs : 0,
        imageUrl: normalizeNoteThumb(imageUrl)
      });
    }
  }
  return items;
};

const extractNoteKey = (url) => {
  const match = String(url).match(/note\.com\/[^/]+\/n\/([^/?]+)/);
  return match?.[1] || '';
};

const fetchNoteEyecatch = async (noteKey) => {
  if (!noteKey) return '';
  try {
    const json = await fetchJson(`https://note.com/api/v3/notes/${noteKey}`);
    const eyecatch = json?.data?.eyecatch;
    return typeof eyecatch === 'string' ? normalizeNoteThumb(eyecatch) : '';
  } catch (error) {
    console.warn(`  note API skip (${noteKey}):`, error.message);
    return '';
  }
};

const fetchOgpImage = async (articleUrl) => {
  if (!articleUrl.startsWith('http')) return '';
  try {
    const html = await fetchText(articleUrl, 10000);
    return extractOgpImageFromHtml(html);
  } catch (error) {
    console.warn(`  OGP skip (${articleUrl}):`, error.message);
    return '';
  }
};

const imageFromRss2JsonItem = (item) => {
  let imageUrl = '';
  if (item.enclosure) {
    if (typeof item.enclosure === 'string') imageUrl = item.enclosure;
    else if (item.enclosure.link) imageUrl = item.enclosure.link;
    else if (item.enclosure.url) imageUrl = item.enclosure.url;
  }
  if (!imageUrl && item.thumbnail) imageUrl = item.thumbnail;
  if (!imageUrl && item.description) {
    const imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) imageUrl = imgMatch[1].replace(/&amp;/g, '&').trim();
  }
  return imageUrl;
};

const setImage = (manifest, link, imageUrl) => {
  const normalizedLink = normalizeLink(link);
  const url = String(imageUrl || '').trim();
  if (!normalizedLink || !url) return;
  manifest[normalizedLink] = url;
};

const buildNoteImages = async (manifest, noteFeedOut) => {
  console.log('note RSS...');
  const xml = await fetchText(NOTE_FEED_URL);
  const items = parseNoteRss(xml);
  if (Array.isArray(noteFeedOut)) {
    noteFeedOut.push(...items.map((item) => ({
      title: item.title,
      link: item.link,
      date: item.date || '',
      dateMs: item.dateMs || 0,
      imageUrl: item.imageUrl || '',
      source: 'note'
    })));
  }
  for (const item of items) {
    let imageUrl = item.imageUrl;
    if (!imageUrl) {
      const noteKey = extractNoteKey(item.link);
      imageUrl = await fetchNoteEyecatch(noteKey);
    }
    if (!imageUrl) {
      imageUrl = await fetchOgpImage(item.link);
    }
    setImage(manifest, item.link, imageUrl);
    console.log(`  ${imageUrl ? '✓' : '–'} ${item.title.slice(0, 40)}`);
  }
};

const buildQiitaImages = async (manifest) => {
  console.log('qiita API...');
  const items = await fetchJson(`${QIITA_API_URL}?per_page=20`);
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const link = item.url || '';
    let imageUrl = await fetchOgpImage(link);
    setImage(manifest, link, imageUrl);
    console.log(`  ${imageUrl ? '✓' : '–'} ${(item.title || '').slice(0, 40)}`);
  }
};

const buildZennImages = async (manifest) => {
  console.log('zenn RSS (rss2json)...');
  const data = await fetchJson(`${RSS2JSON}${encodeURIComponent(ZENN_FEED_URL)}`);
  const items = Array.isArray(data?.items) ? data.items : [];
  for (const item of items) {
    const link = item.link || '';
    let imageUrl = imageFromRss2JsonItem(item);
    if (!imageUrl) imageUrl = await fetchOgpImage(link);
    setImage(manifest, link, imageUrl);
    console.log(`  ${imageUrl ? '✓' : '–'} ${(item.title || '').slice(0, 40)}`);
  }
};

const main = async () => {
  const manifest = {};
  const noteFeed = [];
  await buildNoteImages(manifest, noteFeed);
  await buildQiitaImages(manifest);
  await buildZennImages(manifest);

  const sorted = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))
  );

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'article-images.json'),
    `${JSON.stringify(sorted, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(dataDir, 'article-images.js'),
    `window.__ARTICLE_IMAGES__ = ${JSON.stringify(sorted, null, 2)};\n`,
    'utf8'
  );

  const noteFeedSorted = noteFeed
    .slice()
    .sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
  fs.writeFileSync(
    path.join(dataDir, 'note-feed.json'),
    `${JSON.stringify(noteFeedSorted, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(dataDir, 'note-feed.js'),
    `window.__NOTE_FEED__ = ${JSON.stringify(noteFeedSorted, null, 2)};\n`,
    'utf8'
  );

  console.log(`\nBuilt ${Object.keys(sorted).length} article image(s), ${noteFeedSorted.length} note feed item(s).`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
