import { WebDAVClient } from './webdav-client';
import type { HistoryRecord } from '@/types/history';
import type { ExtensionConfig } from '@/types/config';

const HISTORY_STORAGE_KEY = 'saveHistory';

export interface SyncResult {
  success: boolean;
  count?: number;
  error?: string;
}

/**
 * 运行时计算历史记录的唯一key
 * 规则：url + timestamp 组合
 * 效果：
 * - 相同URL + 相同时间 → 去重（同步副本）
 * - 相同URL + 不同时间 → 保留（真实的多次保存）
 */
export function getRecordKey(record: HistoryRecord): string {
  return `${record.url}_${record.timestamp}`;
}

/**
 * 历史记录同步服务
 * 功能：
 * 1. 保存时增量同步：appendRecord()
 * 2. 启动时全量同步：sync()
 * 3. 合并去重逻辑：mergeRecords()
 *
 * 设计原则：无状态服务，每次操作重新读取配置（避免缓存过期问题）
 */
export class HistorySyncService {
  /**
   * 从 storage 加载最新配置
   */
  private async loadConfig(): Promise<ExtensionConfig | null> {
    try {
      const result = await browser.storage.local.get('extensionConfig');
      return result.extensionConfig || null;
    } catch (error) {
      console.error('[HistorySync] Load config failed:', error);
      return null;
    }
  }

  /**
   * 创建 WebDAV 客户端（按需创建）
   */
  private createWebDAVClient(config: ExtensionConfig): WebDAVClient | null {
    if (!config?.webdav?.url) {
      return null;
    }
    return new WebDAVClient(config.webdav);
  }

  /**
   * 保存时增量同步：追加单条记录到云端
   * 流程：加载配置 → 下载云端 → 添加新记录 → 去重 → 上传
   */
  async appendRecord(record: HistoryRecord): Promise<SyncResult> {
    try {
      // 1. 加载最新配置
      const config = await this.loadConfig();

      // 检查是否启用同步
      if (!config?.historySync?.enabled) {
        return { success: false, error: '历史同步未启用' };
      }

      const webdavClient = this.createWebDAVClient(config);
      if (!webdavClient) {
        return { success: false, error: 'WebDAV未配置' };
      }

      // 2. 下载云端数据
      const remote = await this.downloadFromWebDAV(webdavClient, config);

      // 3. 添加新记录
      remote.push(record);

      // 4. 去重（防止重复上传）
      const merged = this.mergeRecords(remote);

      // 5. 上传
      await this.uploadToWebDAV(webdavClient, config, merged);

      return { success: true, count: merged.length };
    } catch (error) {
      console.error('[HistorySync] Append record failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 全量同步：合并本地和云端数据
   * 用于：启动时自动同步、手动同步按钮
   */
  async sync(): Promise<SyncResult> {
    try {
      // 1. 加载最新配置
      const config = await this.loadConfig();

      // 检查是否启用同步
      if (!config?.historySync?.enabled) {
        return { success: false, error: '历史同步未启用' };
      }

      const webdavClient = this.createWebDAVClient(config);
      if (!webdavClient) {
        return { success: false, error: 'WebDAV未配置' };
      }

      // 2. 下载云端
      const remote = await this.downloadFromWebDAV(webdavClient, config);

      // 3. 读取本地
      const local = await this.getLocalHistory();

      // 4. 合并去重
      const merged = this.mergeRecords([...local, ...remote]);

      // 5. 双向更新
      await Promise.all([
        this.saveLocalHistory(merged),
        this.uploadToWebDAV(webdavClient, config, merged)
      ]);

      return { success: true, count: merged.length };
    } catch (error) {
      console.error('[HistorySync] Sync failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 合并并去重历史记录
   * 规则：相同 url+timestamp 只保留一条
   * 复杂度：O(n)
   */
  private mergeRecords(records: HistoryRecord[]): HistoryRecord[] {
    const map = new Map<string, HistoryRecord>();

    for (const record of records) {
      const key = getRecordKey(record);
      map.set(key, record);  // Map自动去重
    }

    return Array.from(map.values());
  }

  /**
   * 从本地storage读取历史记录
   */
  private async getLocalHistory(): Promise<HistoryRecord[]> {
    try {
      const result = await browser.storage.local.get(HISTORY_STORAGE_KEY);
      return result[HISTORY_STORAGE_KEY] || [];
    } catch (error) {
      console.error('[HistorySync] Get local history failed:', error);
      return [];
    }
  }

  /**
   * 保存历史记录到本地storage
   */
  private async saveLocalHistory(records: HistoryRecord[]): Promise<void> {
    await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: records });
  }

  /**
   * 从WebDAV下载历史记录
   */
  private async downloadFromWebDAV(
    webdavClient: WebDAVClient,
    config: ExtensionConfig
  ): Promise<HistoryRecord[]> {
    const syncDir = this.getSyncDir(config);
    const filePath = `${syncDir}history.json`;

    try {
      // 检查文件是否存在
      const exists = await webdavClient['client'].exists(filePath);
      if (!exists) {
        console.log('[HistorySync] No remote history found, starting fresh');
        return [];
      }

      // 下载文件内容
      const content = await webdavClient['client'].getFileContents(filePath, {
        format: 'text'
      });

      // 解析JSON
      const data = JSON.parse(content as string);
      return data.records || [];
    } catch (error) {
      console.error('[HistorySync] Download from WebDAV failed:', error);
      return [];
    }
  }

  /**
   * 上传历史记录到WebDAV
   */
  private async uploadToWebDAV(
    webdavClient: WebDAVClient,
    config: ExtensionConfig,
    records: HistoryRecord[]
  ): Promise<void> {
    const syncDir = this.getSyncDir(config);

    // 确保目录存在
    await webdavClient.ensureDirectory(syncDir);

    const data = {
      version: '1.0.0',
      lastSyncAt: Date.now(),
      records
    };

    const filePath = `${syncDir}history.json`;
    const result = await webdavClient.uploadFile(
      filePath,
      JSON.stringify(data, null, 2),
      true  // overwrite
    );

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }
  }

  /**
   * 获取同步目录
   * 优先使用 historySync.syncDir，否则使用 configSyncDir，默认 /md-save-settings/
   * 确保返回值以 / 结尾（避免路径拼接错误）
   */
  private getSyncDir(config: ExtensionConfig): string {
    const dir = config.historySync?.syncDir
      || config.configSyncDir
      || '/md-save-settings/';

    // 确保以 / 结尾
    return dir.endsWith('/') ? dir : `${dir}/`;
  }
}

// 全局单例
export const historySyncService = new HistorySyncService();
