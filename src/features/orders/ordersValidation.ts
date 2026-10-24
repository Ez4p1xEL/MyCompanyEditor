import { validationText } from '../../core/validation';
import type { ProjectFile, ValidationIssue } from '../../core/types';
import type { ParsedYaml } from '../../core/yaml';
import { registerValidator } from '../../core/validation';
import {
  buildOrdersModel,
  parseOrdersFile,
  splitReward,
  valueKind,
  type OrderEntry,
  type OrdersModel,
  type QuestEntry,
  type RewardEntry,
} from './ordersDoc';
import {
  findInvalidColorCodes,
  isFeedableAnimal,
  isItemMaterial,
  isKnownEntityType,
  isKnownMaterial,
  parseEnumName,
  questTypeMeta,
  rewardTypeMeta,
} from './ordersConstants';
import { QUEST_TYPE_KEYS, REWARD_TYPE_KEYS } from './catalog';

export function questTypeAllowedMessage(questId: string, type: string, keys: string[] = QUEST_TYPE_KEYS): string {
  return validationText('quest “{p0}” 的 type “{p1}” 非法（只允许 {p2}）', {
    p0: questId,
    p1: type,
    p2: keys.join('/'),
  });
}

export function rewardTypeAllowedHint(keys: string[] = REWARD_TYPE_KEYS): string {
  return validationText('从下拉框选择 {p0}', { p0: keys.join('/') });
}

export interface OrdersIssue extends ValidationIssue {
  orderId?: string;
  questId?: string;
  rewardIndex?: number;
}

export type QuestTypeBaseline = Map<string, string>;

function baselineKey(orderId: string, questId: string): string {
  return `${orderId}\u0000${questId}`;
}

const sharedBaseline: QuestTypeBaseline = new Map();

/**
 * 本次编辑会话中新建的订单/任务。它们不是“导入时已有”的历史节点，
 * 不给它们建立 ORD-26 基线，否则新建后切 type 会被误报为“修改历史类型”。
 */
const newOrderIds = new Set<string>();
const newQuestKeys = new Set<string>();

export function markNewOrder(orderId: string): void {
  newOrderIds.add(orderId);
}

export function markNewQuest(orderId: string, questId: string): void {
  newQuestKeys.add(baselineKey(orderId, questId));
}

/** 新建订单重命名时同步排除集合。 */
export function renameNewOrder(oldId: string, newId: string): void {
  if (!newOrderIds.delete(oldId)) return;
  newOrderIds.add(newId);
  const prefix = `${oldId}\u0000`;
  for (const key of [...newQuestKeys]) {
    if (!key.startsWith(prefix)) continue;
    newQuestKeys.delete(key);
    newQuestKeys.add(`${newId}\u0000${key.slice(prefix.length)}`);
  }
}

/** 新建任务重命名时同步排除集合。 */
export function renameNewQuest(orderId: string, oldId: string, newId: string): void {
  if (newQuestKeys.delete(baselineKey(orderId, oldId))) {
    newQuestKeys.add(baselineKey(orderId, newId));
  }
}

export function forgetNewOrder(orderId: string): void {
  newOrderIds.delete(orderId);
  const prefix = `${orderId}\u0000`;
  for (const key of [...newQuestKeys]) {
    if (key.startsWith(prefix)) newQuestKeys.delete(key);
  }
}

/** 编辑器加载/导入时建立基线（仅记录缺失的历史项；新建订单/任务跳过）。 */
export function ensureQuestTypeBaseline(model: OrdersModel): void {
  for (const order of model.orders) {
    if (newOrderIds.has(order.id)) continue;
    for (const quest of order.quests) {
      const key = baselineKey(order.id, quest.id);
      if (newQuestKeys.has(key)) continue;
      if (!sharedBaseline.has(key) && quest.type) sharedBaseline.set(key, quest.type);
    }
  }
}

/** 替换导入时重置基线。 */
export function resetQuestTypeBaseline(model: OrdersModel): void {
  sharedBaseline.clear();
  newOrderIds.clear();
  newQuestKeys.clear();
  ensureQuestTypeBaseline(model);
}

