'use client';

import { useEffect, useState } from 'react';
import { createReportAction, getReportsAction, getReportAction } from './actions';
import { getDownloadUrl } from '@/lib/api';
import type { Report } from '@/lib/api';

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportName, setReportName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchReports = async () => {
    const result = await getReportsAction();
    if (result.success && result.reports) {
      setReports(result.reports);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  // ポーリング: PENDINGまたはPROCESSINGのレポートを監視
  useEffect(() => {
    const pendingReports = reports.filter(r => r.status === 'PENDING' || r.status === 'PROCESSING');
    if (pendingReports.length === 0) return;

    const interval = setInterval(async () => {
      for (const report of pendingReports) {
        const result = await getReportAction(report.id);
        if (result.success && result.report) {
          setReports(prev => prev.map(r => r.id === report.id ? result.report! : r));
        }
      }
      fetchReports();
    }, 2000); // 2秒ごとにポーリング

    return () => clearInterval(interval);
  }, [reports]);

  const handleCreateReport = async () => {
    if (!reportName.trim()) return;

    setCreating(true);
    const result = await createReportAction(reportName);
    if (result.success && result.report) {
      setReports(prev => [result.report!, ...prev]);
      setReportName('');
    }
    setCreating(false);
  };

  const getStatusLabel = (status: Report['status']) => {
    switch (status) {
      case 'PENDING':
        return '待機中';
      case 'PROCESSING':
        return '処理中';
      case 'DONE':
        return '完了';
      case 'ERROR':
        return 'エラー';
      default:
        return status;
    }
  };

  const getStatusColor = (status: Report['status']) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'PROCESSING':
        return 'bg-blue-100 text-blue-800';
      case 'DONE':
        return 'bg-green-100 text-green-800';
      case 'ERROR':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Async Report Portal</h1>

        {/* レポート作成フォーム */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">レポートを作成</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="レポート名を入力"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateReport()}
            />
            <button
              onClick={handleCreateReport}
              disabled={creating || !reportName.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {creating ? '作成中...' : '作成'}
            </button>
          </div>
        </div>

        {/* レポート一覧 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">レポート一覧</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">読み込み中...</div>
          ) : reports.length === 0 ? (
            <div className="p-8 text-center text-gray-500">レポートがありません</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {reports.map((report) => (
                <div key={report.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-medium text-gray-900">{report.name}</h3>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(report.status)}`}
                        >
                          {getStatusLabel(report.status)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        <span>作成日時: {new Date(report.createdAt).toLocaleString('ja-JP')}</span>
                        {report.completedAt && (
                          <span className="ml-4">
                            完了日時: {new Date(report.completedAt).toLocaleString('ja-JP')}
                          </span>
                        )}
                      </div>
                    </div>
                    {report.status === 'DONE' && report.fileUrl && (
                      <a
                        href={getDownloadUrl(report.id)}
                        download
                        className="ml-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        ダウンロード
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
