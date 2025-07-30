import { AuthType, createClient, WebDAVClient as WebDAVClientType } from 'webdav';

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path?: string;
}

export class WebDAVClient {
  private config: WebDAVConfig;
  private client: WebDAVClientType;

  constructor(config: WebDAVConfig) {
    this.config = config;
    this.client = createClient(config.url, {
      authType: AuthType.Auto, // Auto-detect auth type (Basic/Digest)
      username: config.username,
      password: config.password
    });
  }

  async uploadFile(filename: string, content: string): Promise<boolean> {
    try {
      const basePath = this.config.path || '/';
      const normalizedPath = basePath.endsWith('/') ? basePath : `${basePath}/`;
      const filePath = `${normalizedPath}${filename}`;
      
      // Ensure directory exists
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dirPath && dirPath !== '/') {
        try {
          await this.client.createDirectory(dirPath, { recursive: true });
        } catch (error) {
          // Directory might already exist, ignore error
        }
      }
      
      await this.client.putFileContents(filePath, content, {
        contentLength: false, // Let the client calculate content length
        overwrite: true
      });
      
      return true;
    } catch (error) {
      console.error('WebDAV upload failed:', error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test connection by getting server info or directory listing
      await this.client.getDirectoryContents('/');
      return true;
    } catch (error) {
      console.error('WebDAV connection test failed:', error);
      return false;
    }
  }
}