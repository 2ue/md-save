// History record types
export interface HistoryRecord {
  id: string;              // nanoid generated
  url: string;
  title: string;
  timestamp: number;
  saveLocation: 'local' | 'webdav';
  filename: string;
  success: boolean;
  error?: string;
  domain: string;
  contentPreview: string;  // First 100 characters preview
  fileSize: number;        // File size in bytes
}

export interface HistoryStats {
  total: number;
  success: number;
  failed: number;
}

export interface HistorySearchParams {
  query?: string;
  domain?: string;
  saveLocation?: 'local' | 'webdav';
}

export type HistoryRecordStatus = 'success' | 'failed' | 'pending';