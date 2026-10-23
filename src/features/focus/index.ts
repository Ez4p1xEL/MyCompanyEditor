import { ensureFocusValidatorRegistered } from './focusValidation';
import { t } from '../../i18n';

ensureFocusValidatorRegistered();

export default {
  id: 'focus',
  get title() {
    return t('shell.nav.focus');
  },
  icon: '🧭',
  component: () => import('./FocusEditor.vue'),
};
