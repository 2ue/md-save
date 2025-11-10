# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MD Save is a browser extension built with WXT framework that converts web content to Markdown and saves it locally or to WebDAV storage. The extension supports selective content extraction, full page saving, configurable template-based formatting, and optional image downloading with URL rewriting.

## Development Commands

```bash
# Development server (Chrome)
pnpm dev

# Development server (Firefox)
pnpm dev:firefox

# Build extension
pnpm build

# Build for Firefox
pnpm build:firefox

# Package extension
pnpm zip

# Type checking
pnpm compile

# Prepare WXT
pnpm postinstall
```

## CRITICAL: Prohibited Operations

These operations are **STRICTLY FORBIDDEN** without explicit user request:

1. **❌ NEVER auto-start or auto-build**: Do not run `pnpm dev`, `pnpm build`, or `pnpm zip` unless explicitly asked
2. **❌ NEVER use `git reset`**: Use `git revert` or create new commits to fix mistakes
   - `git reset` destroys history and breaks collaboration
   - If history cleanup is absolutely necessary, user will decide and execute manually

## Architecture Overview

### Data Flow (Strategy Pattern)

```
User Action (Popup/Keyboard)
    ↓ Message: START_SELECTION / EXTRACT_FULL_PAGE
Content Script (content.ts)
    ↓ ContentExtractor → HTML
    ↓ MarkdownConverter → Markdown
    ↓ ContentService → Apply Templates (reads storage)
    ↓ Show Preview Modal (user editable + filename editing)
    ↓
User Choice: [Download Local] or [Upload WebDAV]
    ↓
Content Script: Prepare SaveContext
    ↓ If imageDownload.enabled: ImageDownloadService.prepare()
    ↓   → Extract image URLs from Markdown
    ↓   → Replace with local paths (./assets/xxx.jpg)
    ↓   → Create ImageTasks (not downloaded yet in Content Script)
    ↓
Content Script: SaveStrategyManager.save(context, strategyName)
    ↓ Validate strategy configuration
    ↓ If requiresBackground() = true → Send SAVE message to Background
    ↓
Background Script receives SAVE message
    ↓ If context.images exists:
    ↓   → ImageDownloadService.download() (CORS-free)
    ↓   → Download all images to Blob
    ↓   → Update context.images with Blob data
    ↓   → Fallback failed images to original URLs
    ↓
Background Script: Execute strategy.save()
    ↓
    ├─ LocalSaveStrategyImpl
    │   ↓ Has images? → saveAsMultipleFiles()
    │   │   ↓ Download Markdown.md via browser.downloads API
    │   │   ↓ Wait for user to select directory
    │   │   ↓ Download all images to {selectedDir}/assets/
    │   ↓ No images? → saveAsMarkdown()
    │       ↓ Direct download Markdown.md
    │
    └─ WebDAVSaveStrategyImpl
        ↓ Upload Markdown.md via WebDAVClient
        ↓ Check file conflict → Return error if exists
        ↓ If images: uploadImages() (parallel batch upload)
        ↓   → Upload to WebDAV:/{path}/assets/*.jpg

Both paths:
    ↓ Background Script: addHistoryRecord()
    ↓ Write to browser.storage.local
    ↓ Return SaveResult to Content Script
```

### Processing Pipeline

