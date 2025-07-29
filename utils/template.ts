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
  const url = new URL(extractedContent.url);
  const date = new Date(extractedContent.timestamp);
  
  return {
    title: extractedContent.title || 'Untitled',
    url: extractedContent.url,
    domain: url.hostname,
    date: date.toISOString().split('T')[0], // YYYY-MM-DD
    time: date.toISOString().split('T')[1].split('.')[0], // HH:MM:SS
    content: extractedContent.markdown
  };
}

/**
 * Replace template variables in a string using {{variable}} syntax
 */
export function replaceTemplateVariables(templateString: string, data: TemplateData): string {
  try {
    let result = templateString;
    
    // Replace {{variable}} patterns with actual data
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value || ''));
    });
    
    return result;
  } catch (error) {
    console.error('Template processing failed:', error);
    return templateString;
  }
}

/**
 * Generate filename from template
 */
export function generateFilename(titleTemplate: string, data: TemplateData): string {
  const filename = replaceTemplateVariables(titleTemplate, data);
  
  // Clean up filename - remove invalid characters
  const cleanFilename = filename
    .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid filename characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/-+/g, '-') // Replace multiple dashes with single dash
    .replace(/_+/g, '_') // Replace multiple underscores with single underscore
    .trim();
  
  // Ensure filename ends with .md
  return cleanFilename.endsWith('.md') ? cleanFilename : `${cleanFilename}.md`;
}

/**
 * Generate content from template
 */
export function generateContent(contentTemplate: string, data: TemplateData): string {
  return replaceTemplateVariables(contentTemplate, data);
}