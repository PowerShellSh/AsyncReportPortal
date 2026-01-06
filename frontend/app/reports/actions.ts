'use server';

import { createReport, getReports, getReport } from '@/lib/api';

export async function createReportAction(name: string) {
  try {
    const report = await createReport(name);
    return { success: true, report };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getReportsAction() {
  try {
    const reports = await getReports();
    return { success: true, reports };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getReportAction(id: string) {
  try {
    const report = await getReport(id);
    return { success: true, report };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