1. **ContentExtractor** (utils/content-extractor.ts) - HTML extraction with element/selection/fullpage modes
2. **MarkdownConverter** (utils/markdown-converter.ts) - HTML→Markdown via Turndown with GFM support
3. **ContentService** (utils/content-service.ts) - Template variable replacement (filename + content)
4. **ImageDownloadService** (entrypoints/utils/save/image-download.ts) - Extract images, rewrite URLs, download in Background
5. **SaveStrategyManager** (entrypoints/utils/save/strategy-manager.ts) - Strategy selection and execution routing
6. **Save Strategies** (entrypoints/utils/save/strategies/*.ts) - Local vs WebDAV implementation
7. **History Recording** (background.ts) - Persist save records to browser.storage.local

### Template System

All content goes through a template engine (utils/template.ts) that supports variables:

**Basic Variables:**
- `{{title}}` - page title (without .md extension)
- `{{url}}` - full page URL
- `{{domain}}` - hostname only
- `{{content}}` - processed markdown content

**Time Variables (based on dayjs):**
- Year/Month/Day: `{{YYYY}}` (2025), `{{YY}}` (25), `{{MM}}` (01), `{{M}}` (1), `{{DD}}` (09), `{{D}}` (9)
- Hour/Minute/Second: `{{HH}}` (14 in 24h), `{{H}}` (14), `{{hh}}` (02 in 12h), `{{h}}` (2), `{{mm}}` (05), `{{m}}` (5), `{{ss}}` (09), `{{s}}` (9)
- Weekday: `{{d}}` (0-6), `{{dd}}` (Su), `{{ddd}}` (Sun)
- **Compound (backward compatible)**: `{{date}}` (YYYY-MM-DD), `{{time}}` (HH:mm:ss)

**Usage Examples:**
- `titleTemplate: "{{title}}"` → `article.md`
- `titleTemplate: "{{YYYY}}/{{MM}}/{{title}}"` → `2025/01/article.md` (supports directory structure)
- `titleTemplate: "{{title}}_{{YYYY}}{{MM}}{{DD}}"` → `article_20250110.md`

Templates are configured in `types/config.ts`. The `titleTemplate` generates filename **without .md extension** (added by save strategies). The `contentTemplate` wraps the final markdown with frontmatter or other formatting.

### WebDAV Integration

- **File conflict handling**: `uploadFile(filename, content, overwrite)` - Returns `{success: false, fileExists: true}` if file exists and `overwrite=false`
- **Path normalization**: `normalizePath()` uses `sanitizePath()` from path-security.ts, ensures leading/trailing slashes
- **Directory creation**: `ensureDirectory()` with `recursive: true` support (creates parent dirs automatically)
- **Background-only execution**: All WebDAV operations run in background.ts to avoid CORS restrictions
- **Config sync**: `uploadConfigToWebDAV()` / `downloadConfigFromWebDAV()` for multi-device settings sync

### Content Script Capabilities

- **Interactive selection mode**: Visual element highlighting with click-to-select (ESC to cancel)
- **Full page extraction**: Cleans scripts/styles, preserves semantic content structure
- **Selection extraction**: Works with browser text selection API
- **Modal preview**: User can edit both filename and markdown content before saving
  - Filename editing: Only basename editable, directory structure preserved
  - Content editing: Live textarea with syntax highlighting
  - Dual save buttons: Local download vs WebDAV upload (no pre-configured saveMethod)

### Image Download Feature (Optional)

Controlled by `config.imageDownload.enabled` (default: `false` for backward compatibility):

1. **Content Script (prepare phase):**
   - Extract image URLs from Markdown via regex
   - Replace with local paths: `![alt](https://example.com/img.jpg)` → `![alt](./assets/img_abc123.jpg)`
   - Create `ImageTask[]` with `status: 'pending'`

2. **Background Script (download phase):**
   - `ImageDownloadService.download()` fetches images as Blob (no CORS)
   - Update tasks: `status: 'success'` + `blob: Blob` or `status: 'failed'`
   - Failed images: Revert Markdown to original URLs

3. **Save Strategies (write phase):**
   - **Local**: Download images to `{selectedDir}/assets/` via `browser.downloads`
   - **WebDAV**: Upload images to `{basePath}/assets/` in parallel batch

## Configuration Structure

Configuration is stored in `browser.storage.local` as `extensionConfig`:

```typescript
interface ExtensionConfig {
  configVersion?: string;              // Config version (e.g., "1.0.0")
  configSyncDir?: string;              // WebDAV config sync directory (e.g., "/md-save-settings/")
  downloadDirectory: 'default' | 'custom';
  customDownloadPath: string;          // Custom download path (only if downloadDirectory='custom')
  titleTemplate: string;               // Filename template (without .md)
  contentTemplate: string;             // Content wrapper template
  webdav: {
    url: string;                       // WebDAV server URL
    username: string;
    password: string;
    path: string;                      // Base path on server (e.g., "/notes/")
    authType: 'basic' | 'digest';
  };
  imageDownload?: {                    // Optional, backward compatible
    enabled: boolean;                  // Default: false
  };
}
```

**Critical Notes:**
- **No `saveMethod` field**: Users choose between local/WebDAV at save time (modal buttons), not in config
- **Environment variable injection**: `background.ts` checks `hasValidEnvConfig()` on first run, writes to storage if empty
- **Config migration**: `configVersion` field exists but **not used** - breaking changes will lose user data (known issue)

## Extension Entry Points

- **background.ts**: Message handler for SAVE/DOWNLOAD_FILE/WEBDAV_UPLOAD, history recording, strategy manager registration
- **content.ts**: DOM interaction, content extraction, preview modal, save strategy client
- **popup/**: Main UI for triggering saves (selection/full page) and viewing history
- **options/**: Configuration interface for templates, WebDAV, image download settings
- **saved-records/ (history)**: History list with search/filter/delete

## Key Utilities (Responsibility Boundaries)

### Core Processing
- **content-extractor.ts**: DOM traversal, returns `{html, title, url}` or `null` on failure (no throw)
- **markdown-converter.ts**: Turndown wrapper with GFM plugin, custom rules for code/tables/images
- **template.ts**: Variable substitution engine, filename sanitization (spaces→`_`, invalid chars→`-`)
- **content-service.ts**: Orchestrates template.ts, reloads config on every call (freshness over caching)

### Save System (Strategy Pattern)
- **entrypoints/utils/save/strategy-manager.ts**: Strategy registry, validation, background routing logic
- **entrypoints/utils/save/strategies/base.ts**: `BaseSaveStrategy` abstract class with common helpers
- **entrypoints/utils/save/strategies/local.ts**:
  - `LocalSaveStrategy` (Content Script) - proxy only
  - `LocalSaveStrategyImpl` (Background) - uses `browser.downloads` API
- **entrypoints/utils/save/strategies/webdav.ts**:
  - `WebDAVSaveStrategy` (Content Script) - proxy only
  - `WebDAVSaveStrategyImpl` (Background) - uses WebDAVClient
- **entrypoints/utils/save/image-download.ts**: `ImageDownloadService` with `prepare()` (Content) and `download()` (Background)
- **entrypoints/utils/save/types.ts**: `SaveContext`, `SaveResult`, `ImageTask` type definitions

### Storage & Network
- **webdav-client.ts**: WebDAV I/O, conflict detection (`fileExists: true`), **NO auto-retry** (client decides)
- **path-security.ts**: `sanitizePath()`, `isPathSafe()`, `buildSafePath()` for path traversal prevention
- **env-config.ts**: Environment variable injection (`VITE_WEBDAV_*`) for Docker/CI environments

## Critical Design Constraints

### Data Ownership (Single Source of Truth)

- **browser.storage.local** owns: `extensionConfig`, `saveHistory`, `_envConfigInit`
- **Content Script** owns: DOM access, user interaction, modal lifecycle, ImageDownloadService.prepare()
- **Background Script** owns: ALL file I/O (downloads + WebDAV), ImageDownloadService.download(), history writes
- **Strategy Pattern enforcement**: Both scripts have SaveStrategyManager, but actual save() only runs in Background

### Message Passing Rules (Async Communication)

- ✅ All save operations go through `SAVE` message (unified entry point since strategy refactor)
- ✅ Old messages (`DOWNLOAD_FILE`, `WEBDAV_UPLOAD`) still supported for backward compatibility
- ✅ Content script can READ storage, CANNOT write history (only background via `addHistoryRecord()`)
- ✅ **ALWAYS return `true`** from message handlers if using async `sendResponse()` (keeps channel open)
- ⚠️ History recording is async fire-and-forget - failures logged but not shown to user (known limitation)

### Error Handling Patterns (Consistency Rules)

**Preferred: Result Objects**
```typescript
// ✅ Good: webdav-client.ts, save strategies
return { success: boolean; error?: string; errorCode?: string }
```

**Legacy: null/throw Mix**
```typescript
// ⚠️ Existing: content-extractor.ts returns null
// ❌ Avoid: mixing throw and return null in new code
```

**User-facing errors:**
- Content Script: `showMessage(msg, 'error')` - toast notification
- Background Script: Return error in `SaveResult`, Content Script displays

### Strategy Pattern Architecture (Zero-Branch Save Logic)

**Key Principle:** Eliminate all `if (saveMethod === 'local')` branches using polymorphism

```typescript
// ✅ Content Script: Zero branches
const result = await contentStrategyManager.save(context, 'local' | 'webdav');

// ✅ Background Script: Strategy decides behavior
class LocalSaveStrategyImpl {
  requiresBackground() { return true; }  // Auto-routes to background
  async save(context) { /* browser.downloads logic */ }
}
```

**Rules:**
1. Content Script strategies are **proxy only** (throw if save() called)
2. Background strategies have **Impl suffix** (actual implementation)
3. SaveStrategyManager routes based on `requiresBackground()`
4. Validation happens before routing (`validate(config)`)

### Lifecycle Management

- **Modal instances**: Created by `createPreviewModal`, destroyed on close/save
- ⚠️ **Memory leak**: `cachedProcessedContent` (content.ts:162) - module-level, cleared on closePreviewModal() but NOT on rapid operations
- **Event listeners**: Selection mode adds mousemove/click/keydown, removed in `exitSelectionMode()` - cleanup on ESC or selection complete
- **ImageTask Blobs**: Revoked after save in Background (avoid memory leak from URL.createObjectURL)

## Known Pitfalls

### 🔴 Critical Issues (Data Integrity)

1. **Config migration not implemented** (types/config.ts:11)
   - `configVersion` field exists but **never checked**
   - Breaking schema changes will silently corrupt user data
   - Mitigation: Always add new fields as **optional** with defaults

2. **cachedProcessedContent race condition** (content.ts:162)
   - Module-level cache, shared across rapid saves
   - If user opens 2 modals quickly, second uses first's data
   - Mitigation: Clear in `closePreviewModal()` (line 423), but not foolproof

3. **Image download failures are silent to user** (background.ts:183)
   - Failed images revert to original URLs in Markdown
   - User sees "success" even if some images failed
   - Only visible in console logs

### 🟡 Functional Limitations

1. **WebDAV file conflict UX** (webdav-client.ts:172)
   - Returns `{fileExists: true}` but no auto-rename
   - User must manually edit filename in modal
   - No "save as copy" or timestamp suffix

2. **Local download path detection is fragile** (local.ts:213)
   - `waitForDownloadPath()` polls `browser.downloads` for user's chosen dir
   - If download fails/interrupted, images go to default location
   - No error shown to user

3. **Event listener cleanup incomplete** (content.ts:570)
   - `exitSelectionMode()` removes listeners normally
   - But if page unloads mid-selection, listeners leak
   - Browser GC eventually cleans up, but not ideal

### 🟢 Code Quality (Refactor Targets)

1. **Legacy message handlers** (background.ts:236-276)
   - `DOWNLOAD_FILE` and `WEBDAV_UPLOAD` still exist for compatibility
   - New code uses `SAVE` message (strategy pattern)
   - Can remove old handlers after migration complete

2. **createPreviewModal is a God function** (content.ts:165-414)
   - 250 lines with inline HTML/CSS/event handlers
   - Hard to test or reuse
   - Should extract: `ModalBuilder`, `FilenameValidator`, `ContentEditor`

3. **Aggressive config reloading** (content-service.ts:48)
   - `loadConfig()` called on every `processContent()`
   - 99% of time config hasn't changed
   - Trade-off: freshness vs performance (current choice: freshness)

4. **Console.log in production** (multiple files)
   - 10+ console.log per save operation
   - Should use conditional logging: `if (import.meta.env.DEV)`

## Development Guidelines

### When Adding Features

1. **ALL file I/O MUST go through background.ts**
   - Use `SAVE` message with strategy pattern (preferred)
   - Or legacy `DOWNLOAD_FILE`/`WEBDAV_UPLOAD` messages
   - NEVER use `browser.downloads` or `fetch()` directly in Content Script (CORS issues)

2. **History writes are background-only**
   - Content Script sends `RECORD_HISTORY` message (fire-and-forget)
   - Or background auto-records after successful save via strategy

3. **Config changes require migration strategy**
   - Add new fields as **optional** with defaults: `field?: Type = defaultValue`
   - Check `configVersion` if breaking changes needed (mechanism exists but unused)
   - Update `DEFAULT_CONFIG` in types/config.ts

4. **Test both save strategies**
   - Local download (with/without images, with/without custom path)
   - WebDAV upload (with/without images, test file conflict)
   - Ensure identical UX across strategies

5. **New save strategies**
   ```typescript
   // 1. Create strategy class
   class ZipSaveStrategy extends BaseSaveStrategy {
     readonly name = 'zip';
     requiresBackground() { return true; }
     validate(config) { /* ... */ }
     async save(context) { /* Content Script: throw */ }
   }

   // 2. Create background implementation
   class ZipSaveStrategyImpl extends ZipSaveStrategy {
     async save(context) { /* Actual logic */ }
   }

   // 3. Register in both scripts
   // content.ts:
   contentStrategyManager.register(new ZipSaveStrategy());
   // background.ts:
   backgroundStrategyManager.register(new ZipSaveStrategyImpl());
   ```

### Error Handling Standards

**Preferred: Result Objects (New Code)**
```typescript
// ✅ Good: webdav-client.ts, save strategies
interface OperationResult {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: 'VALIDATION' | 'NETWORK' | 'PERMISSION' | 'UNKNOWN';
}
```

**Legacy: null/throw Mix (Existing Code)**
```typescript
// ⚠️ Tolerated: content-extractor.ts returns null
// ❌ Avoid: mixing throw and return null in NEW code
```

**User-facing Error Display**
```typescript
// Content Script: Toast notification
showMessage('保存失败: ${error}', 'error');

