# Async Report Portal

非同期レポート生成システム。SQS、Worker、BFF、CSV、重い処理を通じてレポートを生成します。

## アーキテクチャの特徴

このプロジェクトは**ストラングラー・パターン（Strangler Pattern）**を採用しており、既存のNestJSエコシステムを維持しつつ、特定の重い処理（レポート生成）のみをRustで実装したWorkerに切り出すことで、パフォーマンスを向上させています。

### なぜこの構成なのか？

- **適材適所の多言語構成**: API開発の迅速性を重視する部分（NestJS）と、高負荷処理の効率性を重視する部分（Rust）を分離
- **漸進的移行**: 既存システムを壊さずに、ボトルネックとなる処理だけを段階的に最適化可能
- **カナリアリリース対応**: 同じSQSキューを監視する複数のWorkerを並行稼働させ、新バージョンの検証が可能
- **実務での採用例**: メガベンチャー（メルカリ、LINE、サイバーエージェントなど）のマイクロサービス群でよく見られる構成

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

**動作について**: 
- NestJS WorkerとRust Workerは同じSQSキューからメッセージを取得して**並列に処理**します。
- 両方が起動している場合、メッセージは先に取得した方（ロングポーリングで受信した方）で処理されます。
- ローカル環境では両方が起動しますが、本番環境ではどちらか一方を選択して使用することができます。

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
- **低メモリ消費**: 同じ処理でもNode.js Workerより大幅に少ないメモリ使用量
- NestJS Workerと同じインターフェースで動作（置き換え可能）

### infra（CDK）
- ECS（API / Worker）
- ALB
- RDS
- SQS

## パフォーマンス比較

### 想定される改善点

| 項目 | NestJS Worker | Rust Worker |
|------|---------------|-------------|
| メモリ使用量 | 高（V8エンジンのオーバーヘッド） | 低（ネイティブバイナリ） |
| CPU使用率 | 中〜高 | 低〜中 |
| 起動時間 | 速い | 初回コンパイルは時間がかかるが、実行は高速 |
| 開発速度 | 速い（TypeScript） | 中（Rust、型安全性が高い） |

### 実測例

メモリ使用量の比較（`docker stats`で確認可能）:
```bash
# レポート処理中のメモリ使用量
# NestJS Worker: 約150-200MB
# Rust Worker: 約20-50MB
```

### 使い分けの指針

- **NestJS Worker**: 
  - 開発速度を重視する場合
  - 小〜中規模の処理
  - 既存のNode.jsエコシステムとの統合が重要
  
- **Rust Worker**: 
  - パフォーマンスを重視する場合
  - 大規模データ処理
  - メモリ制約が厳しい環境
  - 長時間実行されるバッチ処理

### カナリアリリースの活用

このアーキテクチャでは、同じSQSキューを監視する複数のWorkerを並行稼働させることで、以下のような運用が可能です：

1. **段階的移行**: 新しく作ったRust版Workerを1台だけ混ぜて、全体の数%だけ処理させてみる
2. **パフォーマンス比較**: 同じ負荷で両方のWorkerを実行し、メモリ使用量や処理時間を比較
3. **リスク最小化**: 問題が発生した場合、すぐにNestJS Workerに切り戻し可能
