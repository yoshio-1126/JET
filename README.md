# JET animated HTML

FigmaのFV（102:4990）とクリック後の画面（104:2）を実装したHTML/CSS/JavaScriptです。

## 表示と動作

- 全画像の読み込み・デコード完了まで進捗付きローディングを表示。失敗時は再試行できます。
- 紙を右下から左上へ約30度の方向に1.45秒で移動。
- 街のパーツはランダムな順序で19msずつ遅らせ、上からフェードイン。最終配置はFigmaの位置です。
- `02_interior 5` を押すと1.3秒でズームし、続いてフレームを0.75秒で表示。内部要素は130msずつ順番に表示。
- TOPボタンとEscapeキーで戻れます。キーボード操作・動きを減らす設定・スマートフォン表示に対応。
- Figmaで本文が電気工事の説明になっているため、そのまま保持しています。
- 他のコンテンツの遷移先は未提供です。業務の紹介と内装の建物が内装詳細を開きます。

## 開発

Node.js 22以降が必要です。

```sh
npm ci
npm run fonts
npm run assets
```

`.dev.vars` に `BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` を設定し、`npm run dev` で起動します。認証情報をソースに含めないでください。

```sh
npm test
npm run test:browser
```

ブラウザテストのChromiumパスは `playwright.config.js` で変更できます。

## Cloudflare Workers

自分のCloudflareアカウントに公開する場合は、Wranglerでログイン後に実行します。

```sh
npx wrangler login
npm run publish:cloudflare
```

公開前に、除外済みの `.dev.vars` または環境変数へ `BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` を設定してください。公開コマンドはWorkersへの配置、秘密情報の登録、HTML・JS・画像の未認証401／認証済み200の確認を行い、成功した `workers.dev` URLを表示します。秘密情報はソースやコマンド引数に含めません。

`run_worker_first: true` により、HTMLだけでなく画像・JS・フォントもBasic認証を通します。認証値が未設定の場合は503で拒否します。

SitesのCloudflare Workersホスティングには `npm run build` の `dist/server/index.js` を使用します。画像原本は `image-version.json` のGitコミットに固定したGitHub URLからCloudflare経由で配信・キャッシュし、一時的なFigma URLへの実行時アクセスをなくしています。ブラウザの画像リクエストは同一サイトのBasic認証を通ります。認証情報をGitHubへのリクエストに転送しません。認証情報はSitesの環境シークレットで設定します。

FigmaのダウンロードURLは期限付きです。`scripts/figma-assets.json` は取得作業用で、ブラウザに配信しません。取得済みの原本は `public/assets/` に保存します。

Figmaから書き出した画像をGitHubの `public/assets/` にアップロードする方法にも対応しています。Figmaのレイヤー名のファイル名はビルド時に対応する内部名へコピーされます。画像をひとまとめにしてサブフォルダに置くこともできます。ロゴと戻る矢印のSVGも必要です。
