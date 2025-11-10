/**
 * Template utilities for filename and content formatting
 */
import dayjs from 'dayjs';

export interface TemplateData {
  // 基础字段
  title: string;      // 页面标题（不含 .md 后缀）
  url: string;        // 页面 URL
  domain: string;     // 域名
  content: string;    // Markdown 内容

  // 时间字段（基于 dayjs）
  // 年月日
  YYYY: string;       // 年份 4位，如 2025
  YY: string;         // 年份 2位，如 25
  MM: string;         // 月份 2位，如 01
  M: string;          // 月份 1-2位，如 1
  DD: string;         // 日期 2位，如 09
  D: string;          // 日期 1-2位，如 9

  // 时分秒
  HH: string;         // 小时 2位 24小时制，如 14
  H: string;          // 小时 1-2位 24小时制，如 14
  hh: string;         // 小时 2位 12小时制，如 02
  h: string;          // 小时 1-2位 12小时制，如 2
  mm: string;         // 分钟 2位，如 05
  m: string;          // 分钟 1-2位，如 5
  ss: string;         // 秒钟 2位，如 09
  s: string;          // 秒钟 1-2位，如 9

  // 星期
  d: string;          // 星期几 0-6，如 0
  dd: string;         // 星期几缩写，如 Sun
  ddd: string;        // 星期几简称，如 Sunday

  // 组合格式（向后兼容）
  // 注意：这些字段不在接口中定义，在 replaceTemplateVariables 中动态生成
  // date: YYYY-MM-DD
  // time: HH:mm:ss
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
  const dayjsObj = dayjs(extractedContent.timestamp);

  const result: TemplateData = {
    // 基础字段
    title: extractedContent.title || 'Untitled',
    url: extractedContent.url,
    domain: url.hostname,
    content: extractedContent.markdown,

    // 时间字段（使用 dayjs 格式化）
    // 年月日
    YYYY: dayjsObj.format('YYYY'),  // 2025
    YY: dayjsObj.format('YY'),      // 25
    MM: dayjsObj.format('MM'),      // 01
    M: dayjsObj.format('M'),        // 1
    DD: dayjsObj.format('DD'),      // 09
    D: dayjsObj.format('D'),        // 9

    // 时分秒
    HH: dayjsObj.format('HH'),      // 14 (24小时制)
    H: dayjsObj.format('H'),        // 14
    hh: dayjsObj.format('hh'),      // 02 (12小时制)
    h: dayjsObj.format('h'),        // 2
    mm: dayjsObj.format('mm'),      // 05
    m: dayjsObj.format('m'),        // 5
    ss: dayjsObj.format('ss'),      // 09
    s: dayjsObj.format('s'),        // 9

    // 星期
    d: dayjsObj.format('d'),        // 0-6
    dd: dayjsObj.format('dd'),      // Su
    ddd: dayjsObj.format('ddd'),    // Sun
  };

  console.log('[Template] generateTemplateData result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Replace template variables in a string using {{variable}} syntax
 *
 * 支持的变量：
 * - 基础字段: title, url, domain, content
 * - 时间字段: YYYY, YY, MM, M, DD, D, HH, H, hh, h, mm, m, ss, s, d, dd, ddd
 * - 组合字段（向后兼容）: date (YYYY-MM-DD), time (HH:mm:ss)
 */
export function replaceTemplateVariables(templateString: string, data: TemplateData): string {
  console.log('[Template] replaceTemplateVariables input - template:', templateString, 'data keys:', Object.keys(data));

  try {
    let result = templateString;

    // 1. 先处理组合字段（向后兼容）
    // {{date}} -> YYYY-MM-DD
    result = result.replace(/\{\{date\}\}/g, `${data.YYYY}-${data.MM}-${data.DD}`);
    // {{time}} -> HH:mm:ss
    result = result.replace(/\{\{time\}\}/g, `${data.HH}:${data.mm}:${data.ss}`);

    // 2. 处理基础字段
    // 注意：需要按长度排序，避免 {{M}} 被替换后影响 {{MM}}
    const sortedEntries = Object.entries(data).sort((a, b) => b[0].length - a[0].length);

    sortedEntries.forEach(([key, value]) => {
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
 *
 * 注意：
 * 1. 返回的文件名**不包含** .md 后缀
 * 2. 保留 '/' 以支持目录结构（例如 {{YYYY}}/{{MM}}/{{title}}）
 * 3. .md 后缀由保存策略（local.ts / webdav.ts）添加
 */
export function generateFilename(titleTemplate: string, data: TemplateData): string {
  console.log('[Template] generateFilename input - template:', titleTemplate, 'data:', JSON.stringify(data, null, 2));

  const filename = replaceTemplateVariables(titleTemplate, data);
  console.log('[Template] generateFilename after template replacement:', filename);

  // Clean up filename - remove invalid characters but preserve '/' for directory support
  const cleanFilename = filename
    .replace(/[<>:"|?*\\]/g, '-')   // Replace invalid filename characters (preserve / for paths)
    .replace(/\s+/g, '_')            // Replace spaces with underscores
    .replace(/-+/g, '-')             // Replace multiple dashes with single dash
    .replace(/_+/g, '_')             // Replace multiple underscores with single underscore
    .trim();

  console.log('[Template] generateFilename final result (without .md):', cleanFilename);

  // 返回不带 .md 的文件名（符合 types.ts 定义）
  return cleanFilename;
}

/**
 * Generate content from template
 */
export function generateContent(contentTemplate: string, data: TemplateData): string {
  return replaceTemplateVariables(contentTemplate, data);
}