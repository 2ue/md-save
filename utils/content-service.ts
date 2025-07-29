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
      }
    } catch (error) {
      console.error('Failed to load config:', error);
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

    // Generate template data
    const templateData = generateTemplateData(extractedContent);

    // Generate filename using template
    const filename = generateFilename(this.config.titleTemplate, templateData);

    // Generate content using template
    const content = generateContent(this.config.contentTemplate, templateData);

    return {
      filename,
      content,
      templateData
    };
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