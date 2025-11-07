/**
 * 保存策略核心类型定义
 *
 * Linus 原则：好的数据结构让代码简单
 */

// 导入现有的配置类型
import type { ExtensionConfig as ExtConfig, WebDAVConfig as WebDAV } from '@/types/config';

// 重新导出以便使用
export type ExtensionConfig = ExtConfig;
export type WebDAVConfig = WebDAV;

/**
 * 保存上下文：所有保存方式的统一输入
 */
export interface SaveContext {
  // 核心内容
  markdown: string;           // Markdown 内容（图片URL已替换）
  filename: string;           // 文件名（不含扩展名）

  // 图片（可选）
  images?: ImageTask[];       // 图片任务列表
  assetsDir?: string;         // 图片目录名，默认 "assets"

  // 元数据
  title: string;              // 页面标题
  url: string;                // 页面URL
  timestamp: number;          // 时间戳

  // 配置
  config: ExtensionConfig;    // 扩展配置
}

/**
 * 图片任务
 */
export interface ImageTask {
  originalUrl: string;        // 原始URL
  localPath: string;          // Markdown 引用路径，如 ./assets/img_0.png
  filename: string;           // 纯文件名，如 img_0.png（Local ZIP 用）
  webdavPath: string;         // WebDAV 完整路径，如 2025-01-06/assets/img_0.png
  blob?: Blob;                // 图片数据（下载后填充）
  status: 'pending' | 'downloading' | 'success' | 'failed';
  error?: string;             // 错误信息
}

/**
 * 保存结果：所有保存方式的统一输出
 */
export interface SaveResult {
  success: boolean;

  // 成功时
  savedPath?: string;         // 保存的路径
  filesCount?: number;        // 保存的文件数（MD + 图片）
  savedAt?: number;           // 时间戳

  // 失败时
  error?: string;
  errorCode?: 'NETWORK' | 'PERMISSION' | 'VALIDATION' | 'UNKNOWN';

  // 元数据（用于历史记录）
  metadata?: {
    fileSize?: number;
    imageCount?: number;
    imagesFailedCount?: number;
    [key: string]: any;
  };
}

/**
 * 配置验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * 保存策略：所有保存方式必须实现的接口
 */
export interface SaveStrategy {
  /**
   * 策略名称（用于注册表）
   */
  readonly name: string;

  /**
   * 策略显示名称（用于UI）
   */
  readonly displayName: string;

  /**
   * 执行保存
   *
   * @param context 保存上下文
   * @returns 保存结果
   *
   * IMPORTANT:
   * - 必须处理图片（如果 context.images 存在）
   * - 失败不抛异常，返回 { success: false, error }
   */
  save(context: SaveContext): Promise<SaveResult>;

  /**
   * 验证配置
   *
   * @param config 扩展配置
   * @returns 验证结果
   */
  validate(config: ExtensionConfig): ValidationResult;

  /**
   * 是否需要 Background Script
   *
   * @returns true: 需要通过消息传递; false: 可在 Content Script 直接调用
   */
  requiresBackground(): boolean;
}