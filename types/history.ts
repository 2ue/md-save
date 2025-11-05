// History record types
export interface HistoryRecord {
  id: string;              // nanoid generated
  url: string;             // Original page URL (clickable to open)
  title: string;
  timestamp: number;
  saveLocation: 'local' | 'webdav';
  filename: string;
  savePath: string;        // Full save path: "Downloads/markdown/note.md" or "/webdav/note.md"
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