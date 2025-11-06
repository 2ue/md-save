import type { ExtensionConfig } from '@/types';
import { DEFAULT_CONFIG } from '@/types/config';
import { generateTemplateData, generateFilename, generateContent } from '@/utils/template';

export interface ProcessedContent {
  filename: string;
  content: string;
  templateData: any;
}

/**
 * Content processing service
 *
 * 配置加载策略：
 * - 只从 browser.storage.local 读取配置
 * - 环境变量在 background.ts 初始化时已写入 storage
 * - 保持单一数据来源，避免多处读取环境变量
 */
export class ContentService {
  private config: ExtensionConfig = DEFAULT_CONFIG;

  /**
   * Load configuration from storage
   */
  async loadConfig(): Promise<void> {
    try {
      const result = await browser.storage.local.get('extensionConfig');
      if (result.extensionConfig) {
        this.config = { ...DEFAULT_CONFIG, ...result.extensionConfig };
      } else {
        this.config = { ...DEFAULT_CONFIG };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Process extracted content using current configuration
   */
  async processContent(extractedContent: {
    title: string;
    url: string;
    markdown: string;
    timestamp: string;
  }): Promise<ProcessedContent> {
    // Ensure config is loaded
    await this.loadConfig();
    
    // Enhanced debugging for template issues
    console.log('[ContentService] Starting processContent');
    console.log('[ContentService] ExtractedContent:', JSON.stringify(extractedContent, null, 2));
    console.log('[ContentService] Current config:', JSON.stringify(this.config, null, 2));

    // Generate template data
    const templateData = generateTemplateData(extractedContent);
    console.log('[ContentService] Generated template data:', JSON.stringify(templateData, null, 2));

    // Generate filename using template
    const filename = generateFilename(this.config.titleTemplate, templateData);
    console.log('[ContentService] Template used:', this.config.titleTemplate);
    console.log('[ContentService] Generated filename:', filename);

    // Generate content using template
    const content = generateContent(this.config.contentTemplate, templateData);
    console.log('[ContentService] Generated content length:', content.length);

    const result = {
      filename,
      content,
      templateData
    };
    
    console.log('[ContentService] Final result:', JSON.stringify(result, null, 2));
    
    return result;
  }

  /**
   * Get current configuration
   */
  getConfig(): ExtensionConfig {
    return this.config;
  }
}

// Create singleton instance
export const contentService = new ContentService();