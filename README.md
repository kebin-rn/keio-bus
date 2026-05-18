# 京王バス 運行情報マップ

公共交通オープンデータセンター (ODPT) のリアルタイムデータを利用して、京王バスの運行情報を Google Maps 上に表示する Web アプリケーションです。

## 機能

- リアルタイムバス位置情報の地図表示 (`odpt:Bus`)
- 30 秒ごとの自動更新
- 遅延状況の可視化 (定時 / 軽微遅延 / 遅延 / 早発)
- 系統 (`odpt:BusroutePattern`) でのフィルタリング
- バスを選択すると進行方向の停留所など詳細を表示
- 運行状況のサマリ (運行台数・定時運行率)

## 技術スタック

- Next.js 14 (App Router)
- React 18 / TypeScript
- Google Maps (`@vis.gl/react-google-maps`)
- ODPT API v4

## セットアップ

### 1. API キーの取得

#### ODPT (公共交通オープンデータセンター)
1. <https://developer.odpt.org/> に登録
2. アクセストークン (Consumer Key) を発行

#### Google Maps
1. Google Cloud Console で **Maps JavaScript API** を有効化
2. API キーを発行 (HTTP リファラー制限の設定を推奨)
3. Map ID を作成 (Advanced Markers に必要)

### 2. 環境変数の設定

```bash
cp .env.local.example .env.local
```

`.env.local` を編集して以下を設定:

```bash
ODPT_CONSUMER_KEY=...                    # サーバー側でのみ使用
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...      # ブラウザに公開される
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=...       # Advanced Marker 用 Map ID
NEXT_PUBLIC_KEIO_BUS_OPERATORS=odpt.Operator:KeioBus
```

### 3. 依存パッケージのインストール

```bash
npm install
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

<http://localhost:3000> を開いてください。

### 5. プロダクションビルド

```bash
npm run build
npm start
```

## 構成

```
app/
├── api/
│   ├── buses/route.ts        # ODPT odpt:Bus プロキシ
│   ├── busroutes/route.ts    # ODPT odpt:BusroutePattern プロキシ
│   └── busstops/route.ts     # ODPT odpt:BusstopPole プロキシ
├── components/
│   ├── BusMap.tsx            # Google Maps + マーカー
│   └── BusInfoPanel.tsx      # サイドパネル (一覧/フィルタ)
├── lib/
│   ├── odpt.ts               # ODPT API クライアント
│   └── format.ts             # 遅延分類など
├── types/
│   └── odpt.ts               # ODPT レスポンス型
├── layout.tsx
├── page.tsx                  # メインページ
└── globals.css
```

## ODPT API キーの取り扱い

`ODPT_CONSUMER_KEY` は **`NEXT_PUBLIC_` プレフィックスを付けていない** ため、Next.js のサーバーランタイムでのみ参照されます。ブラウザに送られるバンドルには含まれません。API リクエストはすべて `/api/*` 経由でプロキシされます。

Google Maps の API キーはクライアント側で必要となるため公開されますが、HTTP リファラー制限を必ず設定してください。

## ライセンス・データ表示

このアプリは公共交通オープンデータセンターのデータを利用しています。利用に際しては [利用規約](https://www.odpt.org/terms/) に従ってください。表示するデータの正確性は保証されません。