export function clearQuestTypeBaseline(): void {
  sharedBaseline.clear();
  newOrderIds.clear();
  newQuestKeys.clear();
}

function issue(
  severity: ValidationIssue['severity'],
  file: string,
  code: string,
  message: string,
  extra: Partial<OrdersIssue> & { fixHint?: string; blocking?: boolean } = {},
): OrdersIssue {
  return {
    severity,
    file,
    code,
    message,
    path: extra.path,
    line: extra.line,
    blocking: extra.blocking,
    fixHint: extra.fixHint,
    orderId: extra.orderId,
    questId: extra.questId,
    rewardIndex: extra.rewardIndex,
  };
}

function block(file: string, code: string, message: string, extra: Parameters<typeof issue>[4] = {}) {
  return issue('error', file, code, message, { ...extra, blocking: true });
}

function error(file: string, code: string, message: string, extra: Parameters<typeof issue>[4] = {}) {
  return issue('error', file, code, message, extra);
}

function warn(file: string, code: string, message: string, extra: Parameters<typeof issue>[4] = {}) {
  return issue('warning', file, code, message, extra);
}

function info(file: string, code: string, message: string, extra: Parameters<typeof issue>[4] = {}) {
  return issue('info', file, code, message, extra);
}

function checkOrderId(order: OrderEntry, file: string, issues: OrdersIssue[]): void {
  if (order.id.includes('.')) {
    issues.push(
      block(file, 'ORD-02', validationText("订单 ID “{p0}” 不能包含 “.”", { p0: order.id }), {
        orderId: order.id,
        line: order.line,
        fixHint: validationText("改用 [A-Za-z0-9_]+ 命名"),
      }),
    );
  }
  if (order.id.includes(':')) {
    issues.push(
      block(file, 'ORD-03', validationText("订单 ID “{p0}” 不能包含 “:”", { p0: order.id }), {
        orderId: order.id,
        line: order.line,
        fixHint: validationText("改用 [A-Za-z0-9_]+ 命名"),
      }),
    );
  }
  if (order.id.toLowerCase() === 'default') {
    issues.push(
      block(file, 'ORD-04', validationText("订单 ID 不能是 “default”（缓存结束哨兵）"), {
        orderId: order.id,
        line: order.line,
        fixHint: validationText("换一个订单 ID"),
      }),
    );
  }
  if (/[\s\u4e00-\u9fa5]/.test(order.id) || /^(true|false|yes|no|on|off)$/i.test(order.id) || /^\d+$/.test(order.id)) {
    issues.push(
      warn(
        file,
        'ORD-05',
        validationText("订单 ID “{p0}” 含空格/中文/YAML 布尔词/纯数字，YAML 1.1 下可能有解析歧义", { p0: order.id }),
        { orderId: order.id, line: order.line, fixHint: validationText("建议使用 [A-Za-z0-9_]+（纯数字建议加引号）") },
      ),
    );
  }
}

function checkColors(order: OrderEntry, file: string, issues: OrdersIssue[]): void {
  const texts = [order.label, ...order.description];
  for (const text of texts) {
    const invalid = findInvalidColorCodes(text);
    for (const sequence of invalid) {
      issues.push(
        warn(file, 'COLOR-01', validationText("无效的颜色码 “{p0}” 会原样显示", { p0: sequence }), {
          orderId: order.id,
          line: order.line,
          fixHint: validationText("使用 &0-&f、&k-&o、&r 或 &#RRGGBB"),
        }),
      );
    }
    if (/%/.test(text)) {
      issues.push(
        warn(file, 'ORD-14', validationText("订单 label/description 中的 % 占位符不会被插件替换"), {
          orderId: order.id,
          line: order.line,
          fixHint: validationText("如果需要占位符文本，请改用对应菜单模板"),
        }),
      );
    }
  }
}

