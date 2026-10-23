import { defineStore } from 'pinia';
import {
  canonicalProjectPath,
  detectFileKind,
  fileKindOrder,
  normalizeProjectPath,
} from '../core/fileTypes';
import { computeProjectSignature, createProjectFile, hashFileText } from '../core/projectFile';
import { sampleFiles } from '../core/samples';
import type {
  FileKind,
  ImportResult,
  ImportedFile,
  ProjectFile,
  ValidationIssue,
} from '../core/types';
import { describeDocument } from '../core/yaml';
import { validateProject } from '../core/validation';

export const PROJECT_STORAGE_KEY = 'mycompany-editor:project:v1';

interface StoredProjectFile {
  path: string;
  text: string;
  kind?: FileKind;
}

interface StoredProject {
  version: number;
  savedAt?: number;
  activePath?: string | null;
  exportedHashes?: Record<string, string>;
  files: StoredProjectFile[];
}

interface ProjectState {
  files: Record<string, ProjectFile>;
  projectIssues: ValidationIssue[];
  activePath: string | null;
  activeFeatureId: string;
  /** path → 最近一次成功导出时的内容指纹。 */
  exportedHashes: Record<string, string>;
  /** 最近一次成功写入 localStorage 时的项目指纹（区分“未保存到本地”与“未导出”）。 */
  lastSavedSignature: string;
  lastSavedAt: number | null;
  lastValidatedAt: number | null;
}

const SEVERITY_ORDER: Record<ValidationIssue['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function sortFiles(files: ProjectFile[]): ProjectFile[] {
  return [...files].sort((left, right) => {
    const kindDiff = fileKindOrder(left.kind) - fileKindOrder(right.kind);
    return kindDiff !== 0 ? kindDiff : left.path.localeCompare(right.path);
  });
}

function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((left, right) => {
    const severityDiff = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityDiff !== 0) return severityDiff;
    const fileDiff = left.file.localeCompare(right.file);
    if (fileDiff !== 0) return fileDiff;
    return (left.line ?? 0) - (right.line ?? 0);
  });
}

function flattenIssues(state: ProjectState): ValidationIssue[] {
  const fileIssues = Object.values(state.files).flatMap((file) => file.issues);
  return sortIssues([...state.projectIssues, ...fileIssues]);
}

function isStoredFile(value: unknown): value is StoredProjectFile {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.path === 'string' && typeof record.text === 'string';
}

