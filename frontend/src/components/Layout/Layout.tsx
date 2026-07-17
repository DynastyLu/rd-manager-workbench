import { Suspense, type ReactNode } from 'react'
import Header from '@/components/Header/Header'
import TabBar from '@/components/TabBar/TabBar'
import Sidebar from '@/components/Sidebar/Sidebar'
import Footer from '@/components/Footer/Footer'
import PageTransition from '@/components/PageTransition/PageTransition'
import routes from '@/router/routes'
import './Layout.less'

export default function Layout({ skeleton = null }: { skeleton?: ReactNode }) {
  return (
    <div className="layout">
      <Header />
      <div className="layout__body">
        <Sidebar />
        <div className="layout__right">
          <TabBar routes={routes} />
          <div className="layout__content">
            <Suspense fallback={skeleton}>
              <PageTransition />
            </Suspense>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
