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

### Core Message Flow
The extension uses a multi-script architecture with message passing:

1. **Popup (Vue)** → **Content Script** → Extract content → **Background Script** → Save file
2. **Content Script** handles page interaction and content extraction
3. **Background Script** manages downloads and WebDAV uploads  
4. **ContentService** processes all content through configurable templates

### Key Processing Pipeline

1. **ContentExtractor** extracts HTML from page/selection/element
2. **MarkdownConverter** converts HTML to clean Markdown using Turndown
3. **ContentService** applies user templates (filename + content formatting)
4. **WebDAVClient** or browser downloads API saves the processed content

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
  saveMethod: 'local' | 'webdav';
  downloadDirectory: 'default' | 'custom';
  customDownloadPath: string;
  titleTemplate: string;        // Controls filename generation
  contentTemplate: string;      // Controls final markdown format
  webdav: WebDAVConfig;
}
```

## Extension Entry Points

- **background.ts**: Handles file downloads and WebDAV uploads
- **content.ts**: Page interaction, content extraction, preview modals
- **popup/**: Main UI for triggering saves and previewing content
- **options/**: Configuration interface for templates and WebDAV
- **history/**: Saved content history management

## Key Utilities

- **content-service.ts**: Central processing hub, applies templates to extracted content
- **webdav-client.ts**: WebDAV operations with conflict resolution
- **markdown-converter.ts**: HTML→Markdown with custom rules for code/tables/images
- **file-conflict-handler.ts**: User dialogs for handling duplicate filenames
- **template.ts**: Variable replacement engine for customizable output

## Testing Content Extraction

To test content extraction functionality:
1. Load extension in development mode (`pnpm dev`)
2. Navigate to any webpage  
3. Open popup and use "选择区域保存" for interactive selection
4. Use "保存整个页面" for full page content
5. Check processed output in preview modal before saving