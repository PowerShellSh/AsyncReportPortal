import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private pool: Pool;

  async onModuleInit() {
    let connectionString = process.env.DATABASE_URL;

    // DATABASE_URLが無い場合は個別の環境変数から構築
    if (!connectionString) {
      const host = process.env.DATABASE_HOST || 'localhost';
      const port = process.env.DATABASE_PORT || '5432';
      const database = process.env.DATABASE_NAME || 'reportdb';
      const user = process.env.DATABASE_USER || 'reportuser';
      const password = process.env.DATABASE_PASSWORD || 'reportpass';
      connectionString = `postgresql://${user}:${password}@${host}:${port}/${database}`;
    }

    console.log('Database connection string:', connectionString?.replace(/:[^:@]+@/, ':****@'));

    this.pool = new Pool({
      connectionString,
    });

    // テーブル作成
    await this.initializeTables();
  }

  private async initializeTables() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP,
          file_path VARCHAR(500)
        )
      `);
    } finally {
      client.release();
    }
  }

  getPool(): Pool {
    return this.pool;
  }

  async query(text: string, params?: any[]) {
    return this.pool.query(text, params);
  }
}
