export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path?: string;
}

export class WebDAVClient {
  private config: WebDAVConfig;

  constructor(config: WebDAVConfig) {
    this.config = config;
  }

  private getAuthHeader(): string {
    const credentials = btoa(`${this.config.username}:${this.config.password}`);
    return `Basic ${credentials}`;
  }

  async uploadFile(filename: string, content: string): Promise<boolean> {
    try {
      const url = `${this.config.url}${this.config.path || ''}/${filename}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'text/markdown; charset=utf-8'
        },
        body: content
      });

      return response.ok;
    } catch (error) {
      console.error('WebDAV upload failed:', error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.config.url, {
        method: 'PROPFIND',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Depth': '0'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('WebDAV connection test failed:', error);
      return false;
    }
  }
}