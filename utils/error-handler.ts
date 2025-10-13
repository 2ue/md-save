/**
 * 统一错误处理系统
 * 提供标准化的错误类型、错误码和错误消息
 */

/**
 * 错误码枚举
 */
export enum ErrorCode {
  // 网络相关
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // WebDAV 相关
  AUTH_FAILED = 'AUTH_FAILED',
  FILE_EXISTS = 'FILE_EXISTS',
  DIRECTORY_CREATE_FAILED = 'DIRECTORY_CREATE_FAILED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',

  // 配置相关
  INVALID_CONFIG = 'INVALID_CONFIG',
  CONFIG_INCOMPLETE = 'CONFIG_INCOMPLETE',

  // 内容相关
  CONTENT_EXTRACT_FAILED = 'CONTENT_EXTRACT_FAILED',
  CONTENT_PROCESS_FAILED = 'CONTENT_PROCESS_FAILED',

  // 文件相关
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  FILE_READ_FAILED = 'FILE_READ_FAILED',

  // 通用
  UNKNOWN = 'UNKNOWN',
  OPERATION_CANCELLED = 'OPERATION_CANCELLED'
}

/**
 * 应用错误类
 */
export class AppError extends Error {
  code: ErrorCode;
  details?: any;
  timestamp: number;

  constructor(code: ErrorCode, message: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();

    // 保持正确的原型链
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * 转换为用户友好的错误消息
   */
  toUserMessage(): string {
    return getErrorMessage(this);
  }

  /**
   * 转换为 JSON（用于日志记录）
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * 标准化错误对象
 * 将任何错误转换为 AppError
 */
export function normalizeError(error: unknown): AppError {
  // 已经是 AppError，直接返回
  if (error instanceof AppError) {
    return error;
  }

  // 标准 Error 对象
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // 根据消息内容推断错误类型
    if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
      return new AppError(ErrorCode.AUTH_FAILED, error.message, error);
    }

    if (message.includes('network') || message.includes('fetch')) {
      return new AppError(ErrorCode.NETWORK_ERROR, error.message, error);
    }

    if (message.includes('timeout')) {
      return new AppError(ErrorCode.TIMEOUT, error.message, error);
    }

    if (message.includes('file exists') || message.includes('already exists')) {
      return new AppError(ErrorCode.FILE_EXISTS, error.message, error);
    }

    // 默认未知错误
    return new AppError(ErrorCode.UNKNOWN, error.message, error);
  }

  // 字符串错误
  if (typeof error === 'string') {
    return new AppError(ErrorCode.UNKNOWN, error);
  }

  // 其他类型
  return new AppError(ErrorCode.UNKNOWN, String(error), error);
}

/**
 * 获取用户友好的错误消息
 */
export function getErrorMessage(error: AppError | ErrorCode): string {
  const code = error instanceof AppError ? error.code : error;

  const messages: Record<ErrorCode, string> = {
    [ErrorCode.AUTH_FAILED]: '认证失败，请检查用户名和密码是否正确',
    [ErrorCode.NETWORK_ERROR]: '网络错误，请检查网络连接和服务器地址',
    [ErrorCode.TIMEOUT]: '请求超时，请稍后重试',
    [ErrorCode.FILE_EXISTS]: '文件已存在',
    [ErrorCode.DIRECTORY_CREATE_FAILED]: '创建目录失败',
    [ErrorCode.UPLOAD_FAILED]: 'WebDAV 上传失败',
    [ErrorCode.INVALID_CONFIG]: '配置无效',
    [ErrorCode.CONFIG_INCOMPLETE]: '配置不完整，请先完善配置',
    [ErrorCode.CONTENT_EXTRACT_FAILED]: '内容提取失败',
    [ErrorCode.CONTENT_PROCESS_FAILED]: '内容处理失败',
    [ErrorCode.DOWNLOAD_FAILED]: '下载失败',
    [ErrorCode.FILE_READ_FAILED]: '文件读取失败',
    [ErrorCode.OPERATION_CANCELLED]: '操作已取消',
    [ErrorCode.UNKNOWN]: '操作失败，请重试'
  };

  let message = messages[code];

  // 如果是 AppError，附加原始消息
  if (error instanceof AppError && error.message && code === ErrorCode.UNKNOWN) {
    message = `${message}: ${error.message}`;
  }

  return message;
}

/**
 * 获取错误的详细提示（包含解决建议）
 */
export function getErrorHint(code: ErrorCode): string[] {
  const hints: Record<ErrorCode, string[]> = {
    [ErrorCode.AUTH_FAILED]: [
      '1. 检查用户名和密码是否正确',
      '2. 确认是否需要使用应用专用密码',
      '3. 尝试切换认证类型（Basic/Digest）'
    ],
    [ErrorCode.NETWORK_ERROR]: [
      '1. 检查服务器地址是否正确',
      '2. 确认网络连接是否正常',
      '3. 检查防火墙或代理设置'
    ],
    [ErrorCode.FILE_EXISTS]: [
      '1. 修改文件名',
      '2. 或删除服务器上的同名文件'
    ],
    [ErrorCode.INVALID_CONFIG]: [
      '1. 打开设置页面',
      '2. 检查所有必填项',
      '3. 使用"测试连接"验证配置'
    ],
    [ErrorCode.CONFIG_INCOMPLETE]: [
      '1. 打开设置页面',
      '2. 完善 WebDAV 配置',
      '3. 确保填写服务器地址、用户名和密码'
    ]
  };

  return hints[code] || ['请稍后重试，或联系技术支持'];
}

/**
 * 创建带错误码的错误对象
 */
export function createError(code: ErrorCode, message?: string, details?: any): AppError {
  const errorMessage = message || getErrorMessage(code);
  return new AppError(code, errorMessage, details);
}
