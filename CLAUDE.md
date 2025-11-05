# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MD Save is a browser extension built with WXT framework that converts web content to Markdown and saves it locally or to WebDAV storage. The extension supports selective content extraction, full page saving, and configurable template-based formatting.

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

## Architecture Overview

### Data Flow (Complete)

```
User Action (Popup/Keyboard)
    ↓ Message: START_SELECTION / EXTRACT_FULL_PAGE
Content Script (content.ts)
    ↓ ContentExtractor → HTML
    ↓ MarkdownConverter → Markdown
    ↓ ContentService → Apply Templates (reads storage)
    ↓ Show Preview Modal (user editable)
    ↓
User Choice: [Download Local] or [Upload WebDAV]
    ↓                              ↓
[Path A: Local]              [Path B: WebDAV]
Content Script               Content Script
    ↓ Blob + <a>.download        ↓ Message: WEBDAV_UPLOAD
    ↓ Async msg: RECORD_HISTORY  Background Script
                                     ↓ WebDAVClient
                                     ↓ Check dir → Upload
                                     ↓ Message: RECORD_HISTORY
Both paths converge:
Background Script writes history to browser.storage.local
```

### Processing Pipeline

1. **ContentExtractor** (utils/content-extractor.ts) - HTML extraction
2. **MarkdownConverter** (utils/markdown-converter.ts) - HTML→Markdown via Turndown
3. **ContentService** (utils/content-service.ts) - Template application
4. **Save Layer** - Two divergent paths (local vs WebDAV), both async record history

### Template System
All content goes through a template engine that supports variables:
- `{{title}}` - page title
- `{{url}}` - page URL  
- `{{domain}}` - hostname
- `{{date}}` - YYYY-MM-DD format
- `{{time}}` - HH:MM:SS format
- `{{content}}` - processed markdown content

Templates are configured in `types/config.ts` with defaults for both filename and content formatting.

### WebDAV Integration
- **File conflict handling**: Automatic detection with user choice (overwrite/rename/cancel)
- **Path normalization**: Handles nested directories and relative paths
- **Directory creation**: Automatically creates missing directories
- **Background processing**: All WebDAV operations run in background script to avoid CORS

### Content Script Capabilities
- **Interactive selection mode**: Visual element highlighting with click-to-select
- **Full page extraction**: Cleans scripts/styles, preserves content structure  
- **Selection extraction**: Works with browser text selection
- **Modal preview**: Shows processed content before saving

## Configuration Structure

Configuration is stored in browser.storage.local as `extensionConfig`:

```typescript
interface ExtensionConfig {
  downloadDirectory: 'default' | 'custom';
  customDownloadPath: string;
  titleTemplate: string;        // Controls filename generation
  contentTemplate: string;      // Controls final markdown format
  webdav: WebDAVConfig;
  configVersion?: string;       // Config version for compatibility
  configSyncDir?: string;       // WebDAV config sync directory path
}
```

**Note**: There is no `saveMethod` configuration field. Users choose between local download and WebDAV upload at save time through the preview modal buttons, providing maximum flexibility.

## Extension Entry Points

- **background.ts**: Handles file downloads and WebDAV uploads
- **content.ts**: Page interaction, content extraction, preview modals
- **popup/**: Main UI for triggering saves and previewing content
- **options/**: Configuration interface for templates and WebDAV
- **history/**: Saved content history management

## Key Utilities (with Responsibility Boundaries)

- **content-service.ts**: Template application, config loading (reloads every call for freshness)
- **webdav-client.ts**: WebDAV I/O, conflict detection, NO auto-retry logic
- **markdown-converter.ts**: Turndown wrapper, custom rules for code/tables/images
- **template.ts**: Variable substitution, filename sanitization (spaces→underscores)
- **content-extractor.ts**: DOM traversal, returns null on failure (no throw)

## Critical Design Constraints

### Data Ownership
- **browser.storage.local** owns: config, history records
- **Content Script** owns: DOM access, user interaction, modal lifecycle
- **Background Script** owns: file I/O (downloads + WebDAV), persistent history writes
- **No shared state** between scripts except via messages

### Message Passing Rules
- ✅ All I/O requests MUST go through background script (WebDAV already does, local download does NOT)
- ✅ Content script can read storage, CANNOT write history (only background can)
- ❌ NEVER assume message handlers are synchronous - always return `true` and use sendResponse
- ⚠️ History recording is async fire-and-forget - failures are logged but not user-visible

### Error Handling Patterns
- **content-extractor.ts**: Returns `null` on failure
- **webdav-client.ts**: Returns `{success: false, error: string}`
- **content.ts**: Catches and shows toast notifications
- ⚠️ **Inconsistency exists** - avoid mixing throw/return patterns in new code

### Lifecycle Management
- **Modal instances**: Created by `createPreviewModal`, destroyed on close/save
- ⚠️ `cachedProcessedContent` (content.ts:147) is module-level - never cleared, potential memory leak
- **Event listeners in selection mode**: Added to document, removed on exit - ensure cleanup on page unload

## Known Pitfalls

### 🔴 Data Loss Risks
1. **History record failure is silent** (content.ts:393-402) - Async `.catch()` only logs, user sees "success"
2. **Local download path divergence** - Local saves bypass background script, inconsistent with WebDAV
3. **No config migration** - `configVersion` field exists but unused, breaking changes will lose user data

### 🟡 Functional Bugs
1. **cachedProcessedContent leak** - Module-level cache never cleared, stale data on rapid operations
2. **Event listener cleanup** - Selection mode listeners not removed if page destroyed mid-selection
3. **WebDAV path traversal** - No sanitization for `../` in paths (webdav-client.ts:52)
4. **File conflict UX** - No auto-rename, user must manually edit filename on conflict

### 🟢 Code Smell (Non-Breaking)
1. **Dual save paths** - Local download and WebDAV use completely different code paths (content.ts vs background.ts)
2. **God function** - `createPreviewModal` is 344 lines with inline HTML/CSS/event handlers
3. **Repeated config loads** - ContentService.processContent reloads config on every call
4. **Console pollution** - 7 console.log per save in production builds

## Development Guidelines

### When Adding Features
1. **All file I/O goes through background.ts** - Never bypass this for "quick fixes"
2. **History writes are background-only** - Content script sends RECORD_HISTORY message
3. **Config changes need migration** - Check `configVersion`, provide upgrade path
4. **Test both save paths** - Local download AND WebDAV must work identically

### Error Handling Style
```typescript
// ✅ Preferred: Return result objects
function operation(): { success: boolean; data?: T; error?: string }

// ❌ Avoid: Mixing throw and return null
function badOperation(): T | null  // Sometimes throws, sometimes returns null
```

### Message Handler Template
```typescript
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'YOUR_ACTION') {
    handleYourAction(message.data)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // CRITICAL: Keeps channel open for async sendResponse
  }
});
```

### Backward Compatibility
- **NEVER remove config fields** - Mark as deprecated, keep reading old format
- **History records** - Always normalize on read: `record.newField || defaultValue`
- **Template variables** - Can add new, never remove existing ones

## Testing Content Extraction

To test content extraction functionality:
1. Load extension in development mode (`pnpm dev`)
2. Navigate to any webpage  
3. Open popup and use "选择区域保存" for interactive selection
4. Use "保存整个页面" for full page content
5. Check processed output in preview modal before saving