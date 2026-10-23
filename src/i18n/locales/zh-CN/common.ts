const zhCNCommon = {
  toolbar: {
    brand: 'MyCompany 编辑器',
    subtitle: 'orders / focus / menu · 纯前端本地处理',
    import: '导入',
    export: '导出',
    countersLabel: '校验计数',
    errors: { one: '错误 {count}', other: '错误 {count}' },
    warnings: { one: '警告 {count}', other: '警告 {count}' },
    infos: { one: '提示 {count}', other: '提示 {count}' },
    dirty: '● 未导出修改',
    clean: '● 已同步',
    autosave: {
      empty: '尚未载入项目',
      saving: '正在保存到本地…',
      savedAt: '已自动保存 {time}',
      saved: '已保存到本地',
    },
    projectMenu: '项目',
    loadSample: '载入示例（23 个文件）',
    clearProject: '清空当前项目',
    localStorageNote: '项目会自动保存在浏览器 localStorage 中。',
    version: '规范 {spec} · 插件 {plugin}',
    languageLabel: '语言',
    languageZh: '中文',
    languageEn: 'English',
  },
  toast: {
    importFirst: '请先导入 YAML 文件',
    sampleLoaded: '已载入示例项目：新增 {imported} 个，替换 {replaced} 个（共 {total} 个）',
    sampleLoadedReplaced:
      '已载入示例项目：新增 {imported} 个，替换 {replaced} 个（共 {total} 个；同名文件已用示例替换）',
    projectCleared: '项目已清空',
  },
  confirm: {
    clearProject: '确定清空当前项目？已下载的文件不会被删除。',
  },
};

export type CommonMessages = typeof zhCNCommon;

export default zhCNCommon;
