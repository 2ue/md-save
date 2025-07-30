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

  private normalizePath(path?: string): string {
    if (!path || path === '/') return '/';
    // Remove leading slash if present, add trailing slash if missing
    const cleaned = path.startsWith('/') ? path.substring(1) : path;
    return cleaned.endsWith('/') ? `/${cleaned}` : `/${cleaned}/`;
  }

  async uploadFile(filename: string, content: string): Promise<boolean> {
    try {
      const basePath = this.normalizePath(this.config.path);
      const filePath = `${basePath}${filename}`;
      
      // Ensure the configured path directory exists
      if (basePath !== '/') {
        try {
          await this.client.createDirectory(basePath.slice(0, -1), { recursive: true }); // Remove trailing slash for createDirectory
        } catch (error) {
          console.warn('Failed to create base directory:', error);
          // Continue anyway, directory might already exist
        }
      }
      
      await this.client.putFileContents(filePath, content, {
        contentLength: false,
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
      const testPath = this.normalizePath(this.config.path);
      
      // First test basic server connection
      await this.client.getDirectoryContents('/');
      
      // If a specific path is configured, test access to that path
      if (testPath !== '/') {
        try {
          // Try to access the configured path
          await this.client.getDirectoryContents(testPath.slice(0, -1)); // Remove trailing slash
        } catch (error) {
          // If path doesn't exist, try to create it
          try {
            await this.client.createDirectory(testPath.slice(0, -1), { recursive: true });
            console.log(`Created WebDAV path: ${testPath}`);
          } catch (createError) {
            console.error('Failed to create or access configured path:', createError);
            return false;
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('WebDAV connection test failed:', error);
      return false;
    }
  }

  // 测试方法：检查路径是否可以访问或创建
  async testPath(): Promise<{ exists: boolean; canCreate: boolean; error?: string }> {
    try {
      const testPath = this.normalizePath(this.config.path);
      
      if (testPath === '/') {
        return { exists: true, canCreate: true };
      }

      const pathWithoutSlash = testPath.slice(0, -1);
      
      // Check if path exists
      try {
        await this.client.getDirectoryContents(pathWithoutSlash);
        return { exists: true, canCreate: true };
      } catch (error) {
        // Path doesn't exist, try to create it
        try {
          await this.client.createDirectory(pathWithoutSlash, { recursive: true });
          return { exists: false, canCreate: true };
        } catch (createError) {
          return { 
            exists: false, 
            canCreate: false, 
            error: `Cannot create path: ${createError}` 
          };
        }
      }
    } catch (error) {
      return { 
        exists: false, 
        canCreate: false, 
        error: `Path test failed: ${error}` 
      };
    }
  }
}