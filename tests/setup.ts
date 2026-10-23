import { beforeEach } from 'vitest';
import { setLocale } from '../src/i18n';

// jsdom 默认 navigator.language 可能是 en-US；测试统一从 zh-CN 开始，避免现有中文断言受环境影响。
beforeEach(() => {
  setLocale('zh-CN', { persist: false, notify: false });
});
