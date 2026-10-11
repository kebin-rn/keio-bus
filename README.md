# 京王バス 運行情報マップ

公共交通オープンデータセンター (ODPT) のリアルタイムデータを利用して、京王バスの運行情報を Google Maps 上に表示する Web アプリケーションです。

## 機能

- リアルタイムバス位置情報の地図表示 (`odpt:Bus`)
- 30 秒ごとの自動更新
- 遅延状況の可視化 (定時 / 軽微遅延 / 遅延 / 早発)
- 系統 (`odpt:BusroutePattern`) でのフィルタリング
- バスを選択すると進行方向の停留所など詳細を表示
- バスを選択すると、その便の経路 (道路に沿った線) と停留所を地図に表示 (「経路表示」スイッチでオン/オフ)
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

#### Google Routes API (任意・経路を道路に沿って描く場合)
1. Google Cloud Console で **Routes API** を有効化
2. ブラウザ用とは別に API キーを発行し、「API の制限」で **Routes API のみ** に絞る
   (サーバーから呼び出すため HTTP リファラー制限は付けない。キーはブラウザに公開されない)
3. 無料枠を超えないよう、必要に応じて Routes API の割り当て (Compute Routes の 1 日あたりのリクエスト数) に上限を設定する (月 5,000 件の無料枠に収めるなら 1 日 150 件程度)

詳しくは [経路表示](#経路表示) を参照。

### 2. 環境変数の設定

```bash
cp .env.local.example .env.local
```

`.env.local` を編集して以下を設定:

```bash
ODPT_CONSUMER_KEY=...                    # サーバー側でのみ使用
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...      # ブラウザに公開される
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=...       # Advanced Marker 用 Map ID

# 任意: 経路を道路に沿って描くための Routes API キー (サーバー側でのみ使用)
GOOGLE_ROUTES_API_KEY=...

# 任意: ハチ公バス (春の小川ルート) の専用車両の車番。
# ODPT に系統情報が無いため、車番一致で「ハチ公バス 春の小川ルート」と表示する。
# カンマ区切りの 5 桁半角数字 (サーバー側でのみ使用)
HACHIKO_BUS_VEHICLE_NUMBERS=12345,23456
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

`GOOGLE_ROUTES_API_KEY` も `NEXT_PUBLIC_` を付けていないため、サーバー側 (`/api/shape`) でのみ使われます。

## 経路表示

地図でバスを選ぶと、その便がこれから走る経路を青い線、通過済みの経路を灰色の線で表示し、停留所を点で示します (停留所の点をタップすると停留所名と到着予定時刻を表示)。

フィルタ欄の「経路表示」スイッチ (PC 版は右端、スマホ版は検索欄の右) でオフにすると、バスを選んでも経路を表示せず、経路の情報 (Routes API を含む) も取得しません。設定はブラウザに保存され、PC 版とスマホ版で共有されます。

京王バスの GTFS には経路の形状 (`shapes.txt`) が含まれていないため、停留所を順に結んだ道路上の経路を **Google Routes API** で求めています。

- 停留所に進行方向を指定して反対車線に寄せられるのを防ぎ、それでも U ターンや大回りを含む区間・停留所から離れた区間は採用しません
- 進行方向を指定するため、Routes API の料金区分は Pro (月 5,000 リクエストまで無料) になります。停留所 27 か所ごとに 1 リクエストにまとめて、要求数を抑えています
- 同じ停留所の並び (運行パターン) の経路は 7 日間キャッシュし、使い回します。京王バスの運行パターンは 600 弱なので、すべてを一巡しても 600 リクエスト程度です
- `GOOGLE_ROUTES_API_KEY` が未設定の場合や、経路を求められなかった区間は、停留所を直線で結んだおおよその経路を点線で表示します

## ライセンス・データ表示

このアプリは公共交通オープンデータセンターのデータを利用しています。利用に際しては [利用規約](https://www.odpt.org/terms/) に従ってください。表示するデータの正確性は保証されません。
