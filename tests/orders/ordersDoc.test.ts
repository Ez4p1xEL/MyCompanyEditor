import { describe, expect, it } from 'vitest';
import {
  addOrder,
  addQuest,
  addReward,
  createEmptyOrdersDocument,
  defaultOrderPlain,
  deleteOrder,
  deleteQuest,
  deleteReward,
  duplicateOrder,
  mergeOrders,
  moveQuest,
  moveReward,
  parseOrdersFile,
  renameOrder,
  renameQuest,
  serializeOrders,
  setOrderDescription,
  setOrderField,
  setQuestField,
  setRewardLine,
  setRewards,
  splitReward,
} from '../../src/features/orders/ordersDoc';
import { documentsSemanticallyEqual, parseYamlText } from '../../src/core/yaml';
import { fixtureText } from '../foundation/fixtures';

const ORDERS = fixtureText('orders.yml');

function loadOrAssert(text = ORDERS) {
  const parsed = parseOrdersFile(text);
  expect(parsed.parsed.ok, parsed.parsed.error?.message).toBe(true);
  expect(parsed.doc).not.toBeNull();
  return parsed;
}

function roundTrip(text = ORDERS): Record<string, any> {
  const { doc } = loadOrAssert(text);
  const output = serializeOrders(doc!);
  const reparsed = parseYamlText(output);
  expect(reparsed.ok, reparsed.error?.message).toBe(true);
  return reparsed.doc!.toJS() as Record<string, any>;
}

function diffPaths(left: unknown, right: unknown, path = ''): string[] {
  if (left === right) return [];
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return [path || '$'];
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return [path || '$'];
    const result: string[] = [];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      result.push(...diffPaths(left[index], right[index], `${path}[${index}]`));
    }
    return result;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  const result: string[] = [];
  for (const key of keys) {
    result.push(...diffPaths(leftRecord[key], rightRecord[key], path ? `${path}.${key}` : key));
  }
  return result;
}

