/**
 * Type declaration for turndown-plugin-gfm
 * GitHub Flavored Markdown plugin for Turndown
 */
declare module 'turndown-plugin-gfm' {
  import TurndownService from 'turndown';

  export interface GfmOptions {
    tables?: boolean;
    strikethrough?: boolean;
    taskListItems?: boolean;
  }

  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}
