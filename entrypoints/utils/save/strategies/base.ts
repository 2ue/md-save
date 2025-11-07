/**
 * 基础抽象类（可选）
 *
 * 提供通用的辅助方法，减少策略实现的重复代码
 */

import type { SaveStrategy, SaveContext, SaveResult, ValidationResult, ExtensionConfig } from '../types';

export abstract class BaseSaveStrategy implements SaveStrategy {
  abstract readonly name: string;
  abstract readonly displayName: string;

  /**
   * 子类必须实现
   */
  abstract save(context: SaveContext): Promise<SaveResult>;

  /**
   * 子类必须实现
   */
  abstract validate(config: ExtensionConfig): ValidationResult;

  /**
   * 子类必须实现
   */
  abstract requiresBackground(): boolean;

  /**
   * 通用辅助方法：生成错误结果
   */
  protected createErrorResult(
    error: string,
    errorCode: SaveResult['errorCode'] = 'UNKNOWN'
  ): SaveResult {
    return {
      success: false,
      error,
      errorCode
    };
  }

  /**
   * 通用辅助方法：生成成功结果
   */
  protected createSuccessResult(
    savedPath: string,
    filesCount: number = 1,
    metadata?: SaveResult['metadata']
  ): SaveResult {
    return {
      success: true,
      savedPath,
      filesCount,
      savedAt: Date.now(),
      metadata
    };
  }

  /**
   * 通用辅助方法：计算图片统计
   */
  protected getImageStats(context: SaveContext): {
    successCount: number;
    failedCount: number;
  } {
    if (!context.images || context.images.length === 0) {
      return { successCount: 0, failedCount: 0 };
    }

    const successCount = context.images.filter(
      task => task.status === 'success' && task.blob
    ).length;

    const failedCount = context.images.filter(
      task => task.status === 'failed'
    ).length;

    return { successCount, failedCount };
  }

  /**
   * 通用辅助方法：获取 assets 目录名
   */
  protected getAssetsDir(context: SaveContext): string {
    return context.assetsDir || 'assets';
  }
}
