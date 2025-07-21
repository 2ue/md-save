import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export class MarkdownConverter {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
      bulletListMarker: '-',
      hr: '---'
    });

    // 使用 GFM 插件来处理表格、删除线、任务列表等
    this.turndownService.use(gfm);

    // 优化图片处理
    this.turndownService.addRule('images', {
      filter: 'img',
      replacement: (_content, node) => {
        const img = node as HTMLImageElement;
        const alt = img.alt || '';
        let src = img.src || '';

        // 处理相对路径和数据URL
        if (src.startsWith('data:')) {
          // 保留数据URL
        } else if (src.startsWith('/')) {
          // 转换为绝对URL
          src = window.location.origin + src;
        } else if (!src.startsWith('http')) {
          // 处理相对路径
          src = new URL(src, window.location.href).href;
        }

        const title = img.title ? ` "${img.title}"` : '';
        return `![${alt}](${src}${title})`;
      }
    });

    // 优化代码块处理
    this.turndownService.addRule('codeBlocks', {
      filter: ['pre'],
      replacement: (_content, node) => {
        const pre = node as HTMLPreElement;
        const code = pre.querySelector('code');

        // 尝试从多种方式获取语言信息
        let language = '';
        if (code) {
          // 从 class 获取语言
          const classMatch = code.className.match(/(?:language-|lang-)(\w+)/);
          if (classMatch) {
            language = classMatch[1];
          }

          // 从 data 属性获取语言
          if (!language && code.dataset.lang) {
            language = code.dataset.lang;
          }
        }

        // 保持代码的原始格式，包括缩进和换行
        const codeContent = code ? code.textContent || code.innerText : pre.textContent || pre.innerText;

        return `\n\`\`\`${language}\n${codeContent}\n\`\`\`\n`;
      }
    });

    // 处理行内代码
    this.turndownService.addRule('inlineCode', {
      filter: ['code'],
      replacement: (content, node) => {
        const code = node as HTMLElement;
        // 如果是在 pre 标签内的 code，跳过（由上面的规则处理）
        if (code.parentElement?.tagName === 'PRE') {
          return content;
        }
        return `\`${content}\``;
      }
    });

    // 处理引用块
    this.turndownService.addRule('blockquotes', {
      filter: 'blockquote',
      replacement: (content) => {
        return content.trim().split('\n').map(line => `> ${line}`).join('\n') + '\n';
      }
    });

    // 处理水平线
    this.turndownService.addRule('horizontalRule', {
      filter: 'hr',
      replacement: () => '\n---\n'
    });

    // 处理换行
    this.turndownService.addRule('lineBreaks', {
      filter: 'br',
      replacement: () => '  \n'
    });

    // 处理删除线（如果 GFM 插件没有正确处理）
    this.turndownService.addRule('strikethrough', {
      filter: ['del', 's'],
      replacement: (content) => `~~${content}~~`
    });

    // 处理上标和下标
    this.turndownService.addRule('superscript', {
      filter: 'sup',
      replacement: (content) => `<sup>${content}</sup>`
    });

    this.turndownService.addRule('subscript', {
      filter: 'sub',
      replacement: (content) => `<sub>${content}</sub>`
    });

    // 处理标记/高亮文本
    this.turndownService.addRule('mark', {
      filter: 'mark',
      replacement: (content) => `==${content}==`
    });


  }

  convert(html: string): string {
    try {
      // 预处理HTML，清理一些可能影响转换的元素
      const cleanedHtml = this.preprocessHtml(html);
      const markdown = this.turndownService.turndown(cleanedHtml);

      // 后处理Markdown，清理多余的空行
      return this.postprocessMarkdown(markdown);
    } catch (error) {
      console.error('Markdown conversion error:', error);
      return html; // 如果转换失败，返回原始HTML
    }
  }

  private preprocessHtml(html: string): string {
    // 创建临时DOM来处理HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // 处理代码块，保持格式
    const preElements = tempDiv.querySelectorAll('pre');
    preElements.forEach(pre => {
      // 确保代码块内容不被其他处理影响
      const code = pre.querySelector('code');
      if (code) {
        // 保持原始文本内容
        const originalText = code.textContent || code.innerText || '';
        code.innerHTML = '';
        code.textContent = originalText;
      }
    });

    return tempDiv.innerHTML;
  }

  private postprocessMarkdown(markdown: string): string {
    // 先处理表格，确保表格行连续
    let result = markdown;

    // 识别表格块并保护它们不被空行处理影响
    const tableBlocks: string[] = [];
    const tableRegex = /(\|[^\n]*\|\n)+/g;

    result = result.replace(tableRegex, (match) => {
      const placeholder = `__TABLE_PLACEHOLDER_${tableBlocks.length}__`;
      tableBlocks.push(match.trim());
      return placeholder;
    });

    // 对非表格内容进行常规处理
    result = result
      // 清理多余的空行（超过2个连续空行的情况）
      .replace(/\n{3,}/g, '\n\n')
      // 确保代码块前后有空行
      .replace(/([^\n])\n```/g, '$1\n\n```')
      .replace(/```\n([^\n])/g, '```\n\n$1')
      // 修复表格格式问题 - 移除多余的管道符
      .replace(/\|\|/g, '|');

    // 恢复表格内容，并确保表格前后有空行
    tableBlocks.forEach((table, index) => {
      const placeholder = `__TABLE_PLACEHOLDER_${index}__`;
      result = result.replace(placeholder, `\n\n${table}\n\n`);
    });

    // 最终清理
    return result
      // 清理开头和结尾的空行
      .trim()
      // 确保不会有超过2个连续空行
      .replace(/\n{3,}/g, '\n\n');
  }
}