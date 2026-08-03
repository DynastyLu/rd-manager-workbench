import { Banner, Tag } from '@douyinfe/semi-ui'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { THEME_LABELS, type Theme, useThemeStore } from '@/stores/theme'

const THEMES: Theme[] = ['aurora', 'eye-care']

function ThemeSection() {
  const { theme, setTheme } = useThemeStore()

  return (
    <section className="project-workspace__panel">
      <header>
        <h2>外观</h2>
        <Tag color="blue">本地主题</Tag>
      </header>
      <p>选择工作台界面主题；设置会自动保存到本机浏览器。</p>
      <div className="workspace-theme-picker" role="group" aria-label="工作台皮肤">
        {THEMES.map((item) => {
          const meta = THEME_LABELS[item]
          return (
            <button
              key={item}
              type="button"
              aria-pressed={theme === item}
              onClick={() => setTheme(item)}
              className="workspace-theme-card"
              data-theme-preview={item}
            >
              <span className="workspace-theme-card__preview" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="workspace-theme-card__copy">
                <strong><span aria-hidden="true">{meta.icon}</span>{meta.label}</strong>
                <small>{meta.desc}</small>
              </span>
              <span className="workspace-theme-card__check" aria-hidden="true">✓</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default function WorkbenchSettings() {
  return (
    <div className="workspace-page workspace-page--settings">
      <div className="workspace-page__inner workspace-page__inner--narrow">
        <ThemeSection />

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
