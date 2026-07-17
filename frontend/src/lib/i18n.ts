import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import zhCN from '@/locales/zh-CN/common.json'
import enUS from '@/locales/en-US/common.json'

void i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  resources: {
    'zh-CN': { common: zhCN },
    'en-US': { common: enUS },
  },
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
