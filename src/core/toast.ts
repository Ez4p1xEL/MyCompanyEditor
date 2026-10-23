import { reactive } from 'vue';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const toastState = reactive<{ items: ToastItem[] }>({ items: [] });
let nextToastId = 1;

export function pushToast(message: string, tone: ToastTone = 'info', durationMs = 4200): number {
  const id = nextToastId;
  nextToastId += 1;
  toastState.items.push({ id, message, tone });
  if (typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), durationMs);
  }
  return id;
}

export function dismissToast(id: number): void {
  const index = toastState.items.findIndex((item) => item.id === id);
  if (index >= 0) toastState.items.splice(index, 1);
}

export function useToasts(): { items: ToastItem[] } {
  return toastState;
}

/** 测试/重置用：清空所有 Toast。 */
export function clearToasts(): void {
  toastState.items.splice(0, toastState.items.length);
}
