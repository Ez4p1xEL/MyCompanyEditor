import type { FeatureModule } from '../../core/types';
import { ensureOrdersValidatorRegistered } from './ordersValidation';

ensureOrdersValidatorRegistered();

const ordersFeature: FeatureModule = {
  id: 'orders',
  title: '订单',
  icon: '📋',
  order: 10,
  description: 'orders.yml：订单 / 任务 / 奖励可视化编辑',
  component: () => import('./OrdersEditor.vue'),
};

export default ordersFeature;
