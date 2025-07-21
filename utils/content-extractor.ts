export interface ExtractedContent {
  html: string;
  title: string;
  url: string;
  timestamp: string;
}

export class ContentExtractor {
  static extractSelection(): ExtractedContent | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    return {
      html: container.innerHTML,
      title: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };
  }

  static extractFullPage(): ExtractedContent {
    // 克隆整个页面内容，排除脚本和样式
    const content = document.documentElement.cloneNode(true) as HTMLElement;

    // 移除脚本、样式、注释等不需要的元素
    const elementsToRemove = content.querySelectorAll('script, style, noscript, iframe');
    elementsToRemove.forEach(el => el.remove());

    return {
      html: content.innerHTML,
      title: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };
  }

  static extractElement(element: HTMLElement): ExtractedContent {
    const clonedElement = element.cloneNode(true) as HTMLElement;

    // 移除脚本等不需要的元素
    const elementsToRemove = clonedElement.querySelectorAll('script, style, noscript');
    elementsToRemove.forEach(el => el.remove());

    return {
      html: clonedElement.outerHTML,
      title: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };
  }
}