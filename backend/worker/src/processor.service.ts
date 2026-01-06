import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProcessorService {
  constructor(private readonly databaseService: DatabaseService) {}

  async processReport(reportId: string, name: string): Promise<void> {
    try {
      // ステータスをPROCESSINGに更新
      await this.databaseService.query(
        'UPDATE reports SET status = $1 WHERE id = $2',
        ['PROCESSING', reportId],
      );

      // 重い処理のシミュレーション（データ集計など）
      await this.simulateHeavyProcessing();

      // CSV生成
      const storagePath = process.env.STORAGE_PATH || '/app/storage';
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      const filePath = path.join(storagePath, `${reportId}.csv`);
      const csvContent = this.generateCsv(name);

      fs.writeFileSync(filePath, csvContent, 'utf-8');

      // ステータスをDONEに更新、ファイルパスを保存
      const now = new Date();
      await this.databaseService.query(
        'UPDATE reports SET status = $1, completed_at = $2, file_path = $3 WHERE id = $4',
        ['DONE', now, filePath, reportId],
      );
    } catch (error) {
      console.error(`Error processing report ${reportId}:`, error);
      // エラー時はステータスをERRORに更新
      await this.databaseService.query(
        'UPDATE reports SET status = $1 WHERE id = $2',
        ['ERROR', reportId],
      );
      throw error;
    }
  }

  private async simulateHeavyProcessing(): Promise<void> {
    // 重い処理のシミュレーション（3-5秒かかる想定）
    const delay = 3000 + Math.random() * 2000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private generateCsv(name: string): string {
    // サンプルCSVを生成
    const headers = ['ID', 'Name', 'Value', 'Date'];
    const rows = [];

    for (let i = 1; i <= 1000; i++) {
      rows.push([
        i,
        `${name} Item ${i}`,
        Math.floor(Math.random() * 1000),
        new Date().toISOString(),
      ]);
    }

    const csvRows = [headers.join(',')];
    csvRows.push(...rows.map(row => row.join(',')));

    return csvRows.join('\n');
  }
}
