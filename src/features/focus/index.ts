import { ensureFocusValidatorRegistered } from './focusValidation';

ensureFocusValidatorRegistered();

export default {
  id: 'focus',
  title: '专精',
  icon: '🧭',
  component: () => import('./FocusEditor.vue'),
};
