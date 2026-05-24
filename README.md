# しおり🔖 Homepage

GitHub Pages で公開している個人サイトです。

https://shiori-02-14.github.io/Homepage/

静的 HTML / CSS / JavaScript で構成。フレームワークは使わず、GitHub Pages へそのままデプロイできる構成です。

## ページ

| ページ | ファイル | 内容 |
|--------|----------|------|
| Home | `index.html` | トップ、SNS リンク、最新記事 |
| Articles | `articles.html` | 記事一覧（外部 + ローカル） |
| Works | `works.html` | 作品・制作物 |
| Profile | `profile.html` | プロフィール、スキル |

## 主な機能

- **外部記事の集約** — note / Qiita / Zenn の RSS から Home・Articles に表示
- **ローカル記事** — `content/articles/*.md` をビルドで HTML 化
- **ダーク / ライトテーマ** — ヘッダーのトグルで切り替え
- **記事サムネの事前取得** — ビルド時に外部記事の OGP 画像を収集（CORS 回避）

## ディレクトリ構成

```
Homepage/
├── index.html              # トップ（GitHub Pages のエントリ）
├── articles.html
├── profile.html
├── works.html
├── package.json
│
├── articles/               # ローカル記事 HTML（生成物）
├── content/
│   └── articles/           # ローカル記事 Markdown 原稿
├── assets/
│   ├── icons/              # サイト・アプリ・スキルアイコン
│   ├── media/              # 記事・Works 用メディア
│   └── profile/            # プロフィール用画像
├── css/
│   └── main.css
├── js/
│   ├── main.js             # テーマ切替、おみくじ、共通 UI
│   ├── rss-loader.js       # 外部記事の取得・表示
│   └── fortune-data.js     # おみくじデータ
├── data/                   # ビルドで生成するマニフェスト
└── tools/                  # Node ビルドスクリプト
    ├── build-local-articles.js
    └── build-article-images.js
```
