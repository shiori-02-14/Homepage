(() => {
  'use strict';

  // RSSフィードのURL（NoteのRSSフィード）
  const RSS_FEED_URL = 'https://note.com/shiori_02_14_/rss';
  
  // CORSプロキシ（必要に応じて変更可能）
  // オプション1: RSS2JSON（無料プランあり）- 現在有効
  const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';
  
  // オプション2: CORS Anywhere（開発用、本番では使わない）
  // const RSS_PROXY = 'https://cors-anywhere.herokuapp.com/';
  
  // オプション3: 直接取得（CORSが許可されている場合）
  // const RSS_PROXY = '';

  // 記事を表示するコンテナ
  const articlesContainer = document.querySelector('#articles-page .cards');
  if (!articlesContainer) return;

  // 既存の記事カードを保持（手動で追加した記事）
  const existingArticles = Array.from(articlesContainer.querySelectorAll('.card--article:not([data-rss])'));

  // RSSフィードを取得してパース
  const fetchRSSFeed = async () => {
    try {
      const feedUrl = RSS_PROXY ? `${RSS_PROXY}${encodeURIComponent(RSS_FEED_URL)}` : RSS_FEED_URL;
      
      // RSS2JSONを使う場合
      if (RSS_PROXY.includes('rss2json')) {
        const response = await fetch(feedUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        // RSS2JSONのレスポンス形式に合わせて変換
        if (data.items && Array.isArray(data.items)) {
          return data.items.map(item => {
            // 画像URLを複数の方法で取得
            let imageUrl = '';
            
            // 1. enclosureから取得
            if (item.enclosure && item.enclosure.link) {
              imageUrl = item.enclosure.link;
            }
            // 2. thumbnailから取得
            else if (item.thumbnail) {
              imageUrl = item.thumbnail;
            }
            // 3. descriptionのHTMLから画像を抽出（複数のパターンに対応）
            if (!imageUrl && item.description) {
              // パターン1: src="..." または src='...'
              let imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (!imgMatch) {
                // パターン2: src=... (クォートなし)
                imgMatch = item.description.match(/<img[^>]+src=([^\s>]+)/i);
              }
              if (imgMatch && imgMatch[1]) {
                imageUrl = imgMatch[1].replace(/["']/g, '');
                // 相対URLの場合は絶対URLに変換
                if (imageUrl.startsWith('//')) {
                  imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                  imageUrl = 'https://note.com' + imageUrl;
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
            
            return {
              title: item.title || '',
              link: item.link || '',
              date: item.pubDate ? formatDate(new Date(item.pubDate)) : '',
              imageUrl: imageUrl,
              description: item.description || ''
            };
          });
        }
        return [];
      }
      
      // 直接RSSを取得する場合
      const response = await fetch(feedUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const xmlText = await response.text();
      return parseRSS(xmlText);
    } catch (error) {
      console.error('RSS取得エラー:', error);
      return [];
    }
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
      
      // 画像URLを抽出（descriptionから）
      const imgMatch = description.match(/<img[^>]+src="([^"]+)"/i);
      const imageUrl = imgMatch ? imgMatch[1] : '';
      
      // 日付をフォーマット
      const date = pubDate ? formatDate(new Date(pubDate)) : '';
      
      return { title, link, date, imageUrl, description };
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
    
    const link = document.createElement('a');
    link.className = 'card__link';
    link.href = article.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    // バッジ
    const badge = document.createElement('span');
    badge.className = 'badge badge--note badge--corner';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = 'NOTE';
    link.appendChild(badge);
    
    // サムネイル
    const thumb = document.createElement('div');
    thumb.className = 'card__thumb';
    
    if (article.imageUrl && article.imageUrl.trim() !== '') {
      const img = document.createElement('img');
      img.src = article.imageUrl;
      img.alt = `${article.title}のサムネ`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.fetchPriority = 'low';
      img.onerror = function() {
        // 画像の読み込みに失敗した場合はプレースホルダーに変更
        console.warn('画像の読み込みに失敗:', article.imageUrl);
        thumb.className = 'card__thumb card__thumb--placeholder';
        thumb.removeChild(img);
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

  // 記事を表示
  const displayArticles = (articles) => {
    // 既存のRSS記事を削除
    const existingRSSArticles = articlesContainer.querySelectorAll('[data-rss="true"]');
    existingRSSArticles.forEach(el => el.remove());
    
    // 新しい記事を追加（既存の記事の前に挿入）
    const firstExisting = existingArticles[0];
    articles.forEach(article => {
      const card = createArticleCard(article);
      if (firstExisting && firstExisting.parentNode) {
        firstExisting.parentNode.insertBefore(card, firstExisting);
      } else {
        articlesContainer.appendChild(card);
      }
    });
  };

  // 初期化
  const init = async () => {
    const articles = await fetchRSSFeed();
    if (articles.length > 0) {
      // デバッグ用：画像URLの取得状況を確認
      console.log('取得した記事（最初の3件）:', articles.slice(0, 3).map(a => ({
        title: a.title.substring(0, 30),
        hasImage: !!a.imageUrl,
        imageUrl: a.imageUrl ? a.imageUrl.substring(0, 80) : 'なし'
      })));
      
      // 最新10件のみ表示
      const latestArticles = articles.slice(0, 10);
      displayArticles(latestArticles);
    } else {
      console.warn('RSSから記事を取得できませんでした');
    }
  };

  // ページ読み込み時に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

