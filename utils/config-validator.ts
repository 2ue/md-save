import type { WebDAVConfig, ExtensionConfig } from '@/types/config';

/**
 * 配置验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证 WebDAV 配置
 *
 * @param config WebDAV配置对象
 * @returns 验证结果，包含是否有效和错误列表
 */
export function validateWebDAVConfig(config: WebDAVConfig | undefined): ValidationResult {
  const errors: string[] = [];

  if (!config) {
    errors.push('WebDAV 配置不存在');
    return { valid: false, errors };
  }

  // URL 验证
  if (!config.url?.trim()) {
    errors.push('WebDAV 服务器地址不能为空');
  } else {
    try {
      new URL(config.url);
    } catch {
      errors.push('WebDAV 服务器地址格式不正确');
    }
  }

  // 用户名验证
  if (!config.username?.trim()) {
    errors.push('WebDAV 用户名不能为空');
  }

  // 密码验证
  if (!config.password?.trim()) {
    errors.push('WebDAV 密码不能为空');
  }

  // 路径验证（可选字段）
  if (config.path && !config.path.startsWith('/')) {
    errors.push('WebDAV 保存路径必须以 / 开头');
  }

  // 认证类型验证（可选字段）
  if (config.authType && !['basic', 'digest'].includes(config.authType)) {
    errors.push('WebDAV 认证类型必须是 basic 或 digest');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 验证扩展配置
 *
 * @param config 扩展配置对象
 * @returns 验证结果
 */
export function validateExtensionConfig(config: ExtensionConfig): ValidationResult {
  const errors: string[] = [];

  // 验证标题模板
  if (!config.titleTemplate?.trim()) {
    errors.push('文件名模板不能为空');
  }

  // 验证内容模板
  if (!config.contentTemplate?.trim()) {
    errors.push('内容模板不能为空');
  }

  // 如果保存方式是 WebDAV，验证 WebDAV 配置
  if (config.saveMethod === 'webdav') {
    const webdavResult = validateWebDAVConfig(config.webdav);
    if (!webdavResult.valid) {
      errors.push(...webdavResult.errors);
    }
  }

  // 如果使用自定义下载目录，验证路径
  if (config.downloadDirectory === 'custom') {
    if (!config.customDownloadPath?.trim()) {
      errors.push('自定义下载路径不能为空');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 快速检查 WebDAV 配置是否完整（用于保存前的快速检查）
 *
 * @param config WebDAV配置对象
 * @returns 是否完整
 */
export function isWebDAVConfigComplete(config: WebDAVConfig | undefined): boolean {
  if (!config) return false;
  return !!(
    config.url?.trim() &&
    config.username?.trim() &&
    config.password?.trim()
  );
}
