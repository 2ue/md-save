/**
 * BrowserDownload 封装 browser.downloads API
 *
 * 目标：
 * 1. 等待下载完成/失败事件
 * 2. 在任何结局后清理事件监听器和额外资源
 * 3. 暴露真实的文件路径，便于记录用户下载目录
 */

interface DownloadItem {
  id: number;
  url?: string;
  filename?: string;
  state?: 'in_progress' | 'complete' | 'interrupted';
  error?: string;
}

interface DownloadDeltaDetail<T = string> {
  current?: T;
  previous?: T;
}

interface DownloadDelta {
  id: number;
  state?: DownloadDeltaDetail<string>;
  filename?: DownloadDeltaDetail<string>;
  error?: DownloadDeltaDetail<string>;
}

interface DownloadOptions {
  url: string;
  filename?: string;
  saveAs?: boolean;
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
}

export interface DownloadResult {
  id: number;
  filename: string;
}

export type CleanupCallback = () => void;

type TimeoutHandle = ReturnType<typeof setTimeout>;

const clearTimer = (handle?: TimeoutHandle): void => {
  if (handle === undefined) return;
  clearTimeout(handle as unknown as number);
};

export class BrowserDownload {
  private downloadId?: number;
  private latestFilename?: string;
  private readonly createdListener: (item: DownloadItem) => void;
  private readonly changedListener: (delta: DownloadDelta) => void;
  private settled = false;
  private finishSuccess?: (result: DownloadResult) => void;
  private finishError?: (error: unknown) => void;
  private pendingDeltas: DownloadDelta[] = [];
  private pollIntervalHandle?: ReturnType<typeof setInterval>;

  constructor(
    private readonly options: DownloadOptions,
    private readonly cleanupCallback?: CleanupCallback,
    private readonly timeoutMs: number = 120000
  ) {
    this.createdListener = (item) => this.handleCreated(item);
    this.changedListener = (delta) => this.handleChanged(delta);
  }

  /**
   * 启动下载并等待完成
   */
  async download(): Promise<DownloadResult> {
    return new Promise<DownloadResult>((resolve, reject) => {
      let timeoutHandle: TimeoutHandle | undefined;

      const finishSuccess = (result: DownloadResult) => {
        if (this.settled) return;
        this.settled = true;
        this.teardown(timeoutHandle);
        resolve(result);
      };

      const finishError = (error: unknown) => {
        if (this.settled) return;
        this.settled = true;
        this.teardown(timeoutHandle);
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      this.finishSuccess = finishSuccess;
      this.finishError = finishError;

      browser.downloads.onCreated.addListener(this.createdListener);
      browser.downloads.onChanged.addListener(this.changedListener);

      browser.downloads.download(this.options)
        .then((id) => {
          this.downloadId = id;
          this.flushPendingDeltas();
          this.startPolling();
        })
        .catch((error) => {
          finishError(error);
        });

      if (this.timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          finishError(new Error('Download timeout'));
        }, this.timeoutMs);
      }
    });
  }

  private handleCreated(item: DownloadItem): void {
    if (this.settled) return;

    // 在 downloadId 为空时，根据 URL 进行匹配，避免误绑定
    if (!this.downloadId) {
      if (item.url === this.options.url) {
        this.downloadId = item.id;
        this.startPolling();
      } else {
        return;
      }
    }

    if (item.id !== this.downloadId) return;

    if (item.filename) {
      this.latestFilename = item.filename;
    }
  }

  private handleChanged(delta: DownloadDelta): void {
    if (this.settled) return;
    if (!this.downloadId) {
      this.pendingDeltas.push(delta);
      return;
    }

    if (delta.id !== this.downloadId) return;

    if (delta.filename?.current) {
      this.latestFilename = delta.filename.current;
    }

    const state = delta.state?.current;
    if (state === 'complete') {
      const filename = this.latestFilename || this.options.filename || '';
      this.finishSuccess?.({ id: this.downloadId, filename });
    } else if (state === 'interrupted') {
      const error = delta.error?.current || 'Download interrupted';
      this.finishError?.(new Error(error));
    }
  }

  private teardown(timeoutHandle?: TimeoutHandle): void {
    clearTimer(timeoutHandle);
    this.stopPolling();

    browser.downloads.onCreated.removeListener(this.createdListener);
    browser.downloads.onChanged.removeListener(this.changedListener);

    if (this.cleanupCallback) {
      try {
        this.cleanupCallback();
      } catch (error) {
        console.warn('[BrowserDownload] cleanup error:', error);
      }
    }
  }

  private flushPendingDeltas(): void {
    if (!this.downloadId || this.pendingDeltas.length === 0) return;
    const queued = [...this.pendingDeltas];
    this.pendingDeltas = [];
    queued.forEach((delta) => this.handleChanged(delta));
  }

  private startPolling(): void {
    if (!this.downloadId || this.pollIntervalHandle) return;

    this.pollIntervalHandle = setInterval(async () => {
      if (!this.downloadId || this.settled) {
        this.stopPolling();
        return;
      }

      try {
        const [item] = await browser.downloads.search({ id: this.downloadId });
        if (!item) {
          return;
        }

        if (item.filename) {
          this.latestFilename = item.filename;
        }

        if (item.state === 'complete') {
          this.stopPolling();
          const filename = this.latestFilename || this.options.filename || '';
          this.finishSuccess?.({ id: this.downloadId, filename });
        } else if (item.state === 'interrupted') {
          this.stopPolling();
          const error = (item as any).error || 'Download interrupted';
          this.finishError?.(new Error(error));
        }
      } catch (error) {
        console.warn('[BrowserDownload] Polling error:', error);
      }
    }, 200);
  }

  private stopPolling(): void {
    if (this.pollIntervalHandle) {
      clearInterval(this.pollIntervalHandle);
      this.pollIntervalHandle = undefined;
    }
  }
}
