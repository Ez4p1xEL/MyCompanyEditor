import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  clearQuestTypeBaseline,
  ensureOrdersValidatorRegistered,
  validateOrdersText,
  type OrdersIssue,
  type QuestTypeBaseline,
} from '../../src/features/orders/ordersValidation';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const ORDERS = fixtureText('orders.yml');

interface OrderOptions {
  orderId?: string;
  label?: string;
  description?: string[];
  orderExtra?: string;
  questId?: string;
  type?: string;
  item?: string;
  mob?: string;
  amount?: string;
  questExtra?: string;
  rewardLines?: string[];
}

function makeOrder(options: OrderOptions = {}): string {
  const type = options.type ?? 'break_block';
  const isMob = type === 'mob_kill' || type === 'feed';
  const lines = [`${options.orderId ?? 'demo'}:`];
  lines.push(`  label: ${options.label ?? "'Demo'"}`);
  if (options.description) {
    lines.push('  description:');
    for (const line of options.description) lines.push(`    - '${line}'`);
  }
  if (options.orderExtra) lines.push(`  ${options.orderExtra}`);
  lines.push('  quest:');
  lines.push(`    ${options.questId ?? 'q1'}:`);
  lines.push(`      type: ${type}`);
  if (isMob) lines.push(`      mob: ${options.mob ?? (type === 'feed' ? 'cow' : 'zombie')}`);
  else lines.push(`      item: ${options.item ?? 'stone'}`);
  lines.push(`      amount: ${options.amount ?? '1'}`);
  if (options.questExtra) lines.push(`      ${options.questExtra}`);
  lines.push('  reward:');
  for (const line of options.rewardLines ?? ["'money;10.0'"]) lines.push(`    - ${line}`);
  return `${lines.join('\n')}\n`;
}

function validate(text: string, baseline: QuestTypeBaseline = new Map()): OrdersIssue[] {
  return validateOrdersText(text, 'orders.yml', baseline);
}

function byCode(issues: OrdersIssue[], code: string): OrdersIssue | undefined {
  return issues.find((issue) => issue.code === code);
}

function errors(issues: OrdersIssue[]): OrdersIssue[] {
  return issues.filter((issue) => issue.severity === 'error');
}

beforeEach(() => {
  clearQuestTypeBaseline();
});

