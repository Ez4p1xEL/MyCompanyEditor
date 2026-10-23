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
  LOG_IDS,
  defaultValueError,
  isAllOrEntity,
  isAllOrMaterial,
  isFocusValueType,
  parseCompanyLogRow,
  parseDamageRow,
  parseDropRow,
  splitOrGroup,
} from './focusConstants';
import { ENTITY_TYPE_NAMES } from './data/minecraftEnums';

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
    return block(ctx.file, code, `${label}引用了空专精 ID`, { nodeId: ctx.nodeId, line });
  }
  if (ctx.ownerIds.has(trimmed)) {
    if (ctx.nodeId && trimmed === ctx.nodeId) {
      return error(
        ctx.file,
        'FOC-CYCLE',
        `${label}引用了节点自身 “${trimmed}”，该节点永远无法解锁`,
        { nodeId: ctx.nodeId, line },
      );
    }
    return null;
  }
  if (ctx.otherIds.has(trimmed)) {
    return error(
      ctx.file,
      'X-06',
      `${label}引用了另一个 focus 文件的专精 “${trimmed}”；公司同时只有一个 focus，条件永远不满足`,
      { nodeId: ctx.nodeId, line, fixHint: '改为当前 focus 内的节点 ID' },
    );
  }
  return error(ctx.file, code, `${label}引用的专精 “${trimmed}” 不存在`, {
    nodeId: ctx.nodeId,
    line,
    fixHint: '从当前 focus 的节点列表选择',
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
      warn(ctx.file, 'CON-09', `${ownerLabel}含未知条件键 “${extra.key}”，插件会静默忽略`, {
        ...base,
        fixHint: '删除或改成 company_money/expertise/expertises/company_log',
      }),
    );
  }

  if (condition.companyMoney) {
    const raw = condition.companyMoney.raw.trim();
    const numeric = /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw);
    if (!numeric) {
      issues.push(
        block(ctx.file, 'CON-01', `${ownerLabel}的 company_money “${raw}” 不是数字，启动会失败`, {
          ...base,
          fixHint: '填写 ≥0 的裸数字',
        }),
      );
    } else if (Number(raw) < 0) {
      issues.push(
        block(ctx.file, 'CON-01', `${ownerLabel}的 company_money 不能为负（当前 ${raw}）`, {
          ...base,
          fixHint: '公司资金条件必须 ≥0',
        }),
      );
    }
  }

  if (condition.expertise) {
    if (condition.expertise.kind !== 'string') {
      issues.push(
        block(ctx.file, 'CON-02', `${ownerLabel}的 expertise 必须是字符串节点 ID`, base),
      );
    } else {
      const ref = refIssue(ctx, condition.expertise.raw, 'CON-02', `${ownerLabel}的 expertise `);
      if (ref) issues.push(ref);
    }
  }

  if (condition.expertises) {
    if (condition.expertises.kind !== 'seq') {
      issues.push(
        block(
          ctx.file,
          'CON-03',
          `${ownerLabel}的 expertises 必须是字符串列表；标量会在强转时 ClassCastException`,
          base,
        ),
      );
    } else {
      condition.expertises.items.forEach((group) => {
        const ids = splitOrGroup(group);
        if (ids.length === 0) {
          issues.push(
            block(ctx.file, 'CON-04', `${ownerLabel}的 expertises 有空项（行内 OR 组不能为空）`, base),
          );
          return;
        }
        for (const id of ids) {
          const ref = refIssue(ctx, id, 'CON-04', `${ownerLabel}的 expertises `);
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
          `${ownerLabel}的 company_log 必须是字符串列表；标量会在强转时 ClassCastException`,
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
              `${ownerLabel}的 company_log “${row}” 格式错误：${parsed.reason ?? '需要 3 段'}`,
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
              `${ownerLabel}的 company_log 使用了未知 logId “${parsed.logId}”，计数永远为 0`,
              base,
            ),
          );
        }
        const entity = parsed.entity;
        if (!ENTITY_TYPE_NAMES.has(entity)) {
          issues.push(
            block(
              ctx.file,
              'CON-07',
              `${ownerLabel}的 company_log 实体 “${entity}” 必须是大写、合法的 EntityType 枚举名；否则菜单渲染 NPE/IAE`,
              { ...base, fixHint: '例如 ZOMBIE、CREEPER（不能用小写）' },
            ),
          );
        }
        if (!/^[+-]?\d+$/.test(parsed.threshold)) {
          issues.push(
            error(ctx.file, 'CON-08', `${ownerLabel}的 company_log 数值 “${parsed.threshold}” 不是整数`, base),
          );
        } else if (Number(parsed.threshold) < 0) {
          issues.push(
            warn(ctx.file, 'CON-08', `${ownerLabel}的 company_log 数值为负，条件会恒真`, base),
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
      block(ctx.file, 'EFF-11', 'action 必须是映射（map），标量会在 getConfigurationSection 处 NPE', base),
    );
    return issues;
  }
  if (action.kind === 'missing' || action.kind === 'null') return issues;
  if (action.hasNone) {
    issues.push(info(ctx.file, 'ACT-08', 'action.none 在枚举中存在但没有执行分支，等于无效果', base));
  }
  for (const extra of action.unknown) {
    issues.push(
      warn(ctx.file, 'ACT-01', `未知 action 键 “${extra.key}”（大小写不敏感匹配也失败），插件会跳过`, {
        ...base,
        fixHint: '只允许 console_command/enable_expertise/disable_expertise/set_price_group',
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
          `${field.key} 必须是字符串列表；getStringList 对标量返回空列表，功能静默失效`,
          base,
        ),
      );
      continue;
    }
    field.model.items.forEach((item) => {
      if (field.key === 'console_command') {
        if (item.startsWith('/')) {
          issues.push(
            warn(ctx.file, 'ACT-05', `console_command 不应有前导 “/”：${item}`, {
              ...base,
              fixHint: `去掉斜杠：${item.replace(/^\/+/, '')}`,
            }),
          );
        }
        if (item.includes('%player%')) {
          issues.push(
            info(
              ctx.file,
              'ACT-06',
              '命令含 %player%：会对公司所有员工分别执行一次',
              base,
            ),
          );
        }
      } else if (field.checkRefs) {
        const ref = refIssue(ctx, item, 'ACT-03', `${field.key} `);
        if (ref) issues.push(ref);
        if (field.key === 'disable_expertise' && ctx.nodeId && item.trim() === ctx.nodeId) {
          issues.push(
            warn(ctx.file, 'ACT-07', `disable_expertise 指向节点自身，节点会从常规菜单隐藏`, base),
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
          'set_price_group 必须是非空标量字符串（列表/映射会 toString 成无效 group）',
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
      block(ctx.file, 'EFF-11', 'effect 必须是映射（map），标量会在 getConfigurationSection 处 NPE', base),
    );
    return issues;
  }
  if (effect.kind === 'missing' || effect.kind === 'null') return issues;

  for (const extra of effect.unknown) {
    issues.push(
      warn(
        ctx.file,
        'EFF-01',
        `未知/大小写不正确的 effect 键 “${extra.key}”；EffectType.getById 大小写敏感，插件会跳过`,
        { ...base, fixHint: '只允许小写 mob_drops_add / mob_damage_multiply' },
      ),
    );
  }

  const checkGroups = (groups: EffectGroupModel[], key: 'drops' | 'damage') => {
    for (const group of groups) {
      if (group.valueKind !== 'seq') {
        issues.push(
          block(
            ctx.file,
            'EFF-11',
            `${key === 'drops' ? 'mob_drops_add' : 'mob_damage_multiply'} 的实体 “${group.entity}” 值必须是列表`,
            base,
          ),
        );
        continue;
      }
      if (!isAllOrEntity(group.entity)) {
        issues.push(
          block(
            ctx.file,
            'EFF-02',
            `effect 实体 key “${group.entity}” 必须是 ALL 或合法 EntityType（非法值启动即 IAE）`,
            { ...base, fixHint: '例如 ALL、ZOMBIE、CREEPER' },
          ),
        );
      }
      for (const row of group.rows) {
        if (!row.isString) {
          issues.push(
            block(
              ctx.file,
              'EFF-03',
              `${key === 'drops' ? 'mob_drops_add' : 'mob_damage_multiply'} 的实体 “${group.entity}” 含非字符串参数行`,
              base,
            ),
          );
          continue;
        }
        if (key === 'drops') {
          const parsed = parseDropRow(row.raw);
          if (!parsed.valid) {
            issues.push(
              block(
                ctx.file,
                'EFF-03',
                `mob_drops_add 参数 “${row.raw}” 格式错误：${parsed.reason ?? '需要 3 段'}`,
                base,
              ),
            );
            continue;
          }
          if (!isAllOrMaterial(parsed.item)) {
            issues.push(
              block(
                ctx.file,
                'EFF-04',
                `mob_drops_add 物品 “${parsed.item}” 非法：Material.getMaterial 返回 null 后会退化成对所有掉落生效`,
                { ...base, fixHint: '使用 Material 枚举名（不能带 minecraft: 前缀）或 ALL' },
              ),
            );
          }
          if (!/^-?\d+$/.test(parsed.amount)) {
            issues.push(
              block(ctx.file, 'EFF-05', `mob_drops_add 数量 “${parsed.amount}” 必须是整数`, base),
            );
          } else if (Number(parsed.amount) < 0) {
            issues.push(block(ctx.file, 'EFF-05', 'mob_drops_add 数量不能为负', base));
          } else if (parsed.sign === '*' && Number(parsed.amount) === 0) {
            issues.push(
              warn(ctx.file, 'EFF-06', 'mob_drops_add 使用 *0，命中后掉落数量会被清零', base),
            );
          }
          const chance = Number(parsed.chance);
          if (!Number.isFinite(chance)) {
            issues.push(block(ctx.file, 'EFF-03', `概率 “${parsed.chance}” 不是数字`, base));
          } else if (chance < 0 || chance > 100) {
            issues.push(
              warn(
                ctx.file,
                'EFF-08',
                `概率 ${parsed.chance} 不在 0..100；≤0 永不触发，≥100 必触发（编辑器阻止导出）`,
                { ...base, blocking: true, fixHint: '概率必须在 0..100' },
              ),
            );
          } else if ((parsed.chance.split('.')[1] ?? '').length > 2) {
            issues.push(
              info(ctx.file, 'EFF-10', `概率 ${parsed.chance} 超过两位小数，判定精度为 0.01%`, base),
            );
          }
        } else {
          const parsed = parseDamageRow(row.raw);
          if (!parsed.valid) {
            issues.push(
              block(
                ctx.file,
                'EFF-07',
                `mob_damage_multiply 参数 “${row.raw}” 格式错误：${parsed.reason ?? '需要 2 段'}`,
                base,
              ),
            );
            continue;
          }
          const multiplier = Number(parsed.multiplier);
          if (!Number.isFinite(multiplier)) {
            issues.push(block(ctx.file, 'EFF-07', `倍率 “${parsed.multiplier}” 不是数字`, base));
          } else if (multiplier <= 0) {
            issues.push(block(ctx.file, 'EFF-07', `倍率必须 >0（当前 ${parsed.multiplier}）`, base));
          } else if (multiplier > 100) {
            issues.push(warn(ctx.file, 'EFF-09', `倍率 ${parsed.multiplier} >100，可能溢出`, base));
          }
          const chance = Number(parsed.chance);
          if (!Number.isFinite(chance)) {
            issues.push(block(ctx.file, 'EFF-07', `概率 “${parsed.chance}” 不是数字`, base));
          } else if (chance < 0 || chance > 100) {
            issues.push(
              warn(ctx.file, 'EFF-08', `概率 ${parsed.chance} 不在 0..100（编辑器阻止导出）`, {
                ...base,
                blocking: true,
                fixHint: '概率必须在 0..100',
              }),
            );
          }
        }
      }
    }
  };

  checkGroups(effect.drops, 'drops');
  checkGroups(effect.damage, 'damage');
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
      block(file, 'FOC-10', `expertise “${node.id}” 必须是映射（当前为 ${node.kind}）`, base),
    );
    return issues;
  }
  if (node.id.includes(':') || node.id.includes(';')) {
    issues.push(
      block(file, 'FOC-17', `expertise ID “${node.id}” 不能包含 “:” 或 “;”`, base),
    );
  }

  if (node.condition.kind === 'missing' || node.condition.kind === 'null') {
    issues.push(
      block(file, 'FOC-10', `expertise “${node.id}” 缺少 condition 段（必须存在，可为 {}）`, base),
    );
  } else if (node.condition.kind !== 'map') {
    issues.push(block(file, 'FOC-10', `expertise “${node.id}” 的 condition 必须是映射`, base));
  } else {
    issues.push(
      ...validateCondition(node.condition, { file, nodeId: node.id, focusId, ownerIds, otherIds }, `节点 “${node.id}” `),
    );
  }

  if (node.legacyValueType !== undefined) {
    issues.push(
      warn(
        file,
        'FOC-12',
        `expertise “${node.id}” 使用了旧键 value-type（加载器忽略，回退 boolean）；请归一化为 value_type`,
        { ...base, fixHint: '使用“归一化”按钮；导出会强制 value_type' },
      ),
    );
  }
  const hasValueType = node.valueTypeKey !== 'missing';
  if (hasValueType && !isFocusValueType(node.valueType)) {
    issues.push(
      error(file, 'FOC-11', `expertise “${node.id}” 的 value_type “${node.valueType}” 非法（只允许 boolean/integer/double/string）`, base),
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
    issues.push(warn(file, 'FOC-15', `expertise “${node.id}” 缺少 label，插件会显示 “No Label”`, base));
  }

  issues.push(...validateAction(node.action, { file, nodeId: node.id, focusId, ownerIds, otherIds }));
  issues.push(...validateEffect(node.effect, { file, nodeId: node.id, focusId, ownerIds, otherIds }));

  const hasAction = node.action.kind === 'map' && (node.action.consoleCommands.kind !== 'missing' || node.action.enableExpertise.kind !== 'missing' || node.action.disableExpertise.kind !== 'missing' || Boolean(node.action.setPriceGroup) || node.action.hasNone || node.action.unknown.length > 0);
  const hasEffect = node.effect.kind === 'map' && (node.effect.drops.length > 0 || node.effect.damage.length > 0 || node.effect.unknown.length > 0);
  if (!hasAction && !hasEffect) {
    issues.push(info(file, 'FOC-16', `expertise “${node.id}” 没有 action/effect（纯前置节点）`, base));
  }
  if (node.extras.length > 0) {
    issues.push(
      info(
        file,
        'GEN-03',
        `expertise “${node.id}” 含 ${node.extras.length} 个未识别字段（${node.extras.map((extra) => extra.key).join(', ')}），将原样保留`,
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
        '只能加载 focus/none.yml 与 focus/mob.yml；该文件不会被插件读取，不能导出到 focus/',
        { ...base, fixHint: '仅作为参考文件查看/迁移' },
      ),
    );
  }
  if (model.kind !== 'map') {
    issues.push(block(file, 'FOC-02', 'focus 文件顶层必须是映射', base));
    return issues;
  }
  if (model.idField) {
    issues.push(info(file, 'FOC-03', '文件里的 id 字段不会被读取；focus ID 以文件名（none/mob）为准', base));
  }
  if (model.condition.kind !== 'missing' && model.condition.kind !== 'null') {
    if (model.condition.kind !== 'map') {
      issues.push(block(file, 'FOC-05', 'focus 级 condition 必须是映射', base));
    } else {
      const ownerIds = new Set(model.expertises.map((node) => node.id));
      issues.push(
        ...validateCondition(
          model.condition,
          { file, focusId, ownerIds, otherIds: options.otherIds ?? new Set() },
          'focus 级条件',
        ),
      );
    }
  }
  if (model.expertiseKind === 'missing' || model.expertiseKind === 'null') {
    issues.push(block(file, 'FOC-02', '缺少必填 expertise 段（启动 NPE）', base));
  } else if (model.expertiseKind !== 'map') {
    issues.push(block(file, 'FOC-02', 'expertise 段必须是映射', base));
  } else if (model.expertises.length === 0) {
    issues.push(warn(file, 'FOC-02', 'expertise 段为空，没有可解锁节点', base));
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
        `focus 文件含 ${model.extras.length} 个未识别字段（${model.extras.map((extra) => extra.key).join(', ')}），将原样保留`,
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
    return `boolean 的 default.value 只接受 true/false（当前 “${value}”）；Boolean.parseBoolean 会把其他值静默解析为 false`;
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
                `expertise ID “${node.id}” 同时存在于 ${previous} 与 ${entry.file.path}；全局以 id 为 key 会互相覆盖`,
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
