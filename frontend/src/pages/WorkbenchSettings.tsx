import { Banner, Tag } from '@douyinfe/semi-ui'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'

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
            description="服务商、收件人、签名和费用配置完成前，系统只执行本地页面与桌面通知；连接测试和真实调用都需要显式确认。"
            closeIcon={null}
          />
        </section>

        <section className="project-workspace__panel">
          <header><h2>外部能力</h2><Tag color="blue">显式授权</Tag></header>
          <p>在一个工作区内配置短信、AI、CalDAV 日历和 WebDAV 云盘，查看每次调用的状态与失败原因。</p>
          <p>密钥只进入 Electron 加密保险箱，不写 PostgreSQL、浏览器存储、备份或运行日志。</p>
          <Link to={ROUTES.EXTENSIONS_SETTINGS}>打开外部能力设置</Link>
        </section>

        <section className="project-workspace__panel">
          <header><h2>本地数据</h2><Tag color="blue">本机优先</Tag></header>
          <p>结构化数据保存在本机 PostgreSQL，附件和版本文件保存在本机工作台文件目录。</p>
          <p>核心功能不会把项目、会议、文档或提醒内容上传到外部服务。</p>
          <Link to={ROUTES.DATA_GOVERNANCE}>打开数据安全：备份、恢复、审计与健康检查</Link>
        </section>
      </div>
    </div>
  )
}