function checkQuest(
  order: OrderEntry,
  quest: QuestEntry,
  file: string,
  issues: OrdersIssue[],
  baseline: QuestTypeBaseline,
): void {
  const base = {
    orderId: order.id,
    questId: quest.id,
    line: quest.line,
    path: `${order.id}.quest.${quest.id}`,
  };

  if (!quest.validMap) {
    issues.push(
      block(file, 'ORD-20', validationText("quest “{p0}” 必须是映射（当前为 {p1}）", { p0: quest.id, p1: quest.valueKind }), base),
    );
    return;
  }
  if (quest.id.includes('.') || quest.id.includes(':')) {
    issues.push(block(file, 'ORD-06', validationText("quest ID “{p0}” 不能包含 “.” 或 “:”", { p0: quest.id }), base));
  }

  const type = quest.type.trim();
  const meta = questTypeMeta(type);
  if (!type) {
    issues.push(block(file, 'ORD-20', validationText("quest “{p0}” 缺少必填字段 type", { p0: quest.id }), base));
  } else if (!meta) {
    issues.push(
      block(
        file,
        'ORD-20',
        questTypeAllowedMessage(quest.id, type),
        { ...base, fixHint: validationText("从下拉框选择合法 type") },
      ),
    );
  }

  if (meta?.target === 'item') {
    const itemKind = quest.itemKind;
    if (itemKind === 'missing' || itemKind === 'null') {
      issues.push(block(file, 'ORD-21', validationText("quest “{p0}” 缺少 item 目标", { p0: quest.id }), base));
    } else if (itemKind !== 'string') {
      issues.push(block(file, 'ORD-21', validationText("quest “{p0}” 的 item 必须是字符串", { p0: quest.id }), base));
    } else {
      const parsed = parseEnumName(quest.item);
      if (!parsed) {
        issues.push(block(file, 'ORD-21', validationText("quest “{p0}” 的 item 为空", { p0: quest.id }), base));
      } else {
        if (parsed.namespaced) {
          issues.push(
            warn(
              file,
              'ORD-27',
              validationText("quest item “{p0}” 使用了 namespaced id；事件用 Material 枚举名比较，永远无法完成", { p0: quest.item }),
              { ...base, fixHint: validationText("改成 {p0}", { p0: parsed.name }) },
            ),
          );
        }
        if (!isKnownMaterial(parsed.name)) {
          issues.push(
            block(
              file,
              'ORD-21',
              validationText("quest item “{p0}” 不是合法的 Bukkit Material 枚举名", { p0: quest.item }),
              { ...base, fixHint: validationText("从材质下拉框选择（不要使用 namespaced id）") },
            ),
          );
        }
      }
    }
  }

  if (meta?.target === 'mob') {
    const mobKind = quest.mobKind;
    if (mobKind === 'missing' || mobKind === 'null') {
      issues.push(block(file, 'ORD-22', validationText("quest “{p0}” 缺少 mob 目标", { p0: quest.id }), base));
    } else if (mobKind !== 'string') {
      issues.push(block(file, 'ORD-22', validationText("quest “{p0}” 的 mob 必须是字符串", { p0: quest.id }), base));
    } else {
      const parsed = parseEnumName(quest.mob);
      if (!parsed) {
        issues.push(block(file, 'ORD-22', validationText("quest “{p0}” 的 mob 为空", { p0: quest.id }), base));
      } else {
        if (parsed.namespaced) {
          issues.push(
            warn(
              file,
              'ORD-27',
              validationText("quest mob “{p0}” 使用了 namespaced id；事件用 EntityType 枚举名比较，永远无法完成", { p0: quest.mob }),
              { ...base, fixHint: validationText("改成 {p0}", { p0: parsed.name }) },
            ),
          );
        }
        if (!isKnownEntityType(parsed.name)) {
          issues.push(
            block(
              file,
              'ORD-22',
              validationText("quest mob “{p0}” 不是合法的 Bukkit EntityType 枚举名", { p0: quest.mob }),
              { ...base, fixHint: validationText("从实体下拉框选择（不要使用 namespaced id）") },
            ),
          );
        } else if (type === 'feed' && !isFeedableAnimal(parsed.name)) {
          issues.push(
            error(
              file,
              'ORD-23',
              validationText("feed 的 mob “{p0}” 不在可喂食动物列表（COW/SHEEP/HORSE/LLAMA/PIG/RABBIT/CHICKEN/PARROT/FOX/TURTLE/WOLF/CAT）", { p0: quest.mob }),
              { ...base, fixHint: validationText("选择可喂食动物") },
            ),
          );
        }
      }
    }
  }

  if (quest.amountKind === 'missing' || quest.amountKind === 'null') {
    issues.push(block(file, 'ORD-24', validationText("quest “{p0}” 缺少 amount", { p0: quest.id }), base));
  } else if (quest.amountKind === 'string') {
    issues.push(
      block(
        file,
        'ORD-24',
        validationText("quest “{p0}” 的 amount “{p1}” 是字符串；getInt 只认裸数字，会读成 0", { p0: quest.id, p1: quest.amount }),
        { ...base, fixHint: validationText("去掉引号并填正整数") },
      ),
    );
  } else if (quest.amountKind === 'number') {
    const amount = Number(quest.amount);
    if (!Number.isInteger(amount) || amount < 1) {
      issues.push(
        block(file, 'ORD-24', validationText("quest “{p0}” 的 amount 必须是 ≥1 的整数（当前 {p1}）", { p0: quest.id, p1: quest.amount }), base),
      );
    } else if (amount > 100000) {
      issues.push(
        warn(file, 'ORD-25', validationText("quest “{p0}” 的 amount={p1} 较大，请确认不是误填", { p0: quest.id, p1: amount }), base),
      );
    }
  } else {
    issues.push(block(file, 'ORD-24', validationText("quest “{p0}” 的 amount 类型非法", { p0: quest.id }), base));
  }

  const previousType = baseline.get(baselineKey(order.id, quest.id));
  if (previousType && previousType !== type) {
    issues.push(
      error(
        file,
        'ORD-26',
        validationText("quest “{p0}” 的 type 从 “{p1}” 改为 “{p2}”：旧进度 key 失效，orders 菜单/完成提示会 NPE、奖励不结算", { p0: quest.id, p1: previousType, p2: type }),
        { ...base, fixHint: validationText("先清理玩家进度，或改用新的 quest ID") },
      ),
    );
  }

  if (quest.extraKeys.length > 0) {
    issues.push(
      info(
        file,
        'GEN-03',
        validationText("quest “{p0}” 含 {p1} 个未识别字段（{p2}），将原样保留", { p0: quest.id, p1: quest.extraKeys.length, p2: quest.extraKeys.join(', ') }),
        base,
      ),
    );
  }
}

