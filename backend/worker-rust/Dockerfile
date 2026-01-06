# --- Development Stage ---
    FROM rust:latest AS development

    WORKDIR /app

    # 依存関係をインストール（ソースコードはボリュームマウントされる）
    # ダミーのソースコードで依存関係をビルドしてキャッシュ
    COPY Cargo.toml ./
    RUN mkdir src && echo "fn main() {}" > src/main.rs && \
        cargo build --release && \
        rm -rf src target/release/worker-rust

    # 開発環境では cargo run で実行（ソースコードはボリュームマウントされる）
    # デバッグモードで実行（コンパイルが速い）
    CMD ["cargo", "run", "--release"]

    # --- Build Stage ---
    FROM rust:latest AS builder

    WORKDIR /app

    # 依存関係のキャッシュを利用するための工夫
    # 先に Cargo.toml だけコピーしてコンパイルすることで、コード変更のたびに
    # 全ライブラリを再ダウンロードするのを防ぎます
    COPY Cargo.toml ./
    # ダミーの main.rs を作成してビルド
    RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release

    # 本物のソースコードをコピー
    COPY src ./src
    # 再ビルド（変更したソースのみコンパイルされる）
    RUN touch src/main.rs && cargo build --release

    # --- Run Stage ---
    FROM debian:bookworm-slim AS production

    # OpenSSLなどの実行に必要なライブラリをインストール
    RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

    WORKDIR /app

    # ビルダーからバイナリだけをコピー
    COPY --from=builder /app/target/release/worker-rust ./worker-rust

    # 実行
    CMD ["./worker-rust"]
