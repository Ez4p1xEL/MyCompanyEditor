import { ensureMenuValidatorRegistered } from './menuValidation';
import { t } from '../../i18n';

ensureMenuValidatorRegistered();

export default {
  id: 'menu',
  get title() {
    return t('shell.nav.menu');
  },
  icon: '🧰',
  component: () => import('./MenuEditor.vue'),
};
