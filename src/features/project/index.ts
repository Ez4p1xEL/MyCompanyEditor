import ProjectDashboard from './ProjectDashboard.vue';

// 项目工作台是注册表覆盖壳内置总览的入口；为避免异步组件在应用壳测试/首屏出现空窗，
// 这里同步导入组件，loader 仍满足 FeatureModule 的 Promise 接口。
export default {
  id: 'project',
  title: '项目总览',
  icon: '🏠',
  order: 0,
  description: '项目文件、导入导出、全局校验与部署帮助',
  component: () => Promise.resolve(ProjectDashboard),
};
