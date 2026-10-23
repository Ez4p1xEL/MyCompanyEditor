import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';
import { pushToast } from './core/toast';
import { useProjectStore } from './store/project';
import { initLocale } from './i18n';
import './styles/theme.css';
import './styles/minecraft.css';

initLocale();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
setActivePinia(pinia);

// 从 localStorage 恢复项目；解析/校验失败不应阻止应用启动。
const store = useProjectStore();
try {
  store.restoreFromLocalStorage();
  store.validateAll();
} catch (error) {
  console.warn('[MyCompanyEditor] 初始化项目状态失败', error);
}

app.config.errorHandler = (error) => {
  console.error('[MyCompanyEditor] 未捕获错误', error);
  pushToast(
    `发生未预期错误：${error instanceof Error ? error.message : String(error)}`,
    'error',
    6000,
  );
};

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[MyCompanyEditor] 未处理的 Promise 拒绝', event.reason);
    pushToast(
      `发生未预期错误：${event.reason instanceof Error ? event.reason.message : String(event.reason)}`,
      'error',
      6000,
    );
  });
}

app.mount('#app');