function checkReward(
  order: OrderEntry,
  reward: RewardEntry,
  file: string,
  issues: OrdersIssue[],
): void {
  const base = {
    orderId: order.id,
    rewardIndex: reward.index,
    path: `${order.id}.reward[${reward.index}]`,
    line: reward.line,
  };

  if (!reward.isString) {
    issues.push(
      error(
        file,
        'RWD-15',
        validationText("奖励第 {p0} 行不是字符串（{p1}）：getStringList 会跳过 map/list，或把数字转成未知 type", { p0: reward.index + 1, p1: reward.kind }),
        { ...base, fixHint: validationText("改成字符串格式，如 item;stone;1") },
      ),
    );
    return;
  }
  if (reward.raw.trim() === '') {
    issues.push(warn(file, 'RWD-02', validationText("奖励第 {p0} 行为空，插件会静默忽略", { p0: reward.index + 1 }), base));
    return;
  }

  const segments = splitReward(reward.raw);
  const type = (segments[0] ?? '').toLowerCase();
  const meta = rewardTypeMeta(type);
  if (!meta) {
    issues.push(
      warn(
        file,
        'RWD-02',
        validationText("未知奖励类型 “{p0}”：插件会静默忽略，已原样保留", { p0: segments[0] ?? '' }),
        { ...base, fixHint: rewardTypeAllowedHint() },
      ),
    );
    return;
  }

  const requireSegments = (count: number): boolean => {
    if (segments.length >= count) return true;
    issues.push(
      block(
        file,
        'RWD-01',
        validationText("奖励第 {p0} 行 “{p1}” 段数不足：{p2} 至少需要 {p3} 段（缺少参数会数组越界、发奖中断）", { p0: reward.index + 1, p1: reward.raw, p2: type, p3: count }),
        { ...base, fixHint: validationText("格式：{p0}", { p0: meta.hint }) },
      ),
    );
    return false;
  };

  if (type === 'item') {
    if (!requireSegments(3)) return;
    const materialRaw = segments[1]?.trim() ?? '';
    const parsed = parseEnumName(materialRaw);
    if (!materialRaw || !parsed) {
      issues.push(block(file, 'RWD-03', validationText("奖励第 {p0} 行缺少物品材料", { p0: reward.index + 1 }), base));
      return;
    }
    if (!isKnownMaterial(parsed.name)) {
      issues.push(
        block(
          file,
          'RWD-03',
          validationText("奖励材料 “{p0}” 不是合法的 Bukkit Material，打开订单菜单会 NPE", { p0: materialRaw }),
          { ...base, fixHint: validationText("使用材质枚举名（可带 minecraft: 前缀）") },
        ),
      );
      return;
    }
    if (!isItemMaterial(parsed.name)) {
      issues.push(
        block(
          file,
          'RWD-03',
          validationText("奖励材料 “{p0}” 不是物品（Material#isItem()=false），ItemStack.of 会抛 IAE", { p0: materialRaw }),
          { ...base, fixHint: validationText("选择物品类材质（AIR 也不行）") },
        ),
      );
      return;
    }
    const amountRaw = segments[2]?.trim() ?? '';
    if (!/^\+?\d+$/.test(amountRaw)) {
      issues.push(
        block(
          file,
          'RWD-04',
          validationText("奖励数量 “{p0}” 不是整数（非整数会被跳过，0/负数会抛 IAE 中断后续奖励）", { p0: amountRaw }),
          { ...base, fixHint: validationText("填 1..64 的正整数") },
        ),
      );
      return;
    }
    const amount = Number(amountRaw);
    if (amount <= 0) {
      issues.push(block(file, 'RWD-04', validationText("奖励数量必须为正整数（当前 {p0}）", { p0: amount }), base));
    } else if (amount > 64) {
      issues.push(warn(file, 'RWD-04', validationText("奖励数量 {p0} > 64，堆叠行为未确认", { p0: amount }), base));
    }
    if (segments.length > 3) {
      issues.push(warn(file, 'RWD-08', validationText("奖励第 {p0} 行有超过 3 段，多余段会被忽略", { p0: reward.index + 1 }), base));
    }
    return;
  }

  if (type === 'company_income' || type === 'money') {
    if (!requireSegments(2)) return;
    const valueRaw = segments[1]?.trim() ?? '';
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(valueRaw)) {
      issues.push(
        error(file, 'RWD-05', validationText("奖励金额 “{p0}” 不是数字，插件会跳过该条", { p0: valueRaw }), {
          ...base,
          fixHint: validationText("示例：1500.0"),
        }),
      );
      return;
    }
    const value = Number(valueRaw);
    if (value < 0) {
      issues.push(block(file, 'RWD-06', validationText("奖励金额不能为负（当前 {p0}），等于反向扣款", { p0: valueRaw }), base));
    }
    if (segments.length > 2) {
      issues.push(warn(file, 'RWD-08', validationText("奖励第 {p0} 行有超过 2 段，多余段会被忽略", { p0: reward.index + 1 }), base));
    }
    return;
  }

  if (type === 'experience') {
    if (!requireSegments(2)) return;
    const valueRaw = segments[1]?.trim() ?? '';
    if (!/^\+?\d+$/.test(valueRaw)) {
      issues.push(error(file, 'RWD-07', validationText("经验值 “{p0}” 不是整数，插件会跳过该条", { p0: valueRaw }), base));
      return;
    }
    const value = Number(valueRaw);
    if (value < 0) {
      issues.push(error(file, 'RWD-07', validationText("经验值不能为负（当前 {p0}），giveExp 会反向扣经验", { p0: value }), base));
    }
    if (segments.length > 2) {
      issues.push(warn(file, 'RWD-08', validationText("奖励第 {p0} 行有超过 2 段，多余段会被忽略", { p0: reward.index + 1 }), base));
    }
    return;
  }

  if (type === 'console_command') {
    if (segments.length < 2) {
      requireSegments(2);
      return;
    }
    if (segments.length > 2) {
      issues.push(
        error(
          file,
          'RWD-08',
          validationText("控制台命令 “{p0}” 含 “;”：split(\";\") 只取第二段，后续命令会被截断", { p0: reward.raw }),
          { ...base, fixHint: validationText("命令正文不能包含分号") },
        ),
      );
    }
    const command = segments[1] ?? '';
    if (command.trim() === '') {
      issues.push(error(file, 'RWD-09', validationText("控制台命令为空"), base));
    }
    if (command.startsWith('/')) {
      issues.push(
        warn(file, 'RWD-10', validationText("控制台命令不应有前导 “/”（dispatchCommand 约定）"), {
          ...base,
          fixHint: validationText("去掉前导斜杠：{p0}", { p0: command.replace(/^\/+/, '') }),
        }),
      );
    }
    if (command.includes('%PLAYER%')) {
      issues.push(
        warn(file, 'RWD-11', validationText("命令中的 %PLAYER% 不会被替换，只有小写 %player% 生效"), {
          ...base,
          fixHint: validationText("改成 %player%"),
        }),
      );
    }
    return;
  }
}