// Background Script: Return structured error
return { success: false, error: 'File exists', errorCode: 'VALIDATION' };
```

### UI and Icon Guidelines

**Icon Library: lucide-vue-next (MANDATORY)**
```vue
<!-- ✅ Correct -->
<template>
  <Folder class="w-4 h-4" />
  <AlertCircle class="w-5 h-5 text-red-500" />
</template>

<script setup lang="ts">
import { Folder, AlertCircle } from 'lucide-vue-next';
</script>
```

```vue
<!-- ❌ WRONG: Never use emoji or text icons -->
<template>
  <span>📂</span>  <!-- Breaks accessibility -->
  <span>⚠️</span>  <!-- Inconsistent rendering -->
</template>
```

**Rationale:** Icon components provide better accessibility, consistent sizing, theme compatibility, and can be styled with Tailwind classes.

### Message Handler Template (ALWAYS USE)

```typescript
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ✅ Correct: Async handler pattern
  if (message.type === 'YOUR_ACTION') {
    (async () => {
      try {
        const result = await handleYourAction(message.data);
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })();
    return true; // CRITICAL: Keeps channel open for async sendResponse
  }

  // ❌ Wrong: Synchronous return (message channel closes immediately)
  if (message.type === 'BAD_ACTION') {
    sendResponse({ success: true });  // May not deliver!
    // Missing return true
  }
});
```

### Backward Compatibility Rules (NEVER BREAK USERS)

1. **Config Schema**
   - ✅ Add optional fields: `newField?: Type = defaultValue`
   - ✅ Mark deprecated: `/** @deprecated Use newField instead */ oldField?: Type`
   - ❌ NEVER remove fields without migration
   - ❌ NEVER change field types without migration

2. **History Records**
   - Always normalize on read: `record.newField || defaultValue`
   - New fields should be added to `HistoryRecord` as optional

3. **Template Variables**
   - ✅ Can add new variables: `{{newVar}}`
   - ❌ NEVER remove existing variables (breaks user templates)
   - ✅ Can change formatting if backward compatible

4. **Message Types**
   - Keep old message handlers even after migration to new system
   - Add deprecation warnings in console, but keep functional

### Code Style (Linus Principles)

1. **Good Taste: Eliminate Special Cases**
   ```typescript
   // ❌ Bad: Multiple branches
   if (saveMethod === 'local') {
     await saveToLocal(context);
   } else if (saveMethod === 'webdav') {
     await saveToWebDAV(context);
   }

   // ✅ Good: Strategy pattern (zero branches)
   const strategy = strategyManager.get(saveMethod);
   await strategy.save(context);
   ```

2. **Simplicity: Avoid Deep Nesting**
   ```typescript
   // ❌ Bad: 4 levels of nesting
   if (config) {
     if (config.webdav) {
       if (config.webdav.url) {
         if (config.webdav.username) {
           // logic here
         }
       }
     }
   }

   // ✅ Good: Early returns
   if (!config?.webdav?.url) return { valid: false, errors: ['URL required'] };
   if (!config.webdav.username) return { valid: false, errors: ['Username required'] };
   // logic here
   ```

3. **Naming: Clear and Concise**
   - Functions: Verbs (`generateFilename`, `uploadFile`)
   - Booleans: Predicates (`isPathSafe`, `requiresBackground`)
   - Classes: Nouns (`SaveStrategyManager`, `WebDAVClient`)

## Testing Checklist

### Content Extraction
1. Load extension in dev mode: `pnpm dev` (only when testing)
2. Navigate to test webpage (e.g., MDN docs, blog article)
3. Open popup → "选择区域保存" → Click highlighted element → Verify markdown in modal
4. Open popup → "保存整个页面" → Verify full page conversion
5. Edit filename/content in modal → Save → Check output file

### Save Strategies
**Local Download (No Images):**
- Default path (shows save dialog) → Check file location
- Custom path configured → Check file in custom directory

**Local Download (With Images):**
- Enable `imageDownload.enabled` in options
- Save page with images → Verify `article.md` + `assets/` folder
- Check markdown uses `./assets/img_xxx.jpg` paths

**WebDAV Upload (No Images):**
- Configure WebDAV credentials in options
- Save → Check file appears on WebDAV server
- Try saving duplicate → Verify error: "File already exists"

**WebDAV Upload (With Images):**
- Enable image download + WebDAV
- Save → Check both markdown and images uploaded
- Verify WebDAV path: `/{basePath}/article.md` + `/{basePath}/assets/*.jpg`

### Template Variables
1. Set `titleTemplate: "{{YYYY}}/{{MM}}/{{title}}"`
2. Save page → Verify filename: `2025/01/article.md` (directory structure preserved)
3. Set `contentTemplate` with frontmatter → Verify content format

### Error Scenarios
- WebDAV: Invalid credentials → Verify user-friendly error
- WebDAV: File conflict → Verify filename error highlight
- Local: Disk full → Verify download failure message
- Image download failure → Verify fallback to original URL (check markdown)