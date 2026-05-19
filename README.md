# しおり🔖 Homepage

GitHub Pages で公開している個人サイトです。

## ディレクトリ構成

```
Homepage/
├── index.html          # トップ（GitHub Pages のエントリ）
├── articles.html       # 記事一覧
├── profile.html
├── works.html
│
├── articles/           # ローカル記事（Markdown から生成された HTML）
├── assets/
│   ├── icons/          # サイト・アプリアイコン
│   ├── profile/        # プロフィール用画像
│   └── media/          # 記事・Works 用メディア
├── content/
│   └── articles/       # ローカル記事の Markdown 原稿
├── css/
│   └── main.css
├── js/                 # ブラウザ用スクリプト
├── data/               # ビルドで生成する JSON / JS マニフェスト
└── tools/              # Node ビルドスクリプト
```

## ビルド

ローカル記事を追加・更新したとき、または note / Qiita / Zenn のサムネを更新したとき:

```bash
npm run build
```

個別に実行する場合:

```bash
npm run build:articles   # content/articles/*.md → articles/*.html + data/local-articles.*
npm run build:images     # 外部記事サムネ → data/article-images.*
```

## ローカルプレビュー

```bash
python3 -m http.server 8765
```

ブラウザで http://127.0.0.1:8765/ を開いてください。
