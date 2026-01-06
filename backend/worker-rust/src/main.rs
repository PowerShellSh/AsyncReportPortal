use aws_config::meta::region::RegionProviderChain;
use aws_sdk_sqs::{Client, types::Message};
use serde::Deserialize;
use std::error::Error;
use std::fs;
use std::path::Path;
use tokio_postgres::{NoTls, Client as PgClient};
use chrono::{NaiveDateTime, Utc};

#[derive(Deserialize)]
struct ReportMessage {
    #[serde(rename = "reportId")]
    report_id: String,
    name: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // 環境変数から設定を読み込む
    let queue_url = std::env::var("SQS_QUEUE_URL")
        .unwrap_or_else(|_| "http://localstack:4566/000000000000/report-queue".to_string());
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://reportuser:reportpass@postgres:5432/reportdb".to_string());
    let storage_path = std::env::var("STORAGE_PATH")
        .unwrap_or_else(|_| "/app/storage".to_string());

    // PostgreSQL接続
    let (pg_client, connection) = tokio_postgres::connect(&database_url, NoTls).await?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PostgreSQL connection error: {}", e);
        }
    });

    // AWS環境の初期化 (LocalStackを向くように設定)
    let endpoint_url = std::env::var("AWS_ENDPOINT_URL")
        .unwrap_or_else(|_| "http://localstack:4566".to_string());
    let region_provider = RegionProviderChain::default_provider().or_else("us-east-1");
    let shared_config = aws_config::from_env()
        .region(region_provider)
        .endpoint_url(endpoint_url)
        .load()
        .await;

    let sqs_client = Client::new(&shared_config);

    // ストレージディレクトリを作成
    if !Path::new(&storage_path).exists() {
        fs::create_dir_all(&storage_path)?;
    }

    println!("Rust Worker started. Listening on SQS...");

    loop {
        // SQSからメッセージをロングポーリング
        match sqs_client.receive_message()
            .queue_url(&queue_url)
            .wait_time_seconds(20)
            .max_number_of_messages(1)
            .send()
            .await
        {
            Ok(rcv_output) => {
                let messages = rcv_output.messages();
                for message in messages {
                    let receipt_handle = match message.receipt_handle() {
                        Some(handle) => handle.to_string(),
                        None => {
                            eprintln!("Receipt handle is missing, skipping message");
                            continue;
                        }
                    };

                    // メッセージを処理
                    match process_message(message, &pg_client, &storage_path).await {
                        Ok(_) => {
                            // 処理成功時のみメッセージを削除
                            let _ = sqs_client.delete_message()
                                .queue_url(&queue_url)
                                .receipt_handle(&receipt_handle)
                                .send()
                                .await;
                        }
                        Err(e) => {
                            eprintln!("Error processing message: {}", e);
                            // エラー時はメッセージを削除せず、後で再処理される
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Error receiving message: {}", e);
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            }
        }
    }
}

async fn process_message(
    msg: &Message,
    pg_client: &PgClient,
    storage_path: &str,
) -> Result<(), Box<dyn Error>> {
    let body = msg.body()
        .ok_or("Message body is missing")?;
    let report_msg: ReportMessage = serde_json::from_str(body)?;

    let report_id = &report_msg.report_id;
    let name = &report_msg.name;

    println!("Processing report: {}, name: {}", report_id, name);

    // ステータスをPROCESSINGに更新
    if let Err(e) = pg_client.execute(
        "UPDATE reports SET status = $1 WHERE id = $2",
        &[&"PROCESSING", &report_id],
    ).await {
        eprintln!("Error updating status to PROCESSING: {}", e);
        return Err(e.into());
    }

    // 重い処理のシミュレーション（3-5秒）
    let delay = 3000 + (rand::random::<u64>() % 2000);
    tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;

    // CSV生成とファイル保存
    let file_path = format!("{}/{}.csv", storage_path, report_id);
    match generate_csv(name) {
        Ok(csv_content) => {
            if let Err(e) = fs::write(&file_path, csv_content) {
                eprintln!("Error writing file: {}", e);
                let _ = pg_client.execute(
                    "UPDATE reports SET status = $1 WHERE id = $2",
                    &[&"ERROR", &report_id],
                ).await;
                return Err(e.into());
            }
        }
        Err(e) => {
            eprintln!("Error generating CSV: {}", e);
            let _ = pg_client.execute(
                "UPDATE reports SET status = $1 WHERE id = $2",
                &[&"ERROR", &report_id],
            ).await;
            return Err(e);
        }
    }

    // ステータスをDONEに更新、ファイルパスを保存
    let now: NaiveDateTime = Utc::now().naive_utc();
    if let Err(e) = pg_client.execute(
        "UPDATE reports SET status = $1, completed_at = $2, file_path = $3 WHERE id = $4",
        &[&"DONE", &now, &file_path, &report_id],
    ).await {
        eprintln!("Error updating status to DONE: {}", e);
        let _ = pg_client.execute(
            "UPDATE reports SET status = $1 WHERE id = $2",
            &[&"ERROR", &report_id],
        ).await;
        return Err(e.into());
    }

    println!("Report {} processed successfully", report_id);
    Ok(())
}

fn generate_csv(name: &str) -> Result<String, Box<dyn Error>> {
    // NestJS Workerと同じフォーマットに合わせる
    let mut csv = String::from("ID,Name,Value,Date\n");

    for i in 1..=1000 {
        let value = rand::random::<u32>() % 1000;
        let date = chrono::Utc::now().to_rfc3339();
        // NestJS Workerのフォーマット: `${name} Item ${i}`
        let item_name = format!("{} Item {}", name, i);
        csv.push_str(&format!("{},{},{},{}\n", i, item_name, value, date));
    }

    Ok(csv)
}