describe('orders YAML 文档模型', () => {
  it('解析 fixture：10 个订单与 quest/reward 字段', () => {
    const { model } = loadOrAssert();
    expect(model.orders).toHaveLength(10);
    expect(model.orders.map((order) => order.id)).toContain('stone_breaker');
    const stone = model.orders.find((order) => order.id === 'stone_breaker')!;
    expect(stone.label).toBe('Stone Breaker');
    expect(stone.description).toEqual(['&7We receive a job', '&7from the miners.']);
    expect(stone.quests).toHaveLength(1);
    expect(stone.quests[0]).toMatchObject({
      id: '1',
      type: 'break_block',
      item: 'stone',
      amount: '16',
      amountKind: 'number',
    });
    expect(stone.rewards).toHaveLength(4);
    expect(stone.rewards[0]).toMatchObject({
      type: 'item',
      isString: true,
      args: ['diamond', '16'],
    });
    expect(stone.rewards[3].type).toBe('experience');
    expect(stone.extraKeys).toEqual([]);
    expect(model.duplicates).toEqual([]);
  });

  it('未修改往返语义等价', () => {
    const { doc } = loadOrAssert();
    const output = serializeOrders(doc!);
    const reparsed = parseYamlText(output);
    expect(reparsed.ok).toBe(true);
    expect(documentsSemanticallyEqual(parseYamlText(ORDERS).doc!, reparsed.doc!)).toBe(true);
    expect(output.includes('\r')).toBe(false);
  });

  it('只改 label 时语义差异仅该字段', () => {
    const { doc } = loadOrAssert();
    expect(setOrderField(doc!, 'stone_breaker', 'label', '&aStone Breaker!')).toBe(true);
    const output = serializeOrders(doc!);
    const before = parseYamlText(ORDERS).doc!.toJS() as Record<string, unknown>;
    const after = parseYamlText(output).doc!.toJS() as Record<string, unknown>;
    expect(diffPaths(before, after)).toEqual(['stone_breaker.label']);
    expect((after as Record<string, any>).stone_breaker.label).toBe('&aStone Breaker!');
  });

  it('新建 / 复制 / 重命名 / 删除订单', () => {
    const { doc, model } = loadOrAssert();
    addOrder(doc!, 'new_order', defaultOrderPlain('新订单'));
    let parsed = parseOrdersFile(serializeOrders(doc!));
    expect(parsed.model.orders.map((order) => order.id)).toContain('new_order');
    expect(parsed.model.orders).toHaveLength(11);
    expect(parsed.model.orders.find((order) => order.id === 'new_order')!.quests).toHaveLength(1);

    expect(duplicateOrder(doc!, 'stone_breaker', 'stone_breaker_copy')).toBe(true);
    parsed = parseOrdersFile(serializeOrders(doc!));
    expect(parsed.model.orders.find((order) => order.id === 'stone_breaker_copy')!.label).toBe(
      'Stone Breaker',
    );

    expect(renameOrder(doc!, 'stone_breaker', 'stone_breaker_renamed')).toBe(true);
    parsed = parseOrdersFile(serializeOrders(doc!));
    expect(parsed.model.orders.map((order) => order.id)).toContain('stone_breaker_renamed');
    expect(parsed.model.orders.map((order) => order.id)).not.toContain('stone_breaker');

    expect(renameOrder(doc!, 'miner', 'stone_breaker_renamed')).toBe(false);
    expect(deleteOrder(doc!, 'lumberjack')).toBe(true);
    parsed = parseOrdersFile(serializeOrders(doc!));
    expect(parsed.model.orders.map((order) => order.id)).not.toContain('lumberjack');
    expect(parsed.model.orders.length).toBe(model.orders.length + 1);
  });

  it('quest 增删改排序与重命名', () => {
    const { doc } = loadOrAssert();
    expect(
      addQuest(doc!, 'stone_breaker', '2', { type: 'mob_kill', mob: 'zombie', amount: 2 }),
    ).toBe(true);
    expect(setQuestField(doc!, 'stone_breaker', '2', 'amount', 3)).toBe(true);
    expect(renameQuest(doc!, 'stone_breaker', '2', 'zombie_kill')).toBe(true);
    expect(moveQuest(doc!, 'stone_breaker', 0, 1)).toBe(true);

    let parsed = parseOrdersFile(serializeOrders(doc!));
    let stone = parsed.model.orders.find((order) => order.id === 'stone_breaker')!;
    expect(stone.quests.map((quest) => quest.id)).toEqual(['zombie_kill', '1']);
    expect(stone.quests[0].amount).toBe('3');

    expect(deleteQuest(doc!, 'stone_breaker', '1')).toBe(true);
    parsed = parseOrdersFile(serializeOrders(doc!));
    stone = parsed.model.orders.find((order) => order.id === 'stone_breaker')!;
    expect(stone.quests.map((quest) => quest.id)).toEqual(['zombie_kill']);
  });

  it('reward 增删改排序与原文模式', () => {
    const { doc } = loadOrAssert();
    expect(setRewardLine(doc!, 'stone_breaker', 0, 'item;diamond;32')).toBe(true);
    expect(addReward(doc!, 'stone_breaker', 'money;50.0')).toBe(true);
    expect(moveReward(doc!, 'stone_breaker', 4, 0)).toBe(true);
    expect(deleteReward(doc!, 'stone_breaker', 4)).toBe(true);

    let parsed = parseOrdersFile(serializeOrders(doc!));
    let stone = parsed.model.orders.find((order) => order.id === 'stone_breaker')!;
    expect(stone.rewards[0].raw).toBe('money;50.0');
    expect(stone.rewards.map((reward) => reward.raw)).toContain('item;diamond;32');

    expect(setRewards(doc!, 'stone_breaker', ['money;10.5', 'experience;3'])).toBe(true);
    parsed = parseOrdersFile(serializeOrders(doc!));
    stone = parsed.model.orders.find((order) => order.id === 'stone_breaker')!;
    expect(stone.rewards.map((reward) => reward.raw)).toEqual(['money;10.5', 'experience;3']);
  });

  it('保留未知订单字段、未知 quest 字段与未知/非字符串 reward', () => {
    const text = [
      'stone_breaker:',
      "  label: 'Stone Breaker'",
      '  custom_flag: true',
      '  quest:',
      '    1:',
      '      type: break_block',
      '      item: stone',
      '      amount: 16',
      '      future_field: keep-me',
      '  reward:',
      "    - 'company_income;100.0'",
      "    - 'mystery;abc'",
      '    - 123',
      '',
    ].join('\n');
    const { doc, model } = loadOrAssert(text);
    const stone = model.orders[0];
    expect(stone.extraKeys).toEqual(['custom_flag']);
    expect(stone.quests[0].extraKeys).toEqual(['future_field']);
    expect(stone.rewards[1].type).toBe('mystery');
    expect(stone.rewards[2].isString).toBe(false);

    setOrderField(doc!, 'stone_breaker', 'label', 'Changed');
    const reparsed = roundTrip(serializeOrders(doc!));
    expect(reparsed.stone_breaker.custom_flag).toBe(true);
    expect(reparsed.stone_breaker.quest['1'].future_field).toBe('keep-me');
    expect(reparsed.stone_breaker.reward).toEqual(['company_income;100.0', 'mystery;abc', 123]);
  });

  it('description 多行更新与未知字段不影响', () => {
    const { doc } = loadOrAssert();
    setOrderDescription(doc!, 'miner', ['&7Mine', '&7Ores']);
    const reparsed = roundTrip(serializeOrders(doc!));
    expect(reparsed.miner.description).toEqual(['&7Mine', '&7Ores']);
  });

  it('合并导入：同名覆盖、其余保留', () => {
    const current = 'a:\n  label: A\n  quest:\n    q:\n      type: break_block\n      item: stone\n      amount: 1\n  reward: []\n';
    const imported = 'a:\n  label: A2\n  quest:\n    q:\n      type: break_block\n      item: stone\n      amount: 2\n  reward: []\nb:\n  label: B\n  quest:\n    q:\n      type: break_block\n      item: dirt\n      amount: 1\n  reward: []\n';
    const currentDoc = loadOrAssert(current).doc!;
    const importedDoc = loadOrAssert(imported).doc!;
    const result = mergeOrders(currentDoc, importedDoc);
    expect(result.merged).toBe(2);
    expect(result.skipped).toBe(0);
    const plain = roundTrip(serializeOrders(currentDoc));
    expect(plain.a.label).toBe('A2');
    expect(plain.a.quest.q.amount).toBe(2);
    expect(plain.b.label).toBe('B');
  });

  it('空文档可创建并添加订单', () => {
    const doc = createEmptyOrdersDocument();
    addOrder(doc, 'first', defaultOrderPlain('First'));
    const parsed = parseOrdersFile(serializeOrders(doc));
    expect(parsed.model.orders[0].id).toBe('first');
  });

  it('按 Java split(";") 语义切分 reward', () => {
    expect(splitReward('item;diamond;16')).toEqual(['item', 'diamond', '16']);
    expect(splitReward('item;diamond;')).toEqual(['item', 'diamond']);
    expect(splitReward('money;')).toEqual(['money']);
    expect(splitReward('')).toEqual([]);
    expect(splitReward('console_command;say hi;again')).toEqual(['console_command', 'say hi', 'again']);
  });
});
