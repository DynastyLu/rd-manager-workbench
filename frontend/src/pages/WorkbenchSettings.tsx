export default function WorkbenchSettings() {
  return (
    <div className="app-page app-page--settings">
      <div className="app-page__inner app-page__inner--narrow">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Local Preferences</p>
            <h1 className="app-page__title">工作台设置</h1>
            <p className="app-page__subtitle">保留主题能力，其余本地偏好将在这里整理。</p>
          </div>
        </div>
        <div className="workbench-placeholder">
          <div>
            <span className="workbench-placeholder__icon">⚙</span>
            <p className="workbench-placeholder__title">本地偏好设置将在后续版本接入。</p>
            <p className="workbench-placeholder__text">顶部主题切换会保存在当前浏览器中。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
