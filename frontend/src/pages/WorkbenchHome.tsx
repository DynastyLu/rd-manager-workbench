export default function WorkbenchHome() {
  return (
    <div className="app-page app-page--home">
      <div className="app-page__inner">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Local R&amp;D Workspace</p>
            <h1 className="app-page__title">研发主管工作台</h1>
            <p className="app-page__subtitle">本地工作台入口已就绪，项目数据接入后会在这里呈现。</p>
          </div>
        </div>
        <div className="workbench-placeholder">
          <div>
            <span className="workbench-placeholder__icon">◈</span>
            <p className="workbench-placeholder__title">工作台基础能力已保留</p>
            <p className="workbench-placeholder__text">当前不展示模拟项目、成员或进度数据。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
