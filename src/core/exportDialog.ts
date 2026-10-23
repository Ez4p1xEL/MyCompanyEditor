import { reactive } from 'vue';

/** 单文件导出对话框的全局状态（toolbar 与项目总览共用）。 */
export const exportDialogState = reactive<{
  open: boolean;
  initialPath: string | null;
}>({
  open: false,
  initialPath: null,
});

export function openExportDialog(path?: string | null): void {
  exportDialogState.initialPath = path ?? null;
  exportDialogState.open = true;
}

export function closeExportDialog(): void {
  exportDialogState.open = false;
}
