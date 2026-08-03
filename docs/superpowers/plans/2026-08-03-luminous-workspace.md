# Luminous Workspace 实施计划

1. 为新皮肤建立静态契约测试，锁定 token、Semi 覆盖、降级动效和全宽规则。
2. 重写 workspace token，增加 surface、glow、shadow、motion、control 和 chart 语义。
3. 新建 `luminous-skin.css`，集中覆盖公共页面壳、Semi 控件、弹层、表格、滚动条、Toast 和空状态。
4. 新建本地视觉基元并改造 WorkspaceCard、WorkspaceButton、Skeleton。
5. 调整 AppShell、Header、路由历史和页面转场，加入低成本环境光和交互反馈。
6. 改造工作台 KPI、快捷入口、图表和列表，使其成为整套皮肤的视觉基准页。
7. 扫描业务页面中的旧颜色、固定尺寸、局部白框和强制动画，按公共令牌收口。
8. 执行 focused tests、typecheck、build、diff-check 和多分辨率 Playwright 检查。
9. 将登录页改为 Galaxy 能力叙事区与白色认证区的响应式双栏；增加 WebGL/reduced-motion 降级并回归认证交互。
