import { validationText } from '../../core/validation';
import type { ProjectFile, ValidationIssue } from '../../core/types';
import type { ParsedYaml } from '../../core/yaml';
import { registerValidator } from '../../core/validation';
import {
  buildFocusModel,
  parseFocusFile,
  type ConditionModel,
  type EffectGroupModel,
  type ExpertiseModel,
  type FocusFileModel,
  type ParsedFocusFile,
} from './focusDoc';
import {
  KNOWN_ITEM_TYPES,
  LOG_IDS,
  defaultValueError,
  isAllOrBlock,
  isAllOrEntity,
  isAllOrItemType,
  isAllOrMaterial,
  isBlockMaterialName,
  isFocusValueType,
  parseChanceRow,
  parseCompanyLogRow,
  parseDamageRow,
  parseDropRow,
  parseDurabilityRow,
  parseHasteRow,
  splitOrGroup,
} from './focusConstants';
import { ACTION_KEYS, EFFECT_KEYS, EFFECT_TYPES, CONDITION_KEYS } from './catalog';
import type { EffectTypeMeta } from './catalog';
import { ENTITY_TYPE_NAMES } from './data/minecraftEnums';

export function actionTypeAllowedHint(keys: string[] = ACTION_KEYS): string {
  return validationText('只允许 {p0}', { p0: keys.join('/') });
}

export function effectTypeAllowedHint(keys: string[] = EFFECT_KEYS): string {
  return validationText('只允许小写 {p0}', { p0: keys.join(' / ') });
}

export function conditionUnknownHint(keys: string[] = CONDITION_KEYS): string {
  return validationText('删除或改成 {p0}', { p0: keys.join('/') });
}

export interface FocusIssue extends ValidationIssue {
  nodeId?: string;
  focusId?: string;
}

