import { validationText } from '../../core/validation';
import type { ProjectFile, ValidationIssue } from '../../core/types';
import { registerValidator } from '../../core/validation';
import { buildMenuModel, itemSlots, parseMenuFile, type MenuFileModel, type MenuItemModel } from './menuDoc';
import {
  checkMaterial,
  isCustomMaterialItem,
  isValidMenuSize,
  menuMeta,
  usesUppercasePlayerPlaceholder,
} from './menuConstants';

export interface MenuIssue extends ValidationIssue {
  itemId?: string;
  slot?: number;
  menuId?: string;
}

function issue(
  severity: ValidationIssue['severity'],
  file: string,
  code: string,
  message: string,
  extra: Partial<MenuIssue> & { fixHint?: string; blocking?: boolean } = {},
): MenuIssue {
  return {
    severity,
    file,
    code,
    message,
    path: extra.path,
    line: extra.line,
    blocking: extra.blocking,
    fixHint: extra.fixHint,
    itemId: extra.itemId,
    slot: extra.slot,
    menuId: extra.menuId,
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

function generatedSlots(start: number, count: number): number[] {
  const column = start % 9;
  const capacity = 9 - 2 * column;
  if (capacity <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(start / 9) + Math.floor(index / capacity);
    return row * 9 + column + (index % capacity);
  });
}

function itemLabel(item: MenuItemModel): string {
  return validationText("物品 “{p0}”", { p0: item.id });
}

function validateItem(
  item: MenuItemModel,
  model: MenuFileModel,
  size: number | undefined,
): MenuIssue[] {
  const issues: MenuIssue[] = [];
  const file = model.path;
  const base = { itemId: item.id, menuId: model.menuId, line: item.line };
  if (!item.validMap) {
    issues.push(block(file, 'MEN-03', validationText("{p0} 必须是映射（当前为 {p1}）", { p0: itemLabel(item), p1: item.kind }), base));
    return issues;
  }
  if (item.extras.some((extra) => extra.key === 'display_name' || extra.key === 'lore')) {
    issues.push(
      warn(
        file,
        'LANG-01',
        validationText("{p0} 含 display_name/lore；插件从 lang 文件读取文本并忽略 menu 文件里的这些键", { p0: itemLabel(item) }),
        { ...base, fixHint: validationText("在“语言片段”面板编辑，不要写入 menu/*.yml") },
      ),
    );
  }
  if (!item.material) {
    issues.push(block(file, 'MEN-04', validationText("{p0} 缺少 material（MenuItem 构造 NPE）", { p0: itemLabel(item) }), base));
  } else {
    const check = checkMaterial(item.material);
    if (!check.valid) {
      if (item.id === 'default') {
        issues.push(warn(file, 'MEN-17', validationText("default.material 非法：{p0}", { p0: check.reason ?? '' }), base));
      } else {
        issues.push(
          error(file, 'MEN-05', validationText("{p0} 的 material 非法：{p1}", { p0: itemLabel(item), p1: check.reason ?? '' }), {
            ...base,
            fixHint: validationText("使用 Bukkit Material 枚举名、minecraft: 命名空间或 PLAYER_HEAD;owner"),
          }),
        );
      }
    }
    if (/^player_head;/.test(item.material)) {
      issues.push(
        error(
          file,
          'MEN-06',
          validationText("{p0} 的 PLAYER_HEAD 前缀必须全大写（小写不会被识别，材质会变 AIR）", { p0: itemLabel(item) }),
          base,
        ),
      );
    }
    if (model.menuId === 'main' && usesUppercasePlayerPlaceholder(item.material)) {
      issues.push(
        warn(
          file,
          'MEN-07',
          validationText("static 主菜单里的 %PLAYER% 不会被替换（CompanyMenu 只替换小写 %player%）"),
          { ...base, fixHint: validationText("改用 PLAYER_HEAD;%player% 或直接 PLAYER_HEAD") },
        ),
      );
    }
  }

  const hasSlotField = Boolean(item.slot);
  const hasSlotsField = Boolean(item.slots);
  if (item.slot && item.slots) {
    issues.push(warn(file, 'MEN-11', validationText("{p0} 同时有 slot 与 slots；slots 会被忽略", { p0: itemLabel(item) }), base));
  }
  if (item.slot && item.slot.kind === 'string') {
    issues.push(
      error(
        file,
        'MEN-12',
        validationText("{p0} 的 slot 是带引号的字符串；Bukkit getInt 返回 -1，物品不会渲染", { p0: itemLabel(item) }),
        { ...base, fixHint: validationText("slot 必须是裸整数") },
      ),
    );
  }
  if (item.slots && item.slots.kind !== 'seq') {
    issues.push(block(file, 'MEN-08', validationText("{p0} 的 slots 必须是整数列表", { p0: itemLabel(item) }), base));
  }
  const customAllowed = item.id === 'default' || isCustomMaterialItem(item.id);
  if (!hasSlotField && !hasSlotsField && !customAllowed) {
    issues.push(
      block(
        file,
        'MEN-08',
        validationText("{p0} 既没有 slot 也没有 slots，不会渲染；若它是列表模板会导致菜单打不开", { p0: itemLabel(item) }),
        { ...base, fixHint: validationText("用槽位选择器分配槽位") },
      ),
    );
  }
  if (
    item.slot &&
    item.slot.kind === 'number' &&
    item.slot.number !== undefined &&
    item.slot.number < 0 &&
    !hasSlotsField
  ) {
    issues.push(
      block(file, 'MEN-08', validationText("{p0} 的 slot 为负数且没有 slots 回退，物品不会渲染", { p0: itemLabel(item) }), base),
    );
  }
  if (item.slots?.kind === 'seq') {
    for (const entry of item.slots.items) {
      if (entry.kind !== 'number' && entry.integerString === undefined) {
        issues.push(
          warn(file, 'MEN-13', validationText("{p0} 的 slots 含非整数项 “{p1}”，会被 getIntegerList 跳过", { p0: itemLabel(item), p1: entry.raw }), base),
        );
      }
    }
  }

  if (size !== undefined) {
    const slots = itemSlots(item);
    for (const slot of slots) {
      if (slot < 0 || slot >= size) {
        issues.push(
          block(file, 'MEN-09', validationText("{p0} 的槽位 {p1} 越界（size={p2}，合法 0..{p3}）", { p0: itemLabel(item), p1: slot, p2: size, p3: size - 1 }), {
            ...base,
            slot,
          }),
        );
      }
    }
  }
  return issues;
}

function validateOptions(model: MenuFileModel): MenuIssue[] {
  const issues: MenuIssue[] = [];
  const file = model.path;
  if (model.optionsKind !== 'missing' && model.optionsKind !== 'map' && model.optionsKind !== 'null') {
    issues.push(block(file, 'MEN-18', validationText("options 必须是映射"), { menuId: model.menuId }));
    return issues;
  }
  for (const option of model.options) {
    if (option.kind === 'null') {
      issues.push(
        block(
          file,
          'MEN-18',
          validationText("options.{p0} 是显式空值：getString 为 null，parseInt 后 equalsIgnoreCase NPE，加载失败", { p0: option.key }),
          { menuId: model.menuId },
        ),
      );
    } else if (option.kind === 'map' || option.kind === 'seq') {
      issues.push(
        warn(
          file,
          'MEN-18',
          validationText("options.{p0} 是 {p1}；getString 会 toString 成字符串，分页参数静默失效", { p0: option.key, p1: option.kind }),
          { menuId: model.menuId },
        ),
      );
    }
  }
  return issues;
}

function pageCount(model: MenuFileModel): number {
  const meta = menuMeta(model.menuId);
  if (!meta?.pageOption) return 0;
  const option = model.options.find((entry) => entry.key === meta.pageOption!.key);
  if (!option) return meta.pageOption.defaultValue;
  if (option.kind === 'number') return Number(option.raw);
  if (option.inferred === 'integer') return Number(option.raw);
  return Number.NaN;
}

function validateListMenu(model: MenuFileModel): MenuIssue[] {
  const meta = menuMeta(model.menuId);
  if (!meta) return [];
  const file = model.path;
  const issues: MenuIssue[] = [];
  const base = { menuId: model.menuId };
  const itemsById = new Map(model.items.map((item) => [item.id, item]));
  const templates = meta.templates
    .map((id) => itemsById.get(id))
    .filter((item): item is MenuItemModel => Boolean(item));

  if (meta.templates.length > 0) {
    for (const templateId of meta.templates) {
      if (!itemsById.has(templateId)) {
        issues.push(
          block(
            file,
            templateId === 'area_rent' ? 'LST-02' : 'LST-01',
            validationText("缺少列表模板物品 “{p0}”；打开该菜单会 NPE", { p0: templateId }),
            { ...base, itemId: templateId },
          ),
        );
      }
    }
    for (const template of templates) {
      const slots = itemSlots(template);
      if (slots.length === 0) {
        issues.push(
          block(file, 'LST-01', validationText("列表模板 “{p0}” 必须至少有 1 个槽位", { p0: template.id }), {
            ...base,
            itemId: template.id,
          }),
        );
        continue;
      }
      const start = slots[0]!;
      if (start % 9 > 4) {
        issues.push(
          block(
            file,
            'LST-04',
            validationText("模板 “{p0}” 起点 {p1} 的列号 {p2} > 4，分页算法会越界", { p0: template.id, p1: start, p2: start % 9 }),
            { ...base, itemId: template.id, slot: start, fixHint: validationText("改成 20（第 3 行第 3 列）") },
          ),
        );
      }
      if (template.slots?.kind === 'seq' && template.slots.items.length > 1) {
        issues.push(
          warn(file, 'LST-07', validationText("模板 “{p0}” 配置了多个槽位，只有第一个会生效", { p0: template.id }), {
            ...base,
            itemId: template.id,
          }),
        );
      }
    }
  }

  if (meta.requiresConfirm) {
    for (const required of ['confirm', 'cancel']) {
      if (!itemsById.has(required)) {
        issues.push(
          block(file, 'LST-06', validationText("confirmation 菜单必须同时有 “confirm” 与 “cancel” 物品（缺 {p0} 会 NPE）", { p0: required }), {
            ...base,
            itemId: required,
          }),
        );
      }
    }
  }

  if (meta.pageOption) {
    const perPage = pageCount(model);
    if (Number.isNaN(perPage) || perPage < 1) {
      issues.push(
        error(file, 'PAG-01', validationText("{p0} 必须是 ≥1 的整数（当前 {p1}）", { p0: meta.pageOption.key, p1: Number.isNaN(perPage) ? '非数字' : perPage }), {
          ...base,
        }),
      );
    } else if (templates[0] && model.sizeNumber !== undefined) {
      const start = itemSlots(templates[0])[0];
      if (start !== undefined && start % 9 <= 4) {
        const generated = generatedSlots(start, perPage);
        const fixedSlots = new Map<number, string>();
        for (const item of model.items) {
          if (item.id === 'default' || meta.templates.includes(item.id)) continue;
          for (const slot of itemSlots(item)) fixedSlots.set(slot, item.id);
        }
        for (const slot of generated) {
          if (slot >= model.sizeNumber) {
            issues.push(
              block(
                file,
                'LST-05',
                validationText("分页生成槽位 {p0} 越界（size={p1}）", { p0: slot, p1: model.sizeNumber }),
                { ...base, slot },
              ),
            );
            continue;
          }
          const occupant = fixedSlots.get(slot);
          if (!occupant) continue;
          if (occupant === 'previous_page' || occupant === 'next_page') {
            issues.push(
              warn(
                file,
                'LST-05',
                validationText("分页生成槽位 {p0} 与 “{p1}” 重叠；仅在存在上一页/下一页的页面冲突", { p0: slot, p1: occupant }),
                { ...base, slot, itemId: occupant },
              ),
            );
          } else {
            issues.push(
              block(
                file,
                'LST-05',
                validationText("分页生成槽位 {p0} 与固定物品 “{p1}” 重叠（覆盖顺序不可预测）", { p0: slot, p1: occupant }),
                { ...base, slot, itemId: occupant },
              ),
            );
          }
        }
      }
    }
  }

  if (meta.templates.length > 0) {
    if (!itemsById.has('previous_page')) {
      issues.push(warn(file, 'LST-08', validationText("缺少 previous_page：分页功能消失（不崩）"), base));
    }
    if (!itemsById.has('next_page')) {
      issues.push(warn(file, 'LST-08', validationText("缺少 next_page：分页功能消失（不崩）"), base));
    }
    if (!itemsById.has('back_to_main')) {
      issues.push(info(file, 'LST-09', validationText("缺少 back_to_main：用户可能无法返回主菜单"), base));
    }
  }
  return issues;
}

export function validateMenuModel(model: MenuFileModel): MenuIssue[] {
  const issues: MenuIssue[] = [];
  if (model.syntaxError) return issues;
  const file = model.path;
  const base = { menuId: model.menuId };
  if (!model.known) {
    issues.push(
      block(file, 'MEN-01', validationText("菜单 id “{p0}” 不在固定 18 个列表中，插件不会加载该文件", { p0: model.menuId }), base),
    );
  }
  if (model.sizeKind === 'missing') {
    issues.push(block(file, 'MEN-02', validationText("缺少 size（getInt 得 0，API 不保证可创建）"), base));
  } else if (model.sizeKind !== 'number' || model.sizeNumber === undefined) {
    issues.push(block(file, 'MEN-02', validationText("size 必须是裸整数（当前 “{p0}”）", { p0: model.size }), base));
  } else if (!isValidMenuSize(model.sizeNumber)) {
    issues.push(
      block(file, 'MEN-02', validationText("size 必须在 9..54 且为 9 的倍数（当前 {p0}）", { p0: model.sizeNumber }), base),
    );
  }
  if (model.itemsKind === 'missing') {
    issues.push(block(file, 'MEN-03', validationText("缺少 items 段（MenuUtil 会 NPE）"), base));
  } else if (model.itemsKind !== 'map') {
    issues.push(block(file, 'MEN-03', validationText("items 必须是映射"), base));
  }

  const size = model.sizeNumber;
  for (const item of model.items) {
    issues.push(...validateItem(item, model, size));
  }

  // 同槽位冲突（default 不参与渲染）。
  if (size !== undefined) {
    const occupied = new Map<number, string>();
    const templateIds = new Set(menuMeta(model.menuId)?.templates ?? []);
    for (const item of model.items) {
      if (item.id === 'default' || templateIds.has(item.id)) continue;
      for (const slot of itemSlots(item)) {
        if (slot < 0 || slot >= size) continue;
        const previous = occupied.get(slot);
        if (previous && previous !== item.id) {
          issues.push(
            error(
              file,
              'MEN-10',
              validationText("槽位 {p0} 同时被 “{p1}” 与 “{p2}” 占用；后写入者覆盖前者，显示不可预测", { p0: slot, p1: previous, p2: item.id }),
              { ...base, slot, itemId: item.id },
            ),
          );
        } else {
          occupied.set(slot, item.id);
        }
      }
    }
  }

  if (!model.items.some((item) => item.id === 'default')) {
    issues.push(info(file, 'MEN-16', validationText("缺少 default 物品：空槽保持透明（不崩）"), base));
  }
  issues.push(...validateOptions(model));
  issues.push(...validateListMenu(model));

  if (model.extras.some((extra) => extra.key === 'display_name' || extra.key === 'lore')) {
    issues.push(warn(file, 'LANG-01', validationText("menu 文件含 display_name/lore；插件会忽略，文本实际来自 lang"), base));
  }
  if (model.extras.length > 0) {
    issues.push(
      info(file, 'GEN-03', validationText("未知顶层字段 {p0} 将原样保留", { p0: model.extras.map((extra) => extra.key).join(', ') }), base),
    );
  }
  return issues;
}

export function validateMenuText(text: string, path = 'menu/main.yml'): MenuIssue[] {
  const parsed = parseMenuFile(path, text);
  return validateMenuModel(parsed.model);
}

export function ensureMenuValidatorRegistered(): void {
  if (registered) return;
  registered = true;
  registerValidator((context) => {
    const issues: MenuIssue[] = [];
    for (const file of context.files) {
      if (file.kind !== 'menu') continue;
      const parsed = context.parsed[file.path];
      if (!parsed || !parsed.ok) continue;
      const model = buildMenuModel(parsed.doc ?? null, parsed.normalizedText, file.path, parsed);
      // 只校验 plugin 实际会读取的 menu/<id>.yml；未知路径也要提示。
      issues.push(...validateMenuModel(model));
    }
    return issues;
  });
}

let registered = false;

export function menuIssuesFor(files: ProjectFile[]): MenuIssue[] {
  return files
    .filter((file) => file.kind === 'menu')
    .flatMap((file) => {
      const parsed = parseMenuFile(file.path, file.text);
      return validateMenuModel(parsed.model);
    });
}

