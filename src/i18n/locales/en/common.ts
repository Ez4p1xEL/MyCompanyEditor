import type { MessageShape } from '../../types';
import type { CommonMessages } from '../zh-CN/common';

const enCommon = {
  toolbar: {
    brand: 'MyCompany Editor',
    subtitle: 'orders / focus / menu · fully local in your browser',
    import: 'Import',
    export: 'Export',
    countersLabel: 'Validation counts',
    errors: { one: '{count} error', other: '{count} errors' },
    warnings: { one: '{count} warning', other: '{count} warnings' },
    infos: { one: '{count} info', other: '{count} info' },
    dirty: '● Unexported changes',
    clean: '● Synced',
    autosave: {
      empty: 'No project loaded',
      saving: 'Saving locally…',
      savedAt: 'Auto-saved {time}',
      saved: 'Saved locally',
    },
    projectMenu: 'Project',
    loadSample: 'Load sample (23 files)',
    clearProject: 'Clear project',
    localStorageNote: 'The project is saved in your browser localStorage automatically.',
    version: 'Spec {spec} · Plugin {plugin}',
    languageLabel: 'Language',
    languageZh: 'Chinese',
    languageEn: 'English',
  },
  toast: {
    importFirst: 'Import a YAML file first',
    sampleLoaded: 'Sample project loaded: {imported} imported, {replaced} replaced ({total} total)',
    sampleLoadedReplaced:
      'Sample project loaded: {imported} imported, {replaced} replaced ({total} total; same-name files were replaced by samples)',
    projectCleared: 'Project cleared',
  },
  confirm: {
    clearProject: 'Clear the current project? Downloaded files will not be deleted.',
  },
} satisfies MessageShape<CommonMessages>;

export default enCommon;
