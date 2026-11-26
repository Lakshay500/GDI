import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Locale = 'en-GB' | 'hi-IN'
type LocaleContextValue = {
  locale: Locale
  timezone: string
  setLocale: (locale: Locale) => void
  setTimezone: (timezone: string) => void
  t: (key: string) => string
  formatDate: (value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

const messages: Record<Locale, Record<string, string>> = {
  'en-GB': {
    overview: 'Overview', documents: 'Documents', issuers: 'Issuers', reviews: 'Review cases', credentials: 'Issuer credentials', links: 'QR links',
    workspace: 'Workspace', refresh: 'Refresh', signOut: 'Sign out', signIn: 'Sign in', organisationSlug: 'Organisation slug',
    email: 'Email address', password: 'Password', secureWorkspace: 'Secure workspace',
    language: 'Language', timezone: 'Time zone', english: 'English (UK)', hindi: 'Hindi (India)',
    skipToContent: 'Skip to main content',
  },
  'hi-IN': {
    overview: 'अवलोकन', documents: 'दस्तावेज़', issuers: 'जारीकर्ता', reviews: 'समीक्षा मामले', credentials: 'जारीकर्ता प्रमाण-पत्र', links: 'QR लिंक',
    workspace: 'कार्यस्थान', refresh: 'रीफ़्रेश करें', signOut: 'साइन आउट', signIn: 'साइन इन', organisationSlug: 'संगठन पहचान',
    email: 'ईमेल पता', password: 'पासवर्ड', secureWorkspace: 'सुरक्षित कार्यस्थान',
    language: 'भाषा', timezone: 'समय क्षेत्र', english: 'अंग्रेज़ी (यूके)', hindi: 'हिन्दी (भारत)',
    skipToContent: 'मुख्य सामग्री पर जाएँ',
  },
}

const LocaleContext = createContext<LocaleContextValue | null>(null)
const supportedTimezones = ['Asia/Kolkata', 'Europe/London', 'UTC']

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('gdivs.locale')
    return saved === 'hi-IN' ? 'hi-IN' : 'en-GB'
  })
  const [timezone, setTimezoneState] = useState(() => {
    const saved = localStorage.getItem('gdivs.timezone')
    return saved && supportedTimezones.includes(saved) ? saved : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  })
  const setLocale = (next: Locale) => { setLocaleState(next); localStorage.setItem('gdivs.locale', next) }
  const setTimezone = (next: string) => {
    try { new Intl.DateTimeFormat('en', { timeZone: next }).format() } catch { return }
    setTimezoneState(next); localStorage.setItem('gdivs.timezone', next)
  }
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = 'ltr'
  }, [locale])
  const value = useMemo<LocaleContextValue>(() => ({
    locale, timezone, setLocale, setTimezone,
    t: (key) => messages[locale][key] ?? messages['en-GB'][key] ?? key,
    formatDate: (input, options = {}) => {
      if (!input) return '—'
      const raw = typeof input === 'string' ? input : ''
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw) && options.timeStyle === undefined
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: dateOnly ? 'UTC' : timezone, ...options }).format(input instanceof Date ? input : new Date(input))
    },
    formatNumber: (input, options = {}) => new Intl.NumberFormat(locale, options).format(input),
  }), [locale, timezone])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used within LocaleProvider')
  return context
}
