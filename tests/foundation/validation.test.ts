import { beforeEach, describe, expect, it } from 'vitest';
import { createProjectFile } from '../../src/core/projectFile';
import {
  isBlockingIssue,
  registerValidator,
  resetValidators,
  validateProject,
} from '../../src/core/validation';
import { fixtureText } from './fixtures';

beforeEach(() => {
  resetValidators();
});

describe('校验框架', () => {
  it('isBlockingIssue：blocking/error 阻断，warning/info 不阻断', () => {
    expect(isBlockingIssue({ severity: 'error', file: 'a.yml', message: 'e' })).toBe(true);
    expect(
      isBlockingIssue({ severity: 'warning', file: 'a.yml', message: 'w', blocking: true }),
    ).toBe(true);
    expect(isBlockingIssue({ severity: 'warning', file: 'a.yml', message: 'w' })).toBe(false);
    expect(isBlockingIssue({ severity: 'info', file: 'a.yml', message: 'i' })).toBe(false);
  });

  it('为非法 YAML 生成带行列的 error issue', () => {
    const file = createProjectFile('orders.yml', 'orders: [1, 2\n');
    const result = validateProject([file]);
    const issue = result.byFile['orders.yml'][0];
    expect(issue).toBeDefined();
    expect(issue.severity).toBe('error');
    expect(issue.code).toBe('YAML_PARSE');
    expect(issue.file).toBe('orders.yml');
    expect(issue.line).toBeGreaterThanOrEqual(1);
    expect(issue.column).toBeGreaterThanOrEqual(1);
    expect(issue.message.length).toBeGreaterThan(0);
  });

  it('合法 fixture 不产生 error', () => {
    const files = ['orders.yml', 'menu/main.yml', 'focus/none.yml', 'focus/mob.yml'].map((path) =>
      createProjectFile(path, fixtureText(path)),
    );
    const result = validateProject(files);
    expect(result.counts.error).toBe(0);
    for (const file of files) {
      expect(result.parsed[file.path].ok).toBe(true);
    }
  });

  it('重复键报告为 error', () => {
    const result = validateProject([createProjectFile('orders.yml', 'a: 1\na: 2\n')]);
    const issue = result.issues.find((item) => item.code === 'YAML_DUPLICATE_KEY');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(issue?.path).toBe('a');
  });

  it('已注册的功能校验器参与校验', () => {
    registerValidator(() => [
      { severity: 'warning', file: 'orders.yml', path: '$.demo', message: '演示校验器', fixHint: '无' },
    ]);
    const result = validateProject([createProjectFile('orders.yml', fixtureText('orders.yml'))]);
    expect(result.issues.some((item) => item.message === '演示校验器')).toBe(true);
    expect(result.counts.warning).toBeGreaterThanOrEqual(1);
  });

  it('功能校验器抛异常时被隔离，其他校验不受影响', () => {
    registerValidator(() => {
      throw new Error('boom');
    });
    const result = validateProject([createProjectFile('orders.yml', fixtureText('orders.yml'))]);
    expect(result.issues.some((item) => item.code === 'VALIDATOR_FAILED')).toBe(true);
    expect(result.counts.error).toBeGreaterThanOrEqual(1);
  });

  it('未知类型文件给出 warning 但不阻断', () => {
    const result = validateProject([createProjectFile('notes.yml', 'hello: 1\n')]);
    expect(result.issues.some((item) => item.code === 'FILE_UNKNOWN_KIND')).toBe(true);
  });

  it('遗留配置文件给出 info 提示', () => {
    const result = validateProject([createProjectFile('focus.yml', 'focus-tree:\n  nodes: {}\n')]);
    expect(result.issues.some((item) => item.code === 'FILE_LEGACY')).toBe(true);
  });
});
