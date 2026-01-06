import { Controller, Get, Post, Body, Param, Res, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  async create(@Body() body: { name: string }) {
    return this.reportsService.createReport(body.name);
  }

  @Get()
  async findAll() {
    return this.reportsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const report = await this.reportsService.findOne(id);
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return report;
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const report = await this.reportsService.findOne(id);
    if (!report || !report.fileUrl) {
      throw new NotFoundException('Report file not found');
    }

    // Workerが生成したファイルを返す
    // ローカル環境では共有ストレージから、本番ではS3などから取得
    const filePath = report.fileUrl;
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${report.name}.csv"`);
      return res.sendFile(path.resolve(filePath));
    }

    throw new NotFoundException('File not found');
  }
}