function issue(
  severity: ValidationIssue['severity'],
  file: string,
  code: string,
  message: string,
  extra: Partial<FocusIssue> & { fixHint?: string; blocking?: boolean } = {},
): FocusIssue {
  return {
    severity,
    file,
    code,
    message,
    path: extra.path,
    line: extra.line,
    blocking: extra.blocking,
    fixHint: extra.fixHint,
    nodeId: extra.nodeId,
    focusId: extra.focusId,
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

interface RefContext {
  file: string;
  nodeId?: string;
  focusId: string;
  ownerIds: Set<string>;
  otherIds: Set<string>;
}

function refIssue(
  ctx: RefContext,
  id: string,
  code: string,
  label: string,
  line?: number,
): FocusIssue | null {
  const trimmed = id.trim();
  if (!trimmed) {
    return block(ctx.file, code, validationText("{p0}引用了空专精 ID", { p0: label }), { nodeId: ctx.nodeId, line });
  }
  if (ctx.ownerIds.has(trimmed)) {
    if (ctx.nodeId && trimmed === ctx.nodeId) {
      return error(
        ctx.file,
        'FOC-CYCLE',
        validationText("{p0}引用了节点自身 “{p1}”，该节点永远无法解锁", { p0: label, p1: trimmed }),
        { nodeId: ctx.nodeId, line },
      );
    }
    return null;
  }
  if (ctx.otherIds.has(trimmed)) {
    return error(
      ctx.file,
      'X-06',
      validationText("{p0}引用了另一个 focus 文件的专精 “{p1}”；公司同时只有一个 focus，条件永远不满足", { p0: label, p1: trimmed }),
      { nodeId: ctx.nodeId, line, fixHint: validationText("改为当前 focus 内的节点 ID") },
    );
  }
  return error(ctx.file, code, validationText("{p0}引用的专精 “{p1}” 不存在", { p0: label, p1: trimmed }), {
    nodeId: ctx.nodeId,
    line,
    fixHint: validationText("从当前 focus 的节点列表选择"),
  });
}

function validateCondition(
  condition: ConditionModel,
  ctx: RefContext,
  ownerLabel: string,
): FocusIssue[] {
  const issues: FocusIssue[] = [];
  const base = { nodeId: ctx.nodeId, focusId: ctx.focusId };
  for (const extra of condition.unknown) {
    issues.push(
      warn(ctx.file, 'CON-09', validationText("{p0}含未知条件键 “{p1}”，插件会静默忽略", { p0: ownerLabel, p1: extra.key }), {
        ...base,
        fixHint: conditionUnknownHint(),
      }),
    );
  }

  if (condition.companyMoney) {
    const raw = condition.companyMoney.raw.trim();
    const numeric = /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw);
    if (!numeric) {
      issues.push(
        block(ctx.file, 'CON-01', validationText("{p0}的 company_money “{p1}” 不是数字，启动会失败", { p0: ownerLabel, p1: raw }), {
          ...base,
          fixHint: validationText("填写 ≥0 的裸数字"),
        }),
      );
    } else if (Number(raw) < 0) {
      issues.push(
        block(ctx.file, 'CON-01', validationText("{p0}的 company_money 不能为负（当前 {p1}）", { p0: ownerLabel, p1: raw }), {
          ...base,
          fixHint: validationText("公司资金条件必须 ≥0"),
        }),
      );
    }
  }

  if (condition.expertise) {
    if (condition.expertise.kind !== 'string') {
      issues.push(
        block(ctx.file, 'CON-02', validationText("{p0}的 expertise 必须是字符串节点 ID", { p0: ownerLabel }), base),
      );
    } else {
      const ref = refIssue(ctx, condition.expertise.raw, 'CON-02', validationText("{p0}的 expertise ", { p0: ownerLabel }));
      if (ref) issues.push(ref);
    }
  }

  if (condition.expertises) {
    if (condition.expertises.kind !== 'seq') {
      issues.push(
        block(
          ctx.file,
          'CON-03',
          validationText("{p0}的 expertises 必须是字符串列表；标量会在强转时 ClassCastException", { p0: ownerLabel }),
          base,
        ),
      );
    } else {
      condition.expertises.items.forEach((group) => {
        const ids = splitOrGroup(group);
        if (ids.length === 0) {
          issues.push(
            block(ctx.file, 'CON-04', validationText("{p0}的 expertises 有空项（行内 OR 组不能为空）", { p0: ownerLabel }), base),
          );
          return;
        }
        for (const id of ids) {
          const ref = refIssue(ctx, id, 'CON-04', validationText("{p0}的 expertises ", { p0: ownerLabel }));
          if (ref) issues.push(ref);
        }
      });
    }
  }

  if (condition.companyLog) {
    if (condition.companyLog.kind !== 'seq') {
      issues.push(
        block(
          ctx.file,
          'CON-05',
          validationText("{p0}的 company_log 必须是字符串列表；标量会在强转时 ClassCastException", { p0: ownerLabel }),
          base,
        ),
      );
    } else {
      condition.companyLog.items.forEach((row) => {
        const parsed = parseCompanyLogRow(row);
        if (!parsed.valid) {
          issues.push(
            block(
              ctx.file,
              'CON-05',
              validationText("{p0}的 company_log “{p1}” 格式错误：{p2}", { p0: ownerLabel, p1: row, p2: parsed.reason ?? '需要 3 段' }),
              base,
            ),
          );
          return;
        }
        if (!(LOG_IDS as readonly string[]).includes(parsed.logId)) {
          issues.push(
            warn(
              ctx.file,
              'CON-06',
              validationText("{p0}的 company_log 使用了未知 logId “{p1}”，计数永远为 0", { p0: ownerLabel, p1: parsed.logId }),
              base,
            ),
          );
        }
        const entity = parsed.entity;
        if (parsed.logId === 'block_break_count') {
          if (!isBlockMaterialName(entity)) {
            issues.push(
              block(
                ctx.file,
                'CON-07',
                validationText("{p0}的 company_log 方块 “{p1}” 必须是大写、合法的方块 Material；ALL/小写/物品都会让计数永远不增长", { p0: ownerLabel, p1: entity }),
                { ...base, fixHint: validationText("例如 STONE、COAL_ORE、DIAMOND_ORE（大写，不能用 ALL）") },
              ),
            );
          }
        } else if (!ENTITY_TYPE_NAMES.has(entity)) {
          issues.push(
            block(
              ctx.file,
              'CON-07',
              validationText("{p0}的 company_log 实体 “{p1}” 必须是大写、合法的 EntityType 枚举名；否则菜单渲染 NPE/IAE", { p0: ownerLabel, p1: entity }),
              { ...base, fixHint: validationText("例如 ZOMBIE、CREEPER（不能用小写）") },
            ),
          );
        }
        if (!/^[+-]?\d+$/.test(parsed.threshold)) {
          issues.push(
            error(ctx.file, 'CON-08', validationText("{p0}的 company_log 数值 “{p1}” 不是整数", { p0: ownerLabel, p1: parsed.threshold }), base),
          );
        } else if (Number(parsed.threshold) < 0) {
          issues.push(
            warn(ctx.file, 'CON-08', validationText("{p0}的 company_log 数值为负，条件会恒真", { p0: ownerLabel }), base),
          );
        }
      });
    }
  }

  return issues;
}

function validateAction(action: ActionModelLike, ctx: RefContext): FocusIssue[] {
  const issues: FocusIssue[] = [];
  const base = { nodeId: ctx.nodeId, focusId: ctx.focusId };

  if (!['missing', 'null', 'map'].includes(action.kind)) {
    issues.push(
      block(ctx.file, 'EFF-11', validationText("action 必须是映射（map），标量会在 getConfigurationSection 处 NPE"), base),
    );
    return issues;
  }
  if (action.kind === 'missing' || action.kind === 'null') return issues;
  if (action.hasNone) {
    issues.push(info(ctx.file, 'ACT-08', validationText("action.none 在枚举中存在但没有执行分支，等于无效果"), base));
  }
  for (const extra of action.unknown) {
    issues.push(
      warn(ctx.file, 'ACT-01', validationText("未知 action 键 “{p0}”（大小写不敏感匹配也失败），插件会跳过", { p0: extra.key }), {
        ...base,
        fixHint: actionTypeAllowedHint(),
      }),
    );
  }

  const listFields: Array<{
    key: string;
    model: StringListLike;
    refCode: string;
    checkRefs: boolean;
  }> = [
    {
      key: 'console_command',
      model: action.consoleCommands,
      refCode: 'ACT-02',
      checkRefs: false,
    },
    {
      key: 'enable_expertise',
      model: action.enableExpertise,
      refCode: 'ACT-02',
      checkRefs: true,
    },
    {
      key: 'disable_expertise',
      model: action.disableExpertise,
      refCode: 'ACT-02',
      checkRefs: true,
    },
  ];
  for (const field of listFields) {
    if (field.model.kind === 'missing' || field.model.kind === 'null') continue;
    if (field.model.kind !== 'seq') {
      issues.push(
        block(
          ctx.file,
          field.refCode,
          validationText("{p0} 必须是字符串列表；getStringList 对标量返回空列表，功能静默失效", { p0: field.key }),
          base,
        ),
      );
      continue;
    }
    field.model.items.forEach((item) => {
      if (field.key === 'console_command') {
        if (item.startsWith('/')) {
          issues.push(
            warn(ctx.file, 'ACT-05', validationText("console_command 不应有前导 “/”：{p0}", { p0: item }), {
              ...base,
              fixHint: validationText("去掉斜杠：{p0}", { p0: item.replace(/^\/+/, '') }),
            }),
          );
        }
        if (item.includes('%player%')) {
          issues.push(
            info(
              ctx.file,
              'ACT-06',
              validationText("命令含 %player%：会对公司所有员工分别执行一次"),
              base,
            ),
          );
        }
      } else if (field.checkRefs) {
        const ref = refIssue(ctx, item, 'ACT-03', `${field.key} `);
        if (ref) issues.push(ref);
        if (field.key === 'disable_expertise' && ctx.nodeId && item.trim() === ctx.nodeId) {
          issues.push(
            warn(ctx.file, 'ACT-07', validationText("disable_expertise 指向节点自身，节点会从常规菜单隐藏"), base),
          );
        }
      }
    });
  }

  if (action.setPriceGroup) {
    if (action.setPriceGroup.kind !== 'string' || !action.setPriceGroup.raw.trim()) {
      issues.push(
        block(
          ctx.file,
          'ACT-04',
          validationText("set_price_group 必须是非空标量字符串（列表/映射会 toString 成无效 group）"),
          base,
        ),
      );
    }
  }

  return issues;
}

function validateEffect(effect: EffectModelLike, ctx: RefContext): FocusIssue[] {
  const issues: FocusIssue[] = [];
  const base = { nodeId: ctx.nodeId, focusId: ctx.focusId };
  if (!['missing', 'null', 'map'].includes(effect.kind)) {
    issues.push(
      block(ctx.file, 'EFF-11', validationText("effect 必须是映射（map），标量会在 getConfigurationSection 处 NPE"), base),
    );
    return issues;
  }
  if (effect.kind === 'missing' || effect.kind === 'null') return issues;

  for (const extra of effect.unknown) {
    issues.push(
      warn(
        ctx.file,
        'EFF-01',
        validationText("未知/大小写不正确的 effect 键 “{p0}”；EffectType.getById 大小写敏感，插件会跳过", { p0: extra.key }),
        { ...base, fixHint: effectTypeAllowedHint() },
      ),
    );
  }

  const addChanceIssue = (code: string, effectName: string, raw: string): void => {
    const chance = Number(raw);
    if (!Number.isFinite(chance)) {
      issues.push(
        block(ctx.file, code, validationText("{p0} 的概率 “{p1}” 不是数字", { p0: effectName, p1: raw }), base),
      );
      return;
    }
    if (chance < 0 || chance > 100) {
      issues.push(
        block(ctx.file, code, validationText("{p0} 的概率 {p1} 必须在 0..100", { p0: effectName, p1: raw }), {
          ...base,
          fixHint: validationText("概率必须在 0..100（0.01% 精度）"),
        }),
      );
      return;
    }
    if ((raw.split('.')[1] ?? '').length > 2) {
      issues.push(
        info(ctx.file, 'EFF-10', validationText("概率 {p0} 超过两位小数，判定精度为 0.01%", { p0: raw }), base),
      );
    }
  };

  const validateDropGroup = (meta: EffectTypeMeta, group: EffectGroupModel): void => {
    const mob = meta.value === 'mob_drops_add';
    const shapeCode = mob ? 'EFF-03' : 'EFF-14';
    for (const row of group.rows) {
      if (!row.isString) {
        issues.push(
          block(
            ctx.file,
            shapeCode,
            validationText("{p0} 的组 “{p1}” 含非字符串参数行", { p0: meta.value, p1: group.entity }),
            base,
          ),
        );
        continue;
      }
      const parsed = parseDropRow(row.raw);
      if (!parsed.valid) {
        issues.push(
          block(
            ctx.file,
            shapeCode,
            validationText("{p0} 参数 “{p1}” 格式错误：{p2}", {
              p0: meta.value,
              p1: row.raw,
              p2: parsed.reason ?? '需要 3 段',
            }),
            base,
          ),
        );
        continue;
      }
      if (!isAllOrMaterial(parsed.item)) {
        issues.push(
          block(
            ctx.file,
            mob ? 'EFF-04' : 'EFF-14',
            validationText("{p0} 物品 “{p1}” 非法：Material.getMaterial 返回 null 后会退化成对所有掉落生效", {
              p0: meta.value,
              p1: parsed.item,
            }),
            { ...base, fixHint: validationText("使用 Material 枚举名（不能带 minecraft: 前缀）或 ALL") },
          ),
        );
      }
      if (!/^-?\d+$/.test(parsed.amount)) {
        issues.push(
          block(
            ctx.file,
            mob ? 'EFF-05' : 'EFF-14',
            validationText("{p0} 数量 “{p1}” 必须是整数", { p0: meta.value, p1: parsed.amount }),
            base,
          ),
        );
      } else if (Number(parsed.amount) < 0) {
        issues.push(block(ctx.file, mob ? 'EFF-05' : 'EFF-14', validationText("{p0} 数量不能为负", { p0: meta.value }), base));
      } else if (parsed.sign === '*' && Number(parsed.amount) === 0) {
        issues.push(
          block(
            ctx.file,
            'EFF-06',
            validationText("{p0} 使用 *0，命中后掉落数量会被清零；编辑器阻止导出", { p0: meta.value }),
            { ...base, fixHint: validationText("把 *0 改成 *1 或 +1") },
          ),
        );
      }
      const chance = Number(parsed.chance);
      if (!Number.isFinite(chance)) {
        issues.push(
          block(
            ctx.file,
            shapeCode,
            validationText("{p0} 概率 “{p1}” 不是数字", { p0: meta.value, p1: parsed.chance }),
            base,
          ),
        );
      } else if (chance < 0 || chance > 100) {
        issues.push(
          block(
            ctx.file,
            mob ? 'EFF-08' : 'EFF-14',
            validationText("{p0} 概率 {p1} 必须在 0..100", { p0: meta.value, p1: parsed.chance }),
            { ...base, fixHint: validationText("概率必须在 0..100") },
          ),
        );
      } else if ((parsed.chance.split('.')[1] ?? '').length > 2) {
        issues.push(
          info(ctx.file, 'EFF-10', validationText("概率 {p0} 超过两位小数，判定精度为 0.01%", { p0: parsed.chance }), base),
        );
      }
    }
  };

  for (const meta of EFFECT_TYPES) {
    const groups =
      effect.byType?.[meta.value] ??
      (meta.value === 'mob_drops_add' ? effect.drops : meta.value === 'mob_damage_multiply' ? effect.damage : []);
    for (const group of groups) {
      if (group.valueKind !== 'seq') {
        issues.push(
          block(
            ctx.file,
            'EFF-11',
            validationText("{p0} 的组 “{p1}” 值必须是列表", { p0: meta.value, p1: group.entity }),
            base,
          ),
        );
        continue;
      }

      if (meta.groupKind === 'entity') {
        if (!isAllOrEntity(group.entity)) {
          issues.push(
            block(
              ctx.file,
              'EFF-02',
              validationText("effect 实体 key “{p0}” 必须是 ALL 或合法 EntityType（非法值启动即 IAE）", { p0: group.entity }),
              { ...base, fixHint: validationText("例如 ALL、ZOMBIE、CREEPER") },
            ),
          );
        }
      } else if (meta.groupKind === 'block') {
        if (!isAllOrBlock(group.entity)) {
          issues.push(
            block(
              ctx.file,
              'EFF-13',
              validationText("{p0} 的方块 key “{p1}” 必须是 ALL 或方块 Material；物品/未知 Material 会 null 并扩大范围", {
                p0: meta.value,
                p1: group.entity,
              }),
              { ...base, fixHint: validationText("例如 ALL、STONE、COAL_ORE、DEEPSLATE_IRON_ORE") },
            ),
          );
        }
      } else if (group.entity !== 'ALL' && !isAllOrMaterial(group.entity)) {
        if (!isAllOrItemType(group.entity)) {
          issues.push(
            block(
              ctx.file,
              'EFF-13',
              validationText("{p0} 的目标 key “{p1}” 必须是 ALL、物品 Material 或小写 item-type", {
                p0: meta.value,
                p1: group.entity,
              }),
              { ...base, fixHint: validationText("例如 ALL、DIAMOND_PICKAXE、pickaxe") },
            ),
          );
        } else if (!(KNOWN_ITEM_TYPES as readonly string[]).includes(group.entity)) {
          issues.push(
            warn(
              ctx.file,
              'EFF-18',
              validationText("{p0} 使用了未知 item-type 组 “{p1}”；插件只内置 pickaxe，其他组通常永远不匹配", {
                p0: meta.value,
                p1: group.entity,
              }),
              { ...base, fixHint: validationText("使用 pickaxe 或具体物品 Material") },
            ),
          );
        }
      }

      if (meta.rowKind === 'drop') {
        validateDropGroup(meta, group);
        continue;
      }

      for (const row of group.rows) {
        if (!row.isString) {
          issues.push(
            block(
              ctx.file,
              meta.rowKind === 'damage' ? 'EFF-07' : meta.rowKind === 'chance' ? 'EFF-15' : meta.rowKind === 'haste' ? 'EFF-16' : 'EFF-17',
              validationText("{p0} 的组 “{p1}” 含非字符串参数行", { p0: meta.value, p1: group.entity }),
              base,
            ),
          );
          continue;
        }
        if (meta.rowKind === 'damage') {
          const parsed = parseDamageRow(row.raw);
          if (!parsed.valid) {
            issues.push(
              block(
                ctx.file,
                'EFF-07',
                validationText("mob_damage_multiply 参数 “{p0}” 格式错误：{p1}", { p0: row.raw, p1: parsed.reason ?? '需要 2 段' }),
                base,
              ),
            );
            continue;
          }
          const multiplier = Number(parsed.multiplier);
          if (!Number.isFinite(multiplier)) {
            issues.push(block(ctx.file, 'EFF-07', validationText("倍率 “{p0}” 不是数字", { p0: parsed.multiplier }), base));
          } else if (multiplier <= 0) {
            issues.push(block(ctx.file, 'EFF-07', validationText("倍率必须 >0（当前 {p0}）", { p0: parsed.multiplier }), base));
          } else if (multiplier > 100) {
            issues.push(warn(ctx.file, 'EFF-09', validationText("倍率 {p0} >100，可能溢出", { p0: parsed.multiplier }), base));
          }
          addChanceIssue('EFF-08', 'mob_damage_multiply', parsed.chance);
          continue;
        }

        if (meta.rowKind === 'chance') {
          const parsed = parseChanceRow(row.raw);
          if (!parsed.valid) {
            issues.push(
              block(
                ctx.file,
                'EFF-15',
                validationText("ore_smelt 参数 “{p0}” 格式错误：{p1}；行只能有 1 段概率", {
                  p0: row.raw,
                  p1: parsed.reason ?? '需要 1 段',
                }),
                base,
              ),
            );
            continue;
          }
          addChanceIssue('EFF-15', 'ore_smelt', parsed.chance);
          continue;
        }

        if (meta.rowKind === 'haste') {
          const parsed = parseHasteRow(row.raw);
          if (!parsed.valid) {
            issues.push(
              block(
                ctx.file,
                'EFF-16',
                validationText("mining_haste 参数 “{p0}” 格式错误：{p1}", { p0: row.raw, p1: parsed.reason ?? '需要 3 段' }),
                base,
              ),
            );
            continue;
          }
          if (!/^\d+$/.test(parsed.amplifier)) {
            issues.push(block(ctx.file, 'EFF-16', validationText("mining_haste 倍率 “{p0}” 必须是非负整数", { p0: parsed.amplifier }), base));
          }
          if (!/^\d+$/.test(parsed.duration) || Number(parsed.duration) <= 0) {
            issues.push(block(ctx.file, 'EFF-16', validationText("mining_haste 时长 “{p0}” 必须是正整数 tick", { p0: parsed.duration }), base));
          }
          addChanceIssue('EFF-16', 'mining_haste', parsed.chance);
          continue;
        }

        const parsed = parseDurabilityRow(row.raw);
        if (!parsed.valid) {
          issues.push(
            block(
              ctx.file,
              'EFF-17',
              validationText("item_durability_save 参数 “{p0}” 格式错误：{p1}", { p0: row.raw, p1: parsed.reason ?? '需要 2 段' }),
              base,
            ),
          );
          continue;
        }
        const percentage = Number(parsed.percentage);
        if (!Number.isFinite(percentage)) {
          issues.push(block(ctx.file, 'EFF-17', validationText("item_durability_save 比例 “{p0}” 不是数字", { p0: parsed.percentage }), base));
        } else if (percentage < 0 || percentage > 1) {
          issues.push(
            block(ctx.file, 'EFF-17', validationText("item_durability_save 比例 {p0} 必须在 0..1", { p0: parsed.percentage }), {
              ...base,
              fixHint: validationText("1.0 表示完全免伤；0.2 表示保留 80% 耐久消耗"),
            }),
          );
        }
        addChanceIssue('EFF-17', 'item_durability_save', parsed.chance);
      }
    }
  }
  return issues;
}

// 兼容 focusDoc 中的结构类型（避免组件/校验重复定义）。
interface StringListLike {
  items: string[];
  kind: ConditionModel['kind'];
}
interface ActionModelLike {
  kind: ConditionModel['kind'];
  consoleCommands: StringListLike;
  enableExpertise: StringListLike;
  disableExpertise: StringListLike;
  setPriceGroup?: { raw: string; kind: ConditionModel['kind'] };
  hasNone: boolean;
  unknown: Array<{ key: string; preview: string }>;
}
interface EffectModelLike {
  kind: ConditionModel['kind'];
  byType?: Record<string, EffectGroupModel[]>;
  drops: EffectGroupModel[];
  damage: EffectGroupModel[];
  unknown: Array<{ key: string; preview: string }>;
}

function validateExpertise(
  node: ExpertiseModel,
  file: string,
  focusId: string,
  ownerIds: Set<string>,
  otherIds: Set<string>,
): FocusIssue[] {
  const issues: FocusIssue[] = [];
  const base = { nodeId: node.id, focusId, line: node.line };
  if (!node.validMap) {
    issues.push(
      block(file, 'FOC-10', validationText("expertise “{p0}” 必须是映射（当前为 {p1}）", { p0: node.id, p1: node.kind }), base),
    );
    return issues;
  }
  if (node.id.includes(':') || node.id.includes(';')) {
    issues.push(
      block(file, 'FOC-17', validationText("expertise ID “{p0}” 不能包含 “:” 或 “;”", { p0: node.id }), base),
    );
  }

  if (node.condition.kind === 'missing' || node.condition.kind === 'null') {
    issues.push(
      block(file, 'FOC-10', validationText("expertise “{p0}” 缺少 condition 段（必须存在，可为 {}）", { p0: node.id }), base),
    );
  } else if (node.condition.kind !== 'map') {
    issues.push(block(file, 'FOC-10', validationText("expertise “{p0}” 的 condition 必须是映射", { p0: node.id }), base));
  } else {
    issues.push(
      ...validateCondition(node.condition, { file, nodeId: node.id, focusId, ownerIds, otherIds }, validationText("节点 “{p0}” ", { p0: node.id })),
    );
  }

  if (node.legacyValueType !== undefined) {
    issues.push(
      warn(
        file,
        'FOC-12',
        validationText("expertise “{p0}” 使用了旧键 value-type（加载器忽略，回退 boolean）；请归一化为 value_type", { p0: node.id }),
        { ...base, fixHint: validationText("使用“归一化”按钮；导出会强制 value_type") },
      ),
    );
  }
  const hasValueType = node.valueTypeKey !== 'missing';
  if (hasValueType && !isFocusValueType(node.valueType)) {
    issues.push(
      error(file, 'FOC-11', validationText("expertise “{p0}” 的 value_type “{p1}” 非法（只允许 boolean/integer/double/string）", { p0: node.id, p1: node.valueType }), base),
    );
  }
  if (isFocusValueType(node.valueType)) {
    const errorMessage = focusDefaultValueError(node.valueType, node.defaultValue);
    if (errorMessage) {
      issues.push(
        block(file, node.valueType === 'string' ? 'FOC-14' : 'FOC-13', `expertise “${node.id}” ${errorMessage}`, base),
      );
    }
  }

  if (!node.label.trim()) {
    issues.push(warn(file, 'FOC-15', validationText("expertise “{p0}” 缺少 label，插件会显示 “No Label”", { p0: node.id }), base));
  }

  issues.push(...validateAction(node.action, { file, nodeId: node.id, focusId, ownerIds, otherIds }));
  issues.push(...validateEffect(node.effect, { file, nodeId: node.id, focusId, ownerIds, otherIds }));

  const hasAction = node.action.kind === 'map' && (node.action.consoleCommands.kind !== 'missing' || node.action.enableExpertise.kind !== 'missing' || node.action.disableExpertise.kind !== 'missing' || Boolean(node.action.setPriceGroup) || node.action.hasNone || node.action.unknown.length > 0);
  const hasEffect =
    node.effect.kind === 'map' &&
    (Object.values(node.effect.byType ?? {}).some((groups) => groups.length > 0) ||
      node.effect.drops.length > 0 ||
      node.effect.damage.length > 0 ||
      node.effect.unknown.length > 0);
  if (!hasAction && !hasEffect) {
    issues.push(info(file, 'FOC-16', validationText("expertise “{p0}” 没有 action/effect（纯前置节点）", { p0: node.id }), base));
  }
  if (node.extras.length > 0) {
    issues.push(
      info(
        file,
        'GEN-03',
        validationText("expertise “{p0}” 含 {p1} 个未识别字段（{p2}），将原样保留", { p0: node.id, p1: node.extras.length, p2: node.extras.map((extra) => extra.key).join(', ') }),
        base,
      ),
    );
  }
  return issues;
}

export interface FocusValidationOptions {
  otherIds?: Set<string>;
}

/** 校验一个 focus 文件；otherIds 用于区分“跨 focus 引用”。 */
export function validateFocusModel(
  model: FocusFileModel,
  options: FocusValidationOptions = {},
): FocusIssue[] {
  const issues: FocusIssue[] = [];
  if (model.syntaxError) return issues;
  const file = model.path;
  const focusId = model.focusId;
  const base = { focusId };

  if (!model.fixed) {
    issues.push(
      block(
        file,
        'FOC-01',
        validationText("只能加载 focus/none.yml、focus/mob.yml 与 focus/ore.yml；该文件不会被插件读取，不能导出到 focus/"),
        { ...base, fixHint: validationText("仅作为参考文件查看/迁移") },
      ),
    );
  }
  if (model.kind !== 'map') {
    issues.push(block(file, 'FOC-02', validationText("focus 文件顶层必须是映射"), base));
    return issues;
  }
  if (model.idField) {
    issues.push(info(file, 'FOC-03', validationText("文件里的 id 字段不会被读取；focus ID 以文件名（none/mob/ore）为准"), base));
  }
  if (model.condition.kind !== 'missing' && model.condition.kind !== 'null') {
    if (model.condition.kind !== 'map') {
      issues.push(block(file, 'FOC-05', validationText("focus 级 condition 必须是映射"), base));
    } else {
      const ownerIds = new Set(model.expertises.map((node) => node.id));
      issues.push(
        ...validateCondition(
          model.condition,
          { file, focusId, ownerIds, otherIds: options.otherIds ?? new Set() },
          validationText("focus 级条件"),
        ),
      );
    }
  }
  if (model.expertiseKind === 'missing' || model.expertiseKind === 'null') {
    issues.push(block(file, 'FOC-02', validationText("缺少必填 expertise 段（启动 NPE）"), base));
  } else if (model.expertiseKind !== 'map') {
    issues.push(block(file, 'FOC-02', validationText("expertise 段必须是映射"), base));
  } else if (model.expertises.length === 0) {
    issues.push(warn(file, 'FOC-02', validationText("expertise 段为空，没有可解锁节点"), base));
  }

  const ownerIds = new Set(model.expertises.map((node) => node.id));
  for (const node of model.expertises) {
    issues.push(
      ...validateExpertise(node, file, focusId, ownerIds, options.otherIds ?? new Set()),
    );
  }

  if (model.extras.length > 0) {
    issues.push(
      info(
        file,
        'GEN-03',
        validationText("focus 文件含 {p0} 个未识别字段（{p1}），将原样保留", { p0: model.extras.length, p1: model.extras.map((extra) => extra.key).join(', ') }),
        base,
      ),
    );
  }
  return issues;
}

/** Boolean.parseBoolean 对非 true 的值一律返回 false；因此布尔默认值必须显式写 true/false。 */
export function isBooleanDefaultLiteral(value: string): boolean {
  return /^(true|false)$/i.test(value);
}

/** focus 的 default.value 类型校验：boolean 新增严格白名单，其余类型保持原有规则。 */
export function focusDefaultValueError(type: string, value: string): string | null {
  if (type === 'boolean' && !isBooleanDefaultLiteral(value)) {
    return validationText("boolean 的 default.value 只接受 true/false（当前 “{p0}”）；Boolean.parseBoolean 会把其他值静默解析为 false", { p0: value });
  }
  return defaultValueError(type, value);
}

export function validateFocusText(
  text: string,
  path = 'focus/mob.yml',
  otherIds: Set<string> = new Set(),
): FocusIssue[] {
  const parsed = parseFocusFile(path, text);
  return validateFocusModel(parsed.model, { otherIds });
}

export function ensureFocusValidatorRegistered(): void {
  if (registered) return;
  registered = true;
  registerValidator((context) => {
    const focusFiles: Array<{ file: ProjectFile; parsed: ParsedYaml; model: FocusFileModel }> = [];
    for (const file of context.files) {
      if (file.kind !== 'focus') continue;
      const parsed = context.parsed[file.path];
      if (!parsed || !parsed.ok) continue;
      focusFiles.push({
        file,
        parsed,
        model: buildFocusModel(parsed.doc ?? null, parsed.normalizedText, file.path, parsed),
      });
    }
    if (focusFiles.length === 0) return [];

    // 收集全部节点 ID（用于跨 focus 引用与重名检测）。
    const idsByFile = new Map<string, Set<string>>();
    const allIds = new Set<string>();
    const fixedModels = focusFiles.filter((entry) => entry.model.fixed);
    for (const entry of focusFiles) {
      const ids = new Set(entry.model.expertises.map((node) => node.id));
      idsByFile.set(entry.file.path, ids);
      for (const id of ids) allIds.add(id);
    }
    const issues: FocusIssue[] = [];

    // FOC-18：两个 focus 文件之间的同名 expertise ID 会全局互相覆盖。
    if (fixedModels.length > 1) {
      const seen = new Map<string, string>();
      for (const entry of fixedModels) {
        for (const node of entry.model.expertises) {
          const previous = seen.get(node.id);
          if (previous && previous !== entry.file.path) {
            issues.push(
              block(
                entry.file.path,
                'FOC-18',
                validationText("expertise ID “{p0}” 同时存在于 {p1} 与 {p2}；全局以 id 为 key 会互相覆盖", { p0: node.id, p1: previous, p2: entry.file.path }),
                { focusId: entry.model.focusId, nodeId: node.id },
              ),
            );
          } else {
            seen.set(node.id, entry.file.path);
          }
        }
      }
    }

    for (const entry of focusFiles) {
      const other = new Set<string>();
      for (const [path, ids] of idsByFile) {
        if (path === entry.file.path) continue;
        for (const id of ids) other.add(id);
      }
      issues.push(...validateFocusModel(entry.model, { otherIds: other }));
    }
    return issues;
  });
}

let registered = false;

/** 测试/工具：返回 focus 文件模型，便于树视图与引用分析。 */
export function analyzeFocusFiles(files: ProjectFile[]): ParsedFocusFile[] {
  return files
    .filter((file) => file.kind === 'focus')
    .map((file) => parseFocusFile(file.path, file.text));
}
