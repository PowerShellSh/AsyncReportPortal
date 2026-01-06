import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { SqsService } from '../sqs.service';
import { v4 as uuidv4 } from 'uuid';

export interface Report {
  id: string;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR';
  createdAt: string;
  completedAt?: string;
  fileUrl?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly sqsService: SqsService,
  ) {}

  async createReport(name: string): Promise<Report> {
    const id = uuidv4();
    const now = new Date();

    // DBにレコード作成（PENDING状態）
    await this.databaseService.query(
      'INSERT INTO reports (id, name, status, created_at) VALUES ($1, $2, $3, $4)',
      [id, name, 'PENDING', now],
    );

    // SQSにメッセージ送信
    await this.sqsService.sendMessage({
      reportId: id,
      name,
    });

    return {
      id,
      name,
      status: 'PENDING',
      createdAt: now.toISOString(),
    };
  }

  async findAll(): Promise<Report[]> {
    const result = await this.databaseService.query(
      'SELECT id, name, status, created_at, completed_at, file_path FROM reports ORDER BY created_at DESC',
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
      fileUrl: row.file_path || undefined,
    }));
  }

  async findOne(id: string): Promise<Report | null> {
    const result = await this.databaseService.query(
      'SELECT id, name, status, created_at, completed_at, file_path FROM reports WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
      fileUrl: row.file_path || undefined,
    };
  }
}

