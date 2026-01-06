# Async Report Portal

非同期レポート生成システム。SQS、Worker、BFF、CSV、重い処理を通じてレポートを生成します。

## アーキテクチャ

```
[ Browser ]
   ↓
[ Next.js (frontend / BFF) ]
   ↓
[ NestJS API (backend/api) ]  ← Producer
   ↓
[ SQS ]
   ↓
   ├─→ [ NestJS Worker (backend/worker) ] ← Consumer (Node.js)
   │   ↓
   └─→ [ Rust Worker (backend/worker-rust) ] ← Consumer (Rust) [Optional]
       ↓
   [ DB / File Storage ]
```

**注意**: 
- NestJS WorkerとRust Workerは同じSQSキューからメッセージを取得して**並列に処理**します。
- 両方が起動している場合、メッセージは先に取得した方（ロングポーリングで受信した方）で処理されます。
- ローカル環境では両方が起動しますが、本番環境ではどちらか一方を選択して使用することができます。

**注意**: ローカル環境では、NestJS WorkerとRust Workerの両方が起動します。本番環境では、どちらか一方を選択して使用できます。Rust Workerは高いパフォーマンスが期待できます。

## プロジェクト構造

```
my-project/
├── docker-compose.local.yml   # ローカル環境
├── frontend/                  # Next.js（BFF）
│   ├── app/
│   │   ├── reports/
│   │   │   ├── page.tsx       # 一覧
│   │   │   └── actions.ts    # API呼び出し
│   ├── lib/
│   │   └── api.ts
│   └── Dockerfile
├── backend/
│   ├── api/                   # NestJS API（Producer）
│   │   ├── src/
│   │   │   ├── reports/
│   │   │   │   ├── reports.controller.ts
│   │   │   │   ├── reports.service.ts
│   │   │   │   └── reports.module.ts
│   │   │   └── app.module.ts
│   │   └── Dockerfile
│   ├── worker/                # NestJS Worker（Consumer）
│   │   ├── src/
│   │   │   ├── consumer.ts
│   │   │   └── processor.ts
│   │   └── Dockerfile
│   └── worker-rust/           # Rust Worker（Consumer）
│       ├── src/
│       │   └── main.rs        # Rust実装
│       ├── Cargo.toml
│       └── Dockerfile
└── infra/                     # AWS CDK（本番）
    ├── bin/
    │   └── infra.ts
    ├── lib/
    │   ├── network-stack.ts
    │   ├── ecs-stack.ts
    │   ├── rds-stack.ts
    │   └── sqs-stack.ts
    ├── cdk.json
    └── package.json
```

## ローカル開発

### 前提条件

- Docker & Docker Compose
- Node.js 18+

### セットアップ

1. リポジトリをクローン

2. ローカル環境を起動

```bash
docker-compose -f docker-compose.local.yml up --build
```

これで以下のサービスが起動します：
- Frontend (Next.js): http://localhost:3000
- API (NestJS): http://localhost:3001
- Worker (NestJS): SQSからメッセージを処理
- Worker-Rust: SQSからメッセージを処理（Rust実装）
- PostgreSQL: localhost:5432
- LocalStack (SQS): http://localhost:4566

**注意**: 
- SQSキューはAPIサービス起動時に自動的に作成されます。AWS CLIをインストールする必要はありません。
- Rust Workerの初回起動時は依存関係のダウンロードとコンパイルに時間がかかります（数分程度）。

### 使用方法

1. ブラウザで http://localhost:3000 にアクセス
2. レポート名を入力して「作成」ボタンをクリック
3. レポートのステータスが自動的に更新されます（ポーリング）
4. ステータスが「完了」になったら「ダウンロード」ボタンからCSVをダウンロードできます

## 本番環境デプロイ（AWS CDK）

### 前提条件

- AWS CLI設定済み
- AWS CDK CLIインストール済み
- Docker（イメージビルド用）

### デプロイ手順

1. ECRリポジトリを作成（手動またはCDK）

```bash
aws ecr create-repository --repository-name report-api
aws ecr create-repository --repository-name report-worker
```

2. Dockerイメージをビルド＆プッシュ

```bash
# API
cd backend/api
docker build -t report-api .
docker tag report-api:latest <account-id>.dkr.ecr.<region>.amazonaws.com/report-api:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/report-api:latest

# Worker (NestJS)
cd ../worker
docker build -t report-worker .
docker tag report-worker:latest <account-id>.dkr.ecr.<region>.amazonaws.com/report-worker:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/report-worker:latest

# Worker-Rust (Optional)
cd ../worker-rust
docker build -t report-worker-rust .
docker tag report-worker-rust:latest <account-id>.dkr.ecr.<region>.amazonaws.com/report-worker-rust:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/report-worker-rust:latest
```

**注意**: Worker-Rustはオプションです。NestJS WorkerとRust Workerのどちらか一方、または両方を使用できます。

3. CDKスタックをデプロイ

```bash
cd infra
npm install
npm run build
cdk bootstrap  # 初回のみ
cdk deploy --all
```

## 各レイヤの役割

### frontend（Next.js）
- ボタンを押す
- ステータスをポーリング
- 完了したらダウンロード
- 重いことは一切しない

### backend/api（NestJS）
- リクエスト受付
- DBにPENDINGレコード作成
- SQSにjob投げる
- レスポンスは即返す

### backend/worker（NestJS）
- SQSからjob取得
- データ集計
- CSV生成
- DB更新（DONE）
- ここが重い処理

### backend/worker-rust（Rust）
- SQSからjob取得（NestJS Workerと同じ機能）
- データ集計
- CSV生成
- DB更新（DONE）
- **高いパフォーマンス**: Rustのパフォーマンス特性を活用した高速処理が可能
- NestJS Workerと同じインターフェースで動作（置き換え可能）

### infra（CDK）
- ECS（API / Worker）
- ALB
- RDS
- SQS