function checkOrder(
  order: OrderEntry,
  file: string,
  issues: OrdersIssue[],
  baseline: QuestTypeBaseline,
): void {
  checkOrderId(order, file, issues);

  if (!order.validMap) {
    issues.push(
      block(
        file,
        'ORD-01',
        validationText("顶层订单 “{p0}” 必须是映射（当前为 {p1}{p2}）", { p0: order.id, p1: order.valueKind, p2: order.preview ? `：${order.preview}` : '' }),
        { orderId: order.id, line: order.line, fixHint: validationText("删除该键或改成订单结构") },
      ),
    );
    return;
  }

  if (order.labelKind === 'missing' || order.labelKind === 'null') {
    issues.push(block(file, 'ORD-10', validationText("订单 “{p0}” 缺少必填 label", { p0: order.id }), { orderId: order.id, line: order.line }));
  } else if (order.labelKind !== 'string') {
    issues.push(
      block(file, 'ORD-10', validationText("订单 “{p0}” 的 label 必须是字符串（当前为 {p1}）", { p0: order.id, p1: order.labelKind }), {
        orderId: order.id,
        line: order.line,
        fixHint: validationText("加引号写成字符串"),
      }),
    );
  } else if (!order.label.trim()) {
    issues.push(block(file, 'ORD-10', validationText("订单 “{p0}” 的 label 不能为空", { p0: order.id }), { orderId: order.id, line: order.line }));
  }

  if (order.descriptionKind === 'string') {
    issues.push(
      error(file, 'ORD-11', validationText("订单 “{p0}” 的 description 是单个字符串，getStringList 会读成空列表", { p0: order.id }), {
        orderId: order.id,
        line: order.line,
        fixHint: validationText("改成字符串列表（每行一条）"),
      }),
    );
  } else if (order.descriptionKind === 'seq' && order.descriptionHasInvalidEntry) {
    issues.push(
      error(file, 'ORD-11', validationText("订单 “{p0}” 的 description 含非字符串条目，会被忽略", { p0: order.id }), {
        orderId: order.id,
        line: order.line,
        fixHint: validationText("每个列表项都写成字符串"),
      }),
    );
  } else if (!['missing', 'null', 'seq'].includes(order.descriptionKind)) {
    issues.push(
      error(file, 'ORD-11', validationText("订单 “{p0}” 的 description 必须是字符串列表", { p0: order.id }), {
        orderId: order.id,
        line: order.line,
      }),
    );
  }

  if (order.questKind === 'missing' || order.questKind === 'null') {
    issues.push(block(file, 'ORD-12', validationText("订单 “{p0}” 缺少必填 quest 段", { p0: order.id }), { orderId: order.id, line: order.line }));
  } else if (order.questKind !== 'map') {
    issues.push(
      block(file, 'ORD-12', validationText("订单 “{p0}” 的 quest 必须是映射", { p0: order.id }), { orderId: order.id, line: order.line }),
    );
  } else if (order.quests.length === 0) {
    issues.push(
      block(file, 'ORD-12', validationText("订单 “{p0}” 至少需要 1 个 quest", { p0: order.id }), { orderId: order.id, line: order.line }),
    );
  }

  if (order.rewardKind === 'string' || order.rewardKind === 'map' || order.rewardKind === 'number') {
    issues.push(
      error(file, 'ORD-13', validationText("订单 “{p0}” 的 reward 必须是字符串列表", { p0: order.id }), {
        orderId: order.id,
        line: order.line,
        fixHint: validationText("改成列表，每行一条奖励"),
      }),
    );
  } else if (order.rewardKind === 'seq' && order.rewards.length === 0) {
    issues.push(warn(file, 'RWD-14', validationText("订单 “{p0}” 没有任何奖励", { p0: order.id }), { orderId: order.id }));
  } else if (order.rewardKind === 'missing' || order.rewardKind === 'null') {
    issues.push(warn(file, 'RWD-14', validationText("订单 “{p0}” 没有 reward，完成无奖励", { p0: order.id }), { orderId: order.id }));
  }

  if (order.questKind === 'map') {
    for (const quest of order.quests) {
      checkQuest(order, quest, file, issues, baseline);
    }
  }

  if (order.rewardKind === 'seq') {
    for (const reward of order.rewards) {
      checkReward(order, reward, file, issues);
    }
    const onlyConsole =
      order.rewards.length > 0 && order.rewards.every((reward) => reward.type === 'console_command');
    if (onlyConsole) {
      issues.push(
        warn(
          file,
          'RWD-13',
          validationText("订单 “{p0}” 只有 console_command 奖励：订单菜单奖励区为空", { p0: order.id }),
          { orderId: order.id },
        ),
      );
    }
    if (order.rewards.some((reward) => reward.type === 'console_command')) {
      issues.push(
        info(
          file,
          'RWD-12',
          validationText("订单 “{p0}” 含 console_command：等价于以控制台权限执行任意命令", { p0: order.id }),
          { orderId: order.id },
        ),
      );
    }
  }

  if (order.extraKeys.length > 0) {
    issues.push(
      info(
        file,
        'GEN-03',
        validationText("订单 “{p0}” 含 {p1} 个未识别字段（{p2}），将原样保留", { p0: order.id, p1: order.extraKeys.length, p2: order.extraKeys.join(', ') }),
        { orderId: order.id },
      ),
    );
  }

  checkColors(order, file, issues);
}

