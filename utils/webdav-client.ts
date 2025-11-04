import { AuthType, createClient, WebDAVClient as WebDAVClientType } from 'webdav';
import type { WebDAVConfig, ExtensionConfig } from '@/types/config';

// Re-export WebDAVConfig for convenience
export type { WebDAVConfig };

export interface UploadResult {
  success: boolean;
  finalPath?: string;
  error?: string;
  fileExists?: boolean;  // 文件是否已存在
}

export class WebDAVClient {
  private config: WebDAVConfig;
  private client: WebDAVClientType;

  constructor(config: WebDAVConfig) {
    this.config = config;
    // 根据配置选择认证类型
    // 'basic' 映射到 AuthType.Password (HTTP Basic Authentication)
    // 'digest' 映射到 AuthType.Digest (HTTP Digest Authentication)
    const authType = config.authType === 'basic' ? AuthType.Password : AuthType.Digest;

    this.client = createClient(config.url, {
      authType,
      username: config.username,
      password: config.password,
      httpAgent: false,
      httpsAgent: false,
      headers: {
        "X-Requested-With": "XMLHttpRequest"
      }
    });
  }

  /**
   * 静默测试连接 - 只验证服务器可达性，不创建目录
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.exists('/');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 标准化路径格式
   */
  private normalizePath(path?: string): string {
    if (!path || path === '/') return '/';
    const cleaned = path.startsWith('/') ? path : `/${path}`;
    return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
  }

  /**
   * 解析文件路径，分离目录和文件名
   */
  private parseFilePath(filename: string): { directory: string; filename: string } {
    const basePath = this.normalizePath(this.config.path);
    const fullPath = `${basePath}${filename}`;
    const lastSlashIndex = fullPath.lastIndexOf('/');
    
    return {
      directory: fullPath.substring(0, lastSlashIndex + 1),
      filename: fullPath.substring(lastSlashIndex + 1)
    };
  }

  /**
   * 检查文件是否存在
   */
  async checkFileExists(filename: string): Promise<boolean> {
    try {
      const { directory, filename: file } = this.parseFilePath(filename);
      const fullPath = `${directory}${file}`;
      
      await this.client.stat(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查并创建目录（支持多层级）
   */
  async ensureDirectory(directory: string): Promise<boolean> {
    try {
      // 移除末尾的斜杠用于检查
      const dirPath = directory.endsWith('/') ? directory.slice(0, -1) : directory;
      
      if (dirPath === '' || dirPath === '/') {
        return true; // 根目录总是存在
      }

      try {
        await this.client.stat(dirPath);
        return true; // 目录已存在
      } catch (error) {
        // 目录不存在，尝试创建
        await this.client.createDirectory(dirPath, { recursive: true });
        return true;
      }
    } catch (error) {
      console.error('Failed to ensure directory:', error);
      return false;
    }
  }


  /**
   * 上传文件的主要方法
   * @param filename 文件名（可能包含路径）
   * @param content 文件内容
   * @param overwrite 是否覆盖已存在文件，默认false
   */
  async uploadFile(filename: string, content: string, overwrite: boolean = false): Promise<UploadResult> {
    console.log('WebDAV uploadFile called:', { filename, overwrite, contentLength: content.length });
    try {
      const { directory, filename: file } = this.parseFilePath(filename);
      const fullPath = `${directory}${file}`;
      console.log('Parsed path:', { directory, file, fullPath });

      // 1. 检查并创建目录
      console.log('Ensuring directory exists:', directory);
      const dirCreated = await this.ensureDirectory(directory);
      console.log('Directory creation result:', dirCreated);
      
      if (!dirCreated) {
        console.log('Failed to create directory, returning error');
        return { 
          success: false, 
          error: `Failed to create directory: ${directory}` 
        };
      }

      // 2. 尝试上传文件，webdav包返回布尔值表示是否成功写入
      console.log('Starting WebDAV upload with options:', { 
        path: fullPath, 
        overwrite, 
        contentLength: true 
      });
      
      const uploadSuccess = await this.client.putFileContents(fullPath, content, {
        contentLength: true,
        overwrite: overwrite  // 直接使用传入的overwrite参数
      });
      
      console.log('WebDAV putFileContents result:', uploadSuccess);
      
      // webdav包在overwrite:false且文件存在时返回false，否则返回true
      if (uploadSuccess) {
        console.log('Upload successful');
        return { success: true, finalPath: fullPath };
      } else {
        console.log('Upload failed - file exists and overwrite=false');
        return { 
          success: false, 
          fileExists: true 
        };
      }

    } catch (error: any) {
      console.error('WebDAV upload error details:', {
        error,
        status: error.status,
        message: error.message,
        overwrite,
        filename
      });
      
      console.log('Returning general error:', error.message);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 上传配置到WebDAV
   * @param config 完整的扩展配置对象
   * @param configSyncDir 配置同步目录，如 "/md-save-settings/"
   */
  async uploadConfigToWebDAV(config: ExtensionConfig, configSyncDir: string): Promise<UploadResult> {
    try {
      // 确保configSyncDir格式正确
      const normalizedDir = this.normalizePath(configSyncDir);
      const configPath = `${normalizedDir}config.json`;

      // 添加版本号
      const configWithVersion = {
        ...config,
        configVersion: '1.0.0'
      };

      // 序列化为JSON
      const jsonContent = JSON.stringify(configWithVersion, null, 2);

      // 确保目录存在
      const dirCreated = await this.ensureDirectory(normalizedDir);
      if (!dirCreated) {
        return {
          success: false,
          error: `Failed to create config directory: ${normalizedDir}`
        };
      }

      // 上传配置文件（覆盖模式）
      const uploadSuccess = await this.client.putFileContents(configPath, jsonContent, {
        contentLength: true,
        overwrite: true
      });

      if (uploadSuccess) {
        return { success: true, finalPath: configPath };
      } else {
        return {
          success: false,
          error: 'Failed to upload config file'
        };
      }
    } catch (error: any) {
      console.error('Upload config error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 从WebDAV下载配置
   * @param configSyncDir 配置同步目录，如 "/md-save-settings/"
   */
  async downloadConfigFromWebDAV(configSyncDir: string): Promise<{ success: boolean; config?: ExtensionConfig; error?: string }> {
    try {
      // 确保configSyncDir格式正确
      const normalizedDir = this.normalizePath(configSyncDir);
      const configPath = `${normalizedDir}config.json`;

      // 检查文件是否存在
      const exists = await this.client.exists(configPath);
      if (!exists) {
        return {
          success: false,
          error: '配置文件不存在，请先上传配置'
        };
      }

      // 下载文件内容
      const content = await this.client.getFileContents(configPath, { format: 'text' });

      // 解析JSON
      const config = JSON.parse(content as string) as ExtensionConfig;

      return { success: true, config };
    } catch (error: any) {
      console.error('Download config error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}