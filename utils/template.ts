/**
 * Template utilities for filename and content formatting
 */

export interface TemplateData {
  title: string;
  url: string;
  domain: string;
  date: string;
  time: string;
  content: string;
}

/**
 * Generate template data from extracted content
 */
export function generateTemplateData(extractedContent: {
  title: string;
  url: string;
  markdown: string;
  timestamp: string;
}): TemplateData {
  console.log('[Template] generateTemplateData input:', JSON.stringify(extractedContent, null, 2));
  
  const url = new URL(extractedContent.url);
  const date = new Date(extractedContent.timestamp);
  
  const result = {
    title: extractedContent.title || 'Untitled',
    url: extractedContent.url,
    domain: url.hostname,
    date: date.toISOString().split('T')[0], // YYYY-MM-DD
    time: date.toISOString().split('T')[1].split('.')[0], // HH:MM:SS
    content: extractedContent.markdown
  };
  
  console.log('[Template] generateTemplateData result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Replace template variables in a string using {{variable}} syntax
 */
export function replaceTemplateVariables(templateString: string, data: TemplateData): string {
  console.log('[Template] replaceTemplateVariables input - template:', templateString, 'data keys:', Object.keys(data));
  
  try {
    let result = templateString;
    
    // Replace {{variable}} patterns with actual data
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      const beforeReplace = result;
      result = result.replace(regex, String(value || ''));
      if (beforeReplace !== result) {
        console.log(`[Template] Replaced {{${key}}} with:`, value);
      }
    });
    
    console.log('[Template] replaceTemplateVariables result:', result);
    return result;
  } catch (error) {
    console.error('[Template] Template processing failed:', error);
    return templateString;
  }
}

/**
 * Generate filename from template
 */
export function generateFilename(titleTemplate: string, data: TemplateData): string {
  console.log('[Template] generateFilename input - template:', titleTemplate, 'data:', JSON.stringify(data, null, 2));
  
  const filename = replaceTemplateVariables(titleTemplate, data);
  console.log('[Template] generateFilename after template replacement:', filename);
  
  // Clean up filename - remove invalid characters
  const cleanFilename = filename
    .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid filename characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/-+/g, '-') // Replace multiple dashes with single dash
    .replace(/_+/g, '_') // Replace multiple underscores with single underscore
    .trim();
  
  console.log('[Template] generateFilename after cleanup:', cleanFilename);
  
  // Ensure filename ends with .md
  const finalFilename = cleanFilename.endsWith('.md') ? cleanFilename : `${cleanFilename}.md`;
  console.log('[Template] generateFilename final result:', finalFilename);
  
  return finalFilename;
}

/**
 * Generate content from template
 */
export function generateContent(contentTemplate: string, data: TemplateData): string {
  return replaceTemplateVariables(contentTemplate, data);
}