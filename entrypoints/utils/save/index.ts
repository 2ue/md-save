/**
 * 保存策略模块统一导出
 */

// 类型定义
export type {
  SaveContext,
  SaveResult,
  SaveStrategy,
  ValidationResult,
  ImageTask,
  ExtensionConfig,
  WebDAVConfig
} from './types';

// 策略管理器
export {
  SaveStrategyManager,
  contentStrategyManager,
  backgroundStrategyManager
} from './strategy-manager';

// 策略实现
export {
  BaseSaveStrategy,
  LocalSaveStrategy,
  LocalSaveStrategyImpl,
  WebDAVSaveStrategy,
  WebDAVSaveStrategyImpl
} from './strategies';

// 图片下载服务
export { ImageDownloadService } from './image-download';
