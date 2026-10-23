import type { FeatureModule } from '../../core/types';
import { ensureOrdersValidatorRegistered } from './ordersValidation';
import { t } from '../../i18n';

ensureOrdersValidatorRegistered();

const ordersFeature: FeatureModule = {
  id: 'orders',
  get title() {
    return t('shell.nav.orders');
  },
  icon: '📋',
  order: 10,
  description: 'orders.yml：订单 / 任务 / 奖励可视化编辑',
  component: () => import('./OrdersEditor.vue'),
};

export default ordersFeature;
