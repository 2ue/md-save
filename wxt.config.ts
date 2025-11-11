import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ mode }) => ({
    // Dev 模式添加 [DEV] 后缀，便于区分开发版本和生产版本
    name: mode === 'development' ? 'web-save-dev' : 'web-save',
    permissions: [
      'activeTab',
      'storage',
      'downloads'
    ],
    host_permissions: [
      '<all_urls>'
    ]
  })
});
