/**
 * 策略注册表 + 统一调度
 *
 * Linus 原则：消除所有特殊情况，用数据结构驱动逻辑
 */

import type { SaveContext, SaveResult, SaveStrategy } from './types';

export class SaveStrategyManager {
  private strategies = new Map<string, SaveStrategy>();

  /**
   * 注册策略
   */
  register(strategy: SaveStrategy): void {
    this.strategies.set(strategy.name, strategy);
    console.log(`[SaveStrategyManager] Registered strategy: ${strategy.name}`);
  }

  /**
   * 获取策略
   */
  get(name: string): SaveStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * 列出所有策略
   */
  list(): SaveStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * 执行保存（统一入口，零分支）
   *
   * Linus 原则：这个函数消除所有特殊情况
   *
   * @param context 保存上下文
   * @param strategyName 策略名称
   * @returns 保存结果
   */
  async save(context: SaveContext, strategyName: string): Promise<SaveResult> {
    // 1. 查找策略
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      return {
        success: false,
        error: `Unknown save strategy: ${strategyName}`,
        errorCode: 'VALIDATION'
      };
    }

    // 2. 验证配置
    const validation = strategy.validate(context.config);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors?.join('; ') || 'Configuration validation failed',
        errorCode: 'VALIDATION'
      };
    }

    // 3. 决定执行位置
    if (strategy.requiresBackground()) {
      // 发送到 Background Script
      return await this.saveInBackground(context, strategyName);
    } else {
      // 直接执行
      return await strategy.save(context);
    }
  }

  /**
   * 在 Background Script 执行保存
   *
   * @param context 保存上下文
   * @param strategyName 策略名称
   * @returns 保存结果
   */
  private async saveInBackground(
    context: SaveContext,
    strategyName: string
  ): Promise<SaveResult> {
    return new Promise((resolve) => {
      browser.runtime.sendMessage(
        {
          type: 'SAVE',
          data: { context, strategy: strategyName }
        },
        (response) => {
          // 🔧 检查运行时错误（连接失败等）
          if (browser.runtime.lastError) {
            console.error('[SaveStrategyManager] sendMessage error:', browser.runtime.lastError.message);
            resolve({
              success: false,
              error: `通信失败: ${browser.runtime.lastError.message}`,
              errorCode: 'UNKNOWN'
            });
            return;
          }

          if (!response) {
            resolve({
              success: false,
              error: 'Background Script 无响应',
              errorCode: 'UNKNOWN'
            });
            return;
          }

          resolve(response);
        }
      );
    });
  }
}

/**
 * 全局单例（Content Script）
 */
export const contentStrategyManager = new SaveStrategyManager();

/**
 * 全局单例（Background Script）
 * 注意：这个会在 background.ts 中初始化，这里只是类型导出
 */
export const backgroundStrategyManager = new SaveStrategyManager();
