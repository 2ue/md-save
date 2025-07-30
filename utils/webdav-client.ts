import { AuthType, createClient, WebDAVClient as WebDAVClientType } from 'webdav';

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path?: string;
}

export interface FileExistsResult {
  exists: boolean;
  action?: 'overwrite' | 'rename' | 'cancel';
  newFilename?: string;
}

export interface UploadResult {
  success: boolean;
  finalPath?: string;
  error?: string;
  cancelled?: boolean;
}

export class WebDAVClient {
  private config: WebDAVConfig;
  private client: WebDAVClientType;

  constructor(config: WebDAVConfig) {
    this.config = config;
    this.client = createClient(config.url, {
      authType: AuthType.Auto,
      username: config.username,
      password: config.password
    });
  }

  /**
   * 静默测试连接 - 只验证服务器可达性，不创建目录
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.getDirectoryContents('/');
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
   * 处理文件存在时的用户选择
   */
  async handleFileExists(filename: string): Promise<FileExistsResult> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      `;

      dialog.innerHTML = `
        <h3 style="margin: 0 0 16px 0; color: #333; font-size: 18px;">文件已存在</h3>
        <p style="margin: 0 0 20px 0; color: #666; line-height: 1.5;">
          文件 "${filename}" 已存在，请选择处理方式：
        </p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="cancel" style="
            padding: 8px 16px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          ">取消</button>
          <button id="rename" style="
            padding: 8px 16px;
            border: 1px solid #007bff;
            background: white;
            color: #007bff;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          ">重命名</button>
          <button id="overwrite" style="
            padding: 8px 16px;
            border: none;
            background: #007bff;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          ">覆盖</button>
        </div>
      `;

      modal.appendChild(dialog);
      document.body.appendChild(modal);

      // 事件处理
      const cleanup = () => document.body.removeChild(modal);

      dialog.querySelector('#cancel')?.addEventListener('click', () => {
        cleanup();
        resolve({ exists: true, action: 'cancel' });
      });

      dialog.querySelector('#overwrite')?.addEventListener('click', () => {
        cleanup();
        resolve({ exists: true, action: 'overwrite' });
      });

      dialog.querySelector('#rename')?.addEventListener('click', () => {
        cleanup();
        const newFilename = this.generateNewFilename(filename);
        resolve({ exists: true, action: 'rename', newFilename });
      });
    });
  }

  /**
   * 生成新的文件名（添加时间戳）
   */
  private generateNewFilename(filename: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const lastDotIndex = filename.lastIndexOf('.');
    
    if (lastDotIndex === -1) {
      return `${filename}_${timestamp}`;
    }
    
    const name = filename.substring(0, lastDotIndex);
    const ext = filename.substring(lastDotIndex);
    return `${name}_${timestamp}${ext}`;
  }

  /**
   * 上传文件的主要方法
   */
  async uploadFile(filename: string, content: string): Promise<UploadResult> {
    try {
      // 1. 检查文件是否存在
      const fileExists = await this.checkFileExists(filename);
      let finalFilename = filename;

      if (fileExists) {
        const result = await this.handleFileExists(filename);
        
        if (result.action === 'cancel') {
          return { success: true, cancelled: true };
        }
        
        if (result.action === 'rename' && result.newFilename) {
          finalFilename = result.newFilename;
        }
      }

      // 2. 检查并创建目录
      const { directory } = this.parseFilePath(finalFilename);
      const dirCreated = await this.ensureDirectory(directory);
      
      if (!dirCreated) {
        return { 
          success: false, 
          error: `Failed to create directory: ${directory}` 
        };
      }

      // 3. 上传文件
      const { directory: dir, filename: file } = this.parseFilePath(finalFilename);
      const fullPath = `${dir}${file}`;
      
      await this.client.putFileContents(fullPath, content, {
        contentLength: false,
        overwrite: true
      });

      return { success: true, finalPath: fullPath };

    } catch (error) {
      console.error('WebDAV upload failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
}