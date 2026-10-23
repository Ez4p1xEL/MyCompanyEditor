import { ensureMenuValidatorRegistered } from './menuValidation';

ensureMenuValidatorRegistered();

export default {
  id: 'menu',
  title: '菜单',
  icon: '🧰',
  component: () => import('./MenuEditor.vue'),
};
