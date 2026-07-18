import { Banner, Tag } from '@douyinfe/semi-ui'

export default function WorkbenchSettings() {
  return (
    <div className="app-page app-page--settings">
      <div className="app-page__inner app-page__inner--narrow">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Local Preferences</p>
            <h1 className="app-page__title">工作台设置</h1>
            <p className="app-page__subtitle">查看本地数据、通知和外部通道的当前运行边界。</p>
          </div>
        </div>

        <section className="project-workspace__panel">
          <header><h2>通知送达范围</h2><Tag color="green">本地通知已启用</Tag></header>
          <p>页面打开时通过 Socket 实时接收通知；断线后由通知中心读取未读记录补偿。</p>
          <p>Electron 在后台或托盘运行时可以显示系统通知；应用完全退出后不保证提醒送达。</p>
          <Banner
            type="warning"
            fullMode={false}
            title="短信通道未配置，不会发送短信"
            description="短信属于后续可选外部能力。服务商、手机号、签名和费用配置完成前，系统只执行本地页面与桌面通知。"
            closeIcon={null}
          />
        </section>

        <section className="project-workspace__panel">
          <header><h2>本地数据</h2><Tag color="blue">本机优先</Tag></header>
          <p>结构化数据保存在本机 PostgreSQL，附件和版本文件保存在本机工作台文件目录。</p>
          <p>核心功能不会把项目、会议、文档或提醒内容上传到外部服务。</p>
        </section>
      </div>
    </div>
  )
}
