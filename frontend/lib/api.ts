// サーバーサイド（Server Actions）用のAPI URL
const SERVER_API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:3001';
// クライアントサイド（ブラウザ）用のAPI URL
const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Server Actionsはサーバーサイドで実行されるので、SERVER_API_URLを使用
const API_URL = typeof window === 'undefined' ? SERVER_API_URL : CLIENT_API_URL;

export interface Report {
  id: string;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR';
  createdAt: string;
  completedAt?: string;
  fileUrl?: string;
}

export async function createReport(name: string): Promise<Report> {
  const response = await fetch(`${API_URL}/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error('Failed to create report');
  }

  return response.json();
}

export async function getReports(): Promise<Report[]> {
  const response = await fetch(`${API_URL}/reports`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch reports');
  }

  return response.json();
}

export async function getReport(id: string): Promise<Report> {
  const response = await fetch(`${API_URL}/reports/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch report');
  }

  return response.json();
}

export function getDownloadUrl(reportId: string): string {
  // ブラウザからアクセスできるようにCLIENT_API_URLを使用
  return `${CLIENT_API_URL}/reports/${reportId}/download`;
}