/** 纯函数校验：便于测试与导出前复算。 */
export function validateOrdersModel(
  model: OrdersModel,
  file: string,
  baseline: QuestTypeBaseline = sharedBaseline,
): OrdersIssue[] {
  const issues: OrdersIssue[] = [];
  if (model.syntaxError) return issues;
  if (model.topLevelKind !== 'map') {
    if (model.topLevelKind !== 'missing') {
      issues.push(
        block(file, 'ORD-01', validationText("orders.yml 顶层必须是订单映射（当前为 {p0}）", { p0: model.topLevelKind }), {
          path: '$',
          fixHint: validationText("顶层每个 key 必须是订单对象"),
        }),
      );
    }
    return issues;
  }
  if (model.orders.length === 0) {
    issues.push(warn(file, 'ORD-07', validationText("orders.yml 中没有任何订单，每日菜单会空白"), { path: '$' }));
  }

  for (const order of model.orders) {
    checkOrder(order, file, issues, baseline);
  }

  // quest ID 重复（ORD-28）来自 YAML 层面，模型会被后者覆盖，需从 duplicates 取。
  for (const duplicate of model.duplicates) {
    const suffix = '.quest.';
    const index = duplicate.path.lastIndexOf(suffix);
    if (index <= 0) continue;
    const orderId = duplicate.path.slice(0, index);
    const questId = duplicate.path.slice(index + suffix.length);
    if (!questId) continue;
    issues.push(
      error(file, 'ORD-28', validationText("订单 “{p0}” 的 quest ID “{p1}” 重复：YAML 后者覆盖前者", { p0: orderId, p1: questId }), {
        orderId,
        questId,
        line: duplicate.line,
        fixHint: validationText("重命名或删除重复 quest"),
      }),
    );
  }

  return issues;
}

