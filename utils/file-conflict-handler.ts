/**
 * 文件冲突处理工具
 */

export interface FileConflictResult {
  action: 'overwrite' | 'rename' | 'cancel';
  newFilename?: string;
}

/**
 * 显示文件冲突处理对话框
 */
export function showFileConflictDialog(filename: string): Promise<FileConflictResult> {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #333; font-size: 18px;">文件已存在</h3>
      <p style="margin: 0 0 20px 0; color: #666; line-height: 1.5;">
        文件 "${filename}" 已存在，请选择处理方式：
      </p>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="cancel" style="
          padding: 8px 16px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        ">取消</button>
        <button id="rename" style="
          padding: 8px 16px;
          border: 1px solid #007bff;
          background: white;
          color: #007bff;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        ">重命名</button>
        <button id="overwrite" style="
          padding: 8px 16px;
          border: none;
          background: #007bff;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        ">覆盖</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // 事件处理
    const cleanup = () => {
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
    };

    dialog.querySelector('#cancel')?.addEventListener('click', () => {
      cleanup();
      resolve({ action: 'cancel' });
    });

    dialog.querySelector('#overwrite')?.addEventListener('click', () => {
      cleanup();
      resolve({ action: 'overwrite' });
    });

    dialog.querySelector('#rename')?.addEventListener('click', () => {
      cleanup();
      const newFilename = generateNewFilename(filename);
      resolve({ action: 'rename', newFilename });
    });

    // ESC键取消
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        document.removeEventListener('keydown', handleKeydown);
        resolve({ action: 'cancel' });
      }
    };
    document.addEventListener('keydown', handleKeydown);
  });
}

/**
 * 生成新的文件名（添加时间戳）
 */
export function generateNewFilename(filename: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const lastDotIndex = filename.lastIndexOf('.');
  
  if (lastDotIndex === -1) {
    return `${filename}_${timestamp}`;
  }
  
  const name = filename.substring(0, lastDotIndex);
  const ext = filename.substring(lastDotIndex);
  return `${name}_${timestamp}${ext}`;
}