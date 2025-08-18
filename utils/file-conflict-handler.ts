/**
 * 文件冲突处理工具
 */

export interface FileConflictResult {
  action: 'rename' | 'cancel';
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
        文件 "${filename}" 已存在，请输入新的文件名：
      </p>
      <div style="margin-bottom: 20px;">
        <input type="text" id="newFilename" value="${filename}" style="
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
        ">
      </div>
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
          border: none;
          background: #007bff;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        ">确认重命名</button>
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

    const newFilenameInput = dialog.querySelector('#newFilename') as HTMLInputElement;

    dialog.querySelector('#cancel')?.addEventListener('click', () => {
      cleanup();
      resolve({ action: 'cancel' });
    });

    dialog.querySelector('#rename')?.addEventListener('click', () => {
      const newFilename = newFilenameInput.value.trim();
      if (!newFilename) {
        alert('请输入有效的文件名');
        return;
      }
      cleanup();
      resolve({ action: 'rename', newFilename });
    });

    // 回车键确认重命名
    newFilenameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const newFilename = newFilenameInput.value.trim();
        if (!newFilename) {
          alert('请输入有效的文件名');
          return;
        }
        cleanup();
        resolve({ action: 'rename', newFilename });
      }
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

    // 自动选中文件名（不包含扩展名）
    setTimeout(() => {
      const lastDotIndex = filename.lastIndexOf('.');
      if (lastDotIndex > 0) {
        newFilenameInput.setSelectionRange(0, lastDotIndex);
      } else {
        newFilenameInput.select();
      }
      newFilenameInput.focus();
    }, 100);
  });
}