export function validateOrdersText(
  text: string,
  file = 'orders.yml',
  baseline: QuestTypeBaseline = sharedBaseline,
): OrdersIssue[] {
  const parsed = parseOrdersFile(text);
  return validateOrdersModel(parsed.model, file, baseline);
}

/** 从 core ValidationContext 的 ParsedYaml 校验（store 注册用）。 */
export function validateOrdersParsed(file: ProjectFile, parsed: ParsedYaml): OrdersIssue[] {
  if (file.kind !== 'orders') return [];
  if (!parsed.ok) return [];
  const model = buildOrdersModel(parsed.doc ?? null, parsed.normalizedText, parsed);
  return validateOrdersModel(model, file.path);
}

let registered = false;

/** 幂等注册到 core 校验框架；index.ts 与编辑器都会调用。 */
export function ensureOrdersValidatorRegistered(): void {
  if (registered) return;
  registered = true;
  registerValidator((context) => {
    const issues: OrdersIssue[] = [];
    for (const file of context.files) {
      const parsed = context.parsed[file.path];
      if (!parsed) continue;
      issues.push(...validateOrdersParsed(file, parsed));
    }
    return issues;
  });
}

/** 订单 ID 输入校验（重命名/新建用）。 */
export function validateOrderIdInput(
  id: string,
  existingIds: string[],
  currentId?: string,
): { error?: string; warning?: string } {
  const trimmed = id.trim();
  if (!trimmed) return { error: validationText("订单 ID 不能为空") };
  if (trimmed.includes('.')) return { error: validationText("订单 ID 不能包含 “.”") };
  if (trimmed.includes(':')) return { error: validationText("订单 ID 不能包含 “:”") };
  if (trimmed.toLowerCase() === 'default') return { error: validationText("订单 ID 不能是 “default”") };
  if (existingIds.some((existing) => existing === trimmed && existing !== currentId)) {
    return { error: validationText("订单 ID “{p0}” 已存在", { p0: trimmed }) };
  }
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    return { warning: validationText("建议只使用字母、数字与下划线，避免 YAML 解析歧义") };
  }
  return {};
}

/** quest ID 输入校验。 */
export function validateQuestIdInput(
  id: string,
  existingIds: string[],
  currentId?: string,
): { error?: string; warning?: string } {
  const trimmed = id.trim();
  if (!trimmed) return { error: validationText("quest ID 不能为空") };
  if (trimmed.includes('.')) return { error: validationText("quest ID 不能包含 “.”") };
  if (trimmed.includes(':')) return { error: validationText("quest ID 不能包含 “:”") };
  if (existingIds.some((existing) => existing === trimmed && existing !== currentId)) {
    return { error: validationText("quest ID “{p0}” 在本订单内已存在", { p0: trimmed }) };
  }
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    return { warning: validationText("建议只使用字母、数字与下划线") };
  }
  return {};
}

export { valueKind };
