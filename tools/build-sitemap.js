#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { SITE_BASE, SITEMAP_PAGES } = require('./seo-config');

const rootDir = path.resolve(__dirname, '..');
const lastmod = new Date().toISOString().slice(0, 10);

const urls = SITEMAP_PAGES.map(({ path: pagePath, changefreq, priority }) => {
  const loc = pagePath === '/'
    ? `${SITE_BASE}/`
    : `${SITE_BASE}${pagePath}`;
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

fs.writeFileSync(path.join(rootDir, 'sitemap.xml'), xml, 'utf8');

const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_BASE}/sitemap.xml
`;

fs.writeFileSync(path.join(rootDir, 'robots.txt'), robots, 'utf8');
console.log('Wrote sitemap.xml and robots.txt');