describe('orders 业务校验', () => {
    it('fixture 订单没有错误/警告，只有 console_command 提示', () => {
      const issues = validate(ORDERS);
      expect(errors(issues)).toHaveLength(0);
      expect(issues.filter((issue) => issue.severity === 'warning')).toHaveLength(0);
      expect(byCode(issues, 'RWD-12')).toBeDefined();
    });

    it('amount 为 0 / 字符串 / 缺失都阻断', () => {
      const zero = validate(makeOrder({ amount: '0' }));
      expect(byCode(zero, 'ORD-24')?.severity).toBe('error');
      expect(byCode(zero, 'ORD-24')?.blocking).toBe(true);

      const quoted = validate(makeOrder({ amount: '"16"' }));
      expect(byCode(quoted, 'ORD-24')?.message).toContain('字符串');

      const missing = validate(makeOrder().replace('      amount: 1\n', ''));
      expect(byCode(missing, 'ORD-24')?.message).toContain('缺少');
    });

    it('amount 过大只警告', () => {
      const issues = validate(makeOrder({ amount: '100001' }));
      expect(byCode(issues, 'ORD-25')?.severity).toBe('warning');
    });

    it('未知 type 阻断', () => {
      const issues = validate(makeOrder({ type: 'broken_type' }));
      expect(byCode(issues, 'ORD-20')?.severity).toBe('error');
      expect(byCode(issues, 'ORD-20')?.blocking).toBe(true);
    });

    it('非法 Material 阻断；namespaced 只警告', () => {
      const invalid = validate(makeOrder({ item: 'not_a_material' }));
      expect(byCode(invalid, 'ORD-21')?.blocking).toBe(true);

      const namespaced = validate(makeOrder({ item: 'minecraft:stone' }));
      expect(byCode(namespaced, 'ORD-21')).toBeUndefined();
      expect(byCode(namespaced, 'ORD-27')?.severity).toBe('warning');
    });

    it('mob_kill 合法 / 非法；feed 非可喂食动物报错', () => {
      const validKill = validate(makeOrder({ type: 'mob_kill', mob: 'zombie' }));
      expect(errors(validKill)).toHaveLength(0);

      const invalidMob = validate(makeOrder({ type: 'mob_kill', mob: 'not_an_entity' }));
      expect(byCode(invalidMob, 'ORD-22')?.blocking).toBe(true);

      const badFeed = validate(makeOrder({ type: 'feed', mob: 'zombie' }));
      expect(byCode(badFeed, 'ORD-23')?.severity).toBe('error');
    });

    it('quest ID 含 . 或 : 阻断', () => {
      const issues = validate(makeOrder({ questId: 'bad.quest' }));
      expect(byCode(issues, 'ORD-06')?.blocking).toBe(true);
      const colon = validate(makeOrder({ questId: "'bad:quest'" }));
      expect(byCode(colon, 'ORD-06')?.blocking).toBe(true);
    });

    it('order ID 规则：./:/default 阻断，空格中文警告', () => {
      expect(byCode(validate(makeOrder({ orderId: "'bad.id'" })), 'ORD-02')?.blocking).toBe(true);
      expect(byCode(validate(makeOrder({ orderId: "'bad:id'" })), 'ORD-03')?.blocking).toBe(true);
      expect(byCode(validate(makeOrder({ orderId: 'default' })), 'ORD-04')?.blocking).toBe(true);
      expect(byCode(validate(makeOrder({ orderId: "'bad order'" })), 'ORD-05')?.severity).toBe(
        'warning',
      );
    });

    it('reward 段数按类型校验', () => {
      const item = validate(makeOrder({ rewardLines: ["'item;diamond'"] }));
      expect(byCode(item, 'RWD-01')?.blocking).toBe(true);

      const money = validate(makeOrder({ rewardLines: ["'money'"] }));
      expect(byCode(money, 'RWD-01')?.blocking).toBe(true);
    });

    it('reward item 材料/数量/物品性校验', () => {
      const badMaterial = validate(makeOrder({ rewardLines: ["'item;not_a_material;1'"] }));
      expect(byCode(badMaterial, 'RWD-03')?.blocking).toBe(true);

      const air = validate(makeOrder({ rewardLines: ["'item;AIR;1'"] }));
      expect(byCode(air, 'RWD-03')?.message).toContain('不是物品');

      const zero = validate(makeOrder({ rewardLines: ["'item;diamond;0'"] }));
      expect(byCode(zero, 'RWD-04')?.blocking).toBe(true);

      const tooMany = validate(makeOrder({ rewardLines: ["'item;diamond;65'"] }));
      expect(byCode(tooMany, 'RWD-04')?.severity).toBe('warning');

      const namespaced = validate(makeOrder({ rewardLines: ["'item;minecraft:diamond;2'"] }));
      expect(errors(namespaced)).toHaveLength(0);
    });

    it('reward 金额/经验/命令校验', () => {
      expect(
        byCode(validate(makeOrder({ rewardLines: ["'money;-5'"] })), 'RWD-06')?.blocking,
      ).toBe(true);
      expect(
        byCode(validate(makeOrder({ rewardLines: ["'money;abc'"] })), 'RWD-05')?.severity,
      ).toBe('error');
      expect(
        byCode(validate(makeOrder({ rewardLines: ["'experience;-1'"] })), 'RWD-07')?.severity,
      ).toBe('error');
      expect(
        byCode(validate(makeOrder({ rewardLines: ["'console_command;say a;b'"] })), 'RWD-08')
          ?.severity,
      ).toBe('error');
      expect(
        byCode(validate(makeOrder({ rewardLines: ["'console_command;/say hi'"] })), 'RWD-10')
          ?.severity,
      ).toBe('warning');
      expect(
        byCode(validate(makeOrder({ rewardLines: ["'console_command;say %PLAYER%'"] })), 'RWD-11')
          ?.severity,
      ).toBe('warning');
    });

    it('未知 reward 类型只警告并保留；非字符串 reward 报错', () => {
      const unknown = validate(makeOrder({ rewardLines: ["'mystery;abc'"] }));
      expect(byCode(unknown, 'RWD-02')?.severity).toBe('warning');
      expect(errors(unknown)).toHaveLength(0);

      const nonString = validate(makeOrder({ rewardLines: ['123'] }));
      expect(byCode(nonString, 'RWD-15')?.severity).toBe('error');
    });

    it('颜色码与 % 占位符警告', () => {
      const color = validate(makeOrder({ label: "'&zBroken'" }));
      expect(byCode(color, 'COLOR-01')?.severity).toBe('warning');
      const percent = validate(makeOrder({ label: "'100% done'" }));
      expect(byCode(percent, 'ORD-14')?.severity).toBe('warning');
    });

    it('重复 quest ID 报 ORD-28', () => {
      const text = [
        'demo:',
        "  label: 'Demo'",
        '  quest:',
        '    q1:',
        '      type: break_block',
        '      item: stone',
        '      amount: 1',
        '    q1:',
        '      type: break_block',
        '      item: dirt',
        '      amount: 1',
        '  reward: []',
        '',
      ].join('\n');
      const issues = validate(text);
      expect(byCode(issues, 'ORD-28')?.severity).toBe('error');
      expect(byCode(issues, 'ORD-28')?.questId).toBe('q1');
    });

    it('已有 quest 的 type 变更报 ORD-26', () => {
      const baseline: QuestTypeBaseline = new Map([['demo\u0000q1', 'place_block']]);
      const issues = validate(makeOrder({ type: 'break_block' }), baseline);
      expect(byCode(issues, 'ORD-26')?.severity).toBe('error');
      expect(byCode(issues, 'ORD-26')?.message).toContain('NPE');
    });

    it('未知订单字段/quest 字段给 info 且不丢', () => {
      const issues = validate(
        makeOrder({ orderExtra: 'custom_flag: true', questExtra: 'future_field: keep' }),
      );
      expect(byCode(issues, 'GEN-03')?.severity).toBe('info');
    });

    it('顶层不是映射时阻断', () => {
      const issues = validate('- a\n- b\n');
      expect(byCode(issues, 'ORD-01')?.blocking).toBe(true);
    });

    it('注册到 store 后 orders.yml 获得业务校验', () => {
      ensureOrdersValidatorRegistered();
      setActivePinia(createPinia());
      const store = useProjectStore();
      store.importFiles([{ path: 'orders.yml', text: makeOrder({ amount: '0' }) }]);
      const fileIssues = store.files['orders.yml'].issues;
      expect(fileIssues.some((issue) => issue.code === 'ORD-24')).toBe(true);
      expect(fileIssues.some((issue) => issue.code === 'ORD-24' && issue.blocking)).toBe(true);
    });
  });
