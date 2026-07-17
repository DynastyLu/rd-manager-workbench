import './Footer.less'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <span className="footer__brand">
          <span className="footer__brand-icon">⚽</span>
          百宝箱
        </span>

        <span className="footer__sep">|</span>

        <span className="footer__stack">React&nbsp;·&nbsp;Vite&nbsp;·&nbsp;Less</span>

        <span className="footer__spacer" />

        <span className="footer__copy">
          © {YEAR}&nbsp;
          <span className="footer__copy-accent">TREASURE BOX</span>
          &nbsp;· All rights reserved
        </span>
      </div>
    </footer>
  )
}