export const useProjectStore = defineStore('project', {
  state: (): ProjectState => ({
    files: {},
    projectIssues: [],
    activePath: null,
    activeFeatureId: 'project',
    exportedHashes: {},
    lastSavedSignature: '',
    lastSavedAt: null,
    lastValidatedAt: null,
  }),

  getters: {
    fileList(state): ProjectFile[] {
      return sortFiles(Object.values(state.files));
    },
    fileCount(state): number {
      return Object.keys(state.files).length;
    },
    hasFiles(state): boolean {
      return Object.keys(state.files).length > 0;
    },
    activeFile(state): ProjectFile | null {
      if (!state.activePath) return null;
      return state.files[state.activePath] ?? null;
    },
    filesByKind(state) {
      return (kind: FileKind): ProjectFile[] =>
        sortFiles(Object.values(state.files).filter((file) => file.kind === kind));
    },
    kindCounts(state): Record<FileKind, number> {
      const counts: Record<FileKind, number> = {
        orders: 0,
        focus: 0,
        'focus-tree': 0,
        menu: 0,
        'menus-config': 0,
        unknown: 0,
      };
      for (const file of Object.values(state.files)) counts[file.kind] += 1;
      return counts;
    },
    allIssues(state): ValidationIssue[] {
      return flattenIssues(state);
    },
    issueCounts(state): { error: number; warning: number; info: number } {
      const counts = { error: 0, warning: 0, info: 0 };
      for (const issue of flattenIssues(state)) counts[issue.severity] += 1;
      return counts;
    },
    errorCount(state): number {
      return flattenIssues(state).filter((issue) => issue.severity === 'error').length;
    },
    warningCount(state): number {
      return flattenIssues(state).filter((issue) => issue.severity === 'warning').length;
    },
    infoCount(state): number {
      return flattenIssues(state).filter((issue) => issue.severity === 'info').length;
    },
    projectSignature(state): string {
      return computeProjectSignature(Object.values(state.files));
    },
    isDirty(state): boolean {
      const files = Object.values(state.files);
      if (files.length === 0) return false;
      return files.some((file) => state.exportedHashes[file.path] !== hashFileText(file.text));
    },
    /** 当前项目内容是否已经写入 localStorage（与“是否导出”无关）。 */
    isLocallySaved(state): boolean {
      const files = Object.values(state.files);
      if (files.length === 0) return true;
      return state.lastSavedSignature === computeProjectSignature(files);
    },
  },

  actions: {
    importFiles(inputs: ImportedFile[]): ImportResult {
      const result: ImportResult = { imported: [], replaced: [], skipped: [], issueCount: 0 };
      for (const input of inputs) {
        const rawPath = normalizeProjectPath(input?.path ?? '');
        if (!rawPath) {
          result.skipped.push({ path: input?.path ?? '(未命名)', reason: '文件名为空' });
          continue;
        }
        const text = typeof input.text === 'string' ? input.text : '';
        const kind = detectFileKind(rawPath, text);
        const path = canonicalProjectPath(rawPath, kind);
        if (!path) {
          result.skipped.push({ path: rawPath, reason: '无法确定项目内路径' });
          continue;
        }
        const existed = Boolean(this.files[path]);
        this.files[path] = createProjectFile(path, text, { kind });
        if (!this.activePath || !this.files[this.activePath]) this.activePath = path;
        if (existed) result.replaced.push(path);
        else result.imported.push(path);
      }
      this.validateAll();
      result.issueCount = this.errorCount + this.warningCount;
      return result;
    },

    upsertFile(path: string, text: string, kind?: FileKind): ProjectFile {
      const normalized = normalizeProjectPath(path);
      const resolvedKind = kind ?? detectFileKind(normalized, text);
      const file = createProjectFile(normalized, text, { kind: resolvedKind });
      this.files[normalized] = file;
      if (!this.activePath || !this.files[this.activePath]) this.activePath = normalized;
      this.validateAll();
      return file;
    },

    removeFile(path: string): void {
      if (!this.files[path]) return;
      delete this.files[path];
      if (this.activePath === path) {
        this.activePath = this.fileList[0]?.path ?? null;
      }
      this.validateAll();
    },

    setActive(path: string): void {
      if (this.files[path]) this.activePath = path;
    },

    setActiveFeature(id: string): void {
      this.activeFeatureId = id;
    },

    validateAll(): void {
      const files = this.fileList;
      const result = validateProject(files);
      for (const file of files) {
        file.issues = result.byFile[file.path] ?? [];
        const parsed = result.parsed[file.path];
        file.parseError = parsed?.syntaxError ?? parsed?.error;
        if (parsed) {
          const summary = parsed.doc ? describeDocument(parsed.doc) : undefined;
          file.stats = {
            lineCount: parsed.lineCount,
            byteSize: file.stats.byteSize,
            topLevelKeys: summary?.topLevelKeys ?? [],
            topLevelKeyCount: summary?.topLevelKeyCount ?? 0,
          };
        }
      }
      this.projectIssues = result.issues.filter((issue) => !(issue.file in result.byFile));
      this.lastValidatedAt = Date.now();
    },

    loadSample(): ImportResult {
      return this.importFiles(sampleFiles.map((file) => ({ path: file.path, text: file.text })));
    },

    saveToLocalStorage(): boolean {
      try {
        const payload: StoredProject = {
          version: 1,
          savedAt: Date.now(),
          activePath: this.activePath,
          exportedHashes: { ...this.exportedHashes },
          files: this.fileList.map((file) => ({
            path: file.path,
            text: file.text,
            kind: file.kind,
          })),
        };
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(payload));
        this.lastSavedAt = payload.savedAt ?? null;
        this.lastSavedSignature = this.projectSignature;
        return true;
      } catch (error) {
        console.warn('[MyCompanyEditor] 自动保存失败', error);
        return false;
      }
    },

    restoreFromLocalStorage(): boolean {
      try {
        const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw) as Partial<StoredProject> | null;
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.files)) return false;
        const storedFiles = parsed.files.filter(isStoredFile);
        if (storedFiles.length === 0) return false;

        this.files = {};
        for (const stored of storedFiles) {
          const path = normalizeProjectPath(stored.path);
          if (!path) continue;
          const kind = stored.kind ?? detectFileKind(path, stored.text);
          this.files[path] = createProjectFile(path, stored.text, { kind });
        }
        this.activePath =
          typeof parsed.activePath === 'string' && this.files[parsed.activePath]
            ? parsed.activePath
            : (this.fileList[0]?.path ?? null);
        this.exportedHashes =
          parsed.exportedHashes && typeof parsed.exportedHashes === 'object'
            ? { ...parsed.exportedHashes }
            : {};
        this.lastSavedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : null;
        this.validateAll();
        this.lastSavedSignature = this.projectSignature;
        return true;
      } catch (error) {
        console.warn('[MyCompanyEditor] 恢复本地项目失败', error);
        return false;
      }
    },

    /** 记录导出状态；不传 path 表示全部文件都已导出（测试/批量场景）。 */
    markExported(path?: string): void {
      if (path) {
        const file = this.files[path];
        if (file) this.exportedHashes[path] = hashFileText(file.text);
      } else {
        for (const file of this.fileList) {
          this.exportedHashes[file.path] = hashFileText(file.text);
        }
      }
      this.saveToLocalStorage();
    },

    clearProject(): void {
      this.files = {};
      this.projectIssues = [];
      this.activePath = null;
      this.exportedHashes = {};
      this.lastSavedSignature = '';
      this.lastSavedAt = null;
      this.lastValidatedAt = null;
      try {
        localStorage.removeItem(PROJECT_STORAGE_KEY);
      } catch {
        // 忽略存储不可用的情况。
      }
    },
  },
});

export type ProjectStore = ReturnType<typeof useProjectStore>;
