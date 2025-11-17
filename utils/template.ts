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
 * Sanitize title to prevent path injection and invalid filename characters
 *
 * 策略：
 * 1. 使用贪婪匹配将连续的特殊字符和空格一次性替换为单个 -
 * 2. 压缩连续的 -（处理原文本中已有 - 的情况）
 * 3. 去除首尾的 -
 *
 * 保留的字符：
 * - 下划线 _（视为合法字符，不做任何处理）
 * - 字母、数字、中文等常规字符
 *
 * 示例：
 * "My: Article"       → "My-Article"
 * "A:<>  B"          → "A-B"
 * "File://path"      → "File-path"
 * "A:-B"             → "A-B"（原有的 - 会被压缩）
 * "My_Article"       → "My_Article"（下划线保留）
 * "My__Test"         → "My__Test"（连续下划线也保留）
 */
function sanitizeTitle(title: string): string {
  return title
    .replace(/[\/\\<>:"|?*\s]+/g, '-')  // 步骤1: 贪婪匹配所有特殊字符+空格 → 单个 -
    .replace(/-+/g, '-')                 // 步骤2: 压缩连续的 - 为单个 -
    .replace(/^-|-$/g, '')               // 步骤3: 去除首尾的 -（不处理下划线）
    .trim();
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

  // Sanitize title at data source to prevent path injection
  const cleanTitle = sanitizeTitle(extractedContent.title || 'Untitled');
  console.log('[Template] Original title:', extractedContent.title);
  console.log('[Template] Sanitized title:', cleanTitle);

  const result: TemplateData = {
    // 基础字段
    title: cleanTitle,
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
 *
 * 清理策略（两步法）：
 * - 步骤1: 使用贪婪匹配 [<>:"|?*\\\s]+ 将连续的特殊字符和空格替换为单个 -
 * - 步骤2: 压缩连续的 -
 * - 步骤3-6: 按路径段处理，去除每段首尾的 -，过滤空段
 *
 * 关键设计：
 * - 保留 / 用于目录结构（不在替换字符集中）
 * - 保留 _ 下划线（视为合法字符，像字母数字一样处理）
 * - 保留模板中的其他合法字符（如用户自定义的 _notes 后缀）
 * - 贪婪匹配确保 "A:<>B" → "A-B"（不会产生 "A---B"）
 * - 压缩步骤处理 "A:-B" → "A-B"（原文本中的 - 被合并）
 *
 * 示例：
 * "{{title}}"              + title="My: Article"   → "My-Article"
 * "{{YYYY}}/{{title}}"     + title="A:<>  B"       → "2025/A-B"
 * "{{title}}_{{date}}"     + title="My  Article"   → "My-Article_2025-01-10"
 * "{{title}}_notes"        + title="my_test_file"  → "my_test_file_notes"
 * ":{{title}}:"            + title="Test"          → "Test"（首尾特殊字符被去除）
 *
 * 下划线处理示例：
 * - "My_Article"           → "My_Article"（保留）
 * - "My__Article"          → "My__Article"（连续下划线也保留）
 * - "My_Article: Notes"    → "My_Article-Notes"（下划线保留，冒号替换）
 *
 * 边界情况：
 * - 标题包含 /（罕见）：如 "File://path" → "File/path"（/ 被保留为路径分隔符）
 */
export function generateFilename(titleTemplate: string, data: TemplateData): string {
  console.log('[Template] generateFilename input - template:', titleTemplate, 'data:', JSON.stringify(data, null, 2));

  const filename = replaceTemplateVariables(titleTemplate, data);
  console.log('[Template] generateFilename after template replacement:', filename);

  // Clean up filename - 统一使用 - 替换特殊字符和空格（保留 / 用于目录）
  const cleanFilename = filename
    .replace(/[<>:"|?*\\\s]+/g, '-')  // 步骤1: 贪婪匹配特殊字符+空格 → -（保留 /）
    .replace(/-+/g, '-')               // 步骤2: 压缩连续的 -
    .split('/')                        // 步骤3: 分割路径段，分别处理
    .map(segment => segment.replace(/^-|-$/g, ''))  // 步骤4: 去除每段首尾的 -
    .filter(segment => segment)        // 步骤5: 去除空段
    .join('/')                         // 步骤6: 重新组合
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