'use strict';

/** @type {readonly string} */
const SITE_ORIGIN = 'https://shiori-02-14.github.io';
/** @type {readonly string} */
const SITE_BASE = `${SITE_ORIGIN}/Homepage`;
/** @type {readonly string} */
const SITE_NAME = 'しおり🔖';
/** @type {readonly string} */
const SITE_OG_IMAGE = 'https://i.pinimg.com/736x/59/0c/a0/590ca0a7e1027cea004f6313ca834456.jpg';

/** @type {readonly { path: string; changefreq: string; priority: string }[]} */
const SITEMAP_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/articles.html', changefreq: 'weekly', priority: '0.9' },
  { path: '/works.html', changefreq: 'monthly', priority: '0.8' },
  { path: '/profile.html', changefreq: 'monthly', priority: '0.8' },
  { path: '/advent2026.html', changefreq: 'weekly', priority: '0.7' },
  { path: '/articles/homepage.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/articles/tier.html', changefreq: 'monthly', priority: '0.7' },
];

module.exports = {
  SITE_ORIGIN,
  SITE_BASE,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITEMAP_PAGES,
};
