import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from './i18n'
import type { ReactNode } from 'react'

type User = { id: string; organisation_id: string; email: string; display_name: string; role: string }
type Issuer = { id: string; issuer_code: string; legal_name: string; status: string; trust_level: string }
type DocumentRecord = { id: string; issuer_id: string; external_reference: string | null; document_type: string; title: string; status: string; issued_at: string | null; expires_at: string | null; created_at: string }
type Version = { id: string; document_id: string; version_number: number; original_filename: string; byte_size: number; ingestion_state: string; sha256: string | null; created_at: string }
type ReviewCase = { id: string; case_number: string; document_version_id: string; status: string; priority: string; reason: string; created_at: string; evidence_snapshot: Record<string, unknown>; assigned_to_user_id?: string | null }
type ReviewDecisionRecord = { id: string; outcome: string; rationale: string; evidence_references: string[]; reviewer_user_id: string; reviewer_display_name: string; created_at: string | null }
type PublicResult = { status: string; document: { title: string; document_type: string; version: number; issuer: string; issued_at: string | null; expires_at: string | null }; integrity: { algorithm: string; digest: string | null; recorded: boolean }; issuer_status: string; latest_system_assessment: { status: string } | null; link_expires_at: string; disclaimer: string }
type PublicLink = { id: string; document_version_id: string; expires_at: string; revoked_at: string | null; status: string; created_at: string | null }
type Tab = 'overview' | 'documents' | 'issuers' | 'reviews' | 'credentials' | 'links' | 'history' | 'recovery' | 'health'
type RecoveryItem = { event_id: string; document_id: string; document_version_id: string; status: 'PENDING' | 'PROCESSING' | 'RETRY' | 'COMPLETED' | 'DEAD_LETTER'; attempts: number; available_at: string | null; locked_at: string | null; completed_at: string | null; last_error: string | null; created_at: string | null }
type RecoveryQueue = { counts: Record<RecoveryItem['status'], number>; items: RecoveryItem[]; limit: number; counts_scope: string; truncated_possible: boolean }
type DependencyHealth = { status: string; checked_at: string; dependencies: Record<string, boolean>; dependency_details?: Record<string, { status: string; configured: boolean }>; health_semantics?: string }

const API = (import.meta as ImportMeta & { env: { VITE_API_BASE?: string } }).env.VITE_API_BASE ?? ''
const tokenKey = 'gdivs.access'
const refreshKey = 'gdivs.refresh'

// Storage access can throw in privacy-restricted browsers, embedded contexts and Safari modes.
// Keep the current tab usable with an in-memory fallback when persistence is unavailable.
const memorySession = new Map<string, string>()
function readSession(key: string): string | null { try { return window.sessionStorage.getItem(key) ?? memorySession.get(key) ?? null } catch { return memorySession.get(key) ?? null } }
function writeSession(key: string, value: string): void { memorySession.set(key, value); try { window.sessionStorage.setItem(key, value) } catch { /* in-memory session remains usable */ } }
function clearSession(key: string): void { memorySession.delete(key); try { window.sessionStorage.removeItem(key) } catch { /* storage may be unavailable */ } }
function readPreference(key: string): string | null { try { return window.localStorage.getItem(key) } catch { return null } }
function writePreference(key: string, value: string): void { try { window.localStorage.setItem(key, value) } catch { /* preference is optional */ } }

let refreshInFlight: Promise<string | null> | null = null

async function request<T>(path: string, init: RequestInit = {}, token?: string, retried = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  const activeToken = token ? (token === readSession(tokenKey) ? token : readSession(tokenKey) ?? token) : undefined
  if (activeToken) headers.set('Authorization', `Bearer ${activeToken}`)
  const response = await fetch(`${API}${path}`, { ...init, headers })
  if (response.status === 401 && activeToken && !retried && activeToken === readSession(tokenKey)) {
    if (!refreshInFlight) {
      const refreshToken = readSession(refreshKey)
      refreshInFlight = refreshToken ? fetch(`${API}/api/v1/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).then(async r => {
        if (!r.ok) return null
        const pair = await r.json() as { access_token: string; refresh_token: string }
        writeSession(tokenKey, pair.access_token); writeSession(refreshKey, pair.refresh_token)
        return pair.access_token
      }).catch(() => null).finally(() => { refreshInFlight = null }) : Promise.resolve(null)
    }
    const nextToken = await refreshInFlight
    if (nextToken) return request<T>(path, init, nextToken, true)
    clearSession(tokenKey); clearSession(refreshKey)
    window.dispatchEvent(new Event('gdivs:session-expired'))
  }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    throw new Error(typeof detail === 'string' ? detail : detail?.message ?? `Request failed (${response.status})`)
  }
  if (data === null || data === undefined) throw new Error('The server returned an empty response. Please retry.');
  return data as T
}

function PublicVerification({ token }: { token: string }) {
  const { formatDate } = useLocale()
  const [result, setResult] = useState<PublicResult | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    request<PublicResult>(`/api/v1/public-verification/${encodeURIComponent(token)}`)
      .then(value => { if (alive) setResult(value) })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'Unable to retrieve verification details.') })
    return () => { alive = false }
  }, [token])
  return <main className="public-shell">
    <div className="brand-mark">G</div><p className="eyebrow">GDI-VS · PUBLIC DOCUMENT CHECK</p><h1>Document verification</h1>
    {error && <div className="panel"><span className="status-pill danger">Unavailable</span><h2>Unable to retrieve this record</h2><p>{error}</p></div>}
    {!result && !error && <div className="panel muted">Retrieving the limited public verification record…</div>}
    {result && result.document && result.integrity && <>
      <div className="panel"><span className="status-pill info">{String(result.status ?? 'UNKNOWN').replaceAll('_', ' ')}</span><h2>{result.document.title ?? 'Untitled document'}</h2><p>{result.document.issuer ?? 'Unknown issuer'} · {result.document.document_type ?? 'Unspecified type'}</p><p className="muted">This confirms that a public verification reference exists. It is not, by itself, a certificate of authenticity.</p></div>
      <div className="panel"><h3>Document details</h3><dl><dt>Version</dt><dd>{result.document.version ?? '—'}</dd><dt>Issuer status</dt><dd>{result.issuer_status}</dd><dt>Issue date</dt><dd>{result.document.issued_at ?? 'Not recorded'}</dd><dt>Document expiry</dt><dd>{result.document.expires_at ?? 'Not recorded'}</dd></dl></div>
      <div className="panel"><h3>Integrity record</h3><p>{result.integrity.recorded ? `${result.integrity.algorithm} digest recorded` : 'No digest is recorded.'}</p>{result.integrity.digest && <code className="digest">{result.integrity.digest}</code>}<h3 className="spaced">Latest system assessment</h3><p>{result.latest_system_assessment?.status ?? 'No system assessment is available.'}</p></div>
      <p className="disclaimer">{result.disclaimer}</p><small>Reference expires: {result.link_expires_at ? formatDate(result.link_expires_at, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not specified'}</small>
    </>}
  </main>
}

function Login({ onLogin }: { onLogin: (user: User, access: string, refresh: string) => void }) {
  const { t, locale, setLocale } = useLocale()
  const [organisation, setOrganisation] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const tokens = await request<{ access_token: string; refresh_token: string }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ organisation_slug: organisation, email, password }) })
      const user = await request<User>('/api/v1/auth/me', {}, tokens.access_token)
      onLogin(user, tokens.access_token, tokens.refresh_token)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in failed.') }
    finally { setBusy(false) }
  }
  return <main className="login-layout"><a className="skip-link" href="#login-form">{t('skipToContent')}</a><aside className="login-aside"><div className="brand"><span className="brand-mark">G</span><span>GDI<span className="brand-light">-VS</span></span></div><div><p className="eyebrow">DOCUMENT TRUST INFRASTRUCTURE</p><h1>Integrity you can inspect.</h1><p>One workspace for document registration, issuer trust, verification evidence and accountable review.</p></div><small>K.R. Mangalam University · School of Engineering & Technology</small></aside><section className="login-main"><form id="login-form" className="login-card" tabIndex={-1} onSubmit={submit}><div className="locale-controls"><label htmlFor="login-locale">{t('language')}</label><select id="login-locale" value={locale} onChange={e => setLocale(e.target.value as 'en-GB' | 'hi-IN')}><option value="en-GB">{t('english')}</option><option value="hi-IN">{t('hindi')}</option></select></div><p className="eyebrow">{t('secureWorkspace').toUpperCase()}</p><h2>{t('signIn')}</h2><p className="muted">Use your organisation account to continue.</p><label>{t('organisationSlug')}<input required value={organisation} onChange={e => setOrganisation(e.target.value)} placeholder="your-organisation" autoComplete="organization" /></label><label>{t('email')}<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@organisation.gov" autoComplete="username" /></label><label>{t('password')}<input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button><p className="footnote">Access is controlled by your organisation’s assigned role.</p></form></section></main>
}

export default function App() {
  const { t, locale, setLocale, timezone, setTimezone, formatDate } = useLocale()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readPreference('gdivs.sidebar-collapsed') === 'true')
  const toggleSidebar = () => setSidebarCollapsed(value => { const next = !value; writePreference('gdivs.sidebar-collapsed', String(next)); return next })
  const publicMatch = window.location.pathname.match(/^\/verify\/([A-Za-z0-9_-]+)\/?$/)
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState(readSession(tokenKey) ?? '')
  const [tab, setTab] = useState<Tab>('overview')
  const [issuers, setIssuers] = useState<Issuer[]>([])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [cases, setCases] = useState<ReviewCase[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedDocument, setSelectedDocument] = useState<DocumentRecord | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [qrSvg, setQrSvg] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [showIssuerForm, setShowIssuerForm] = useState(false)
  const [showDocumentForm, setShowDocumentForm] = useState(false)
  const [publicLinks, setPublicLinks] = useState<PublicLink[]>([])
  const [verificationRows, setVerificationRows] = useState<VerificationHistoryItem[]>([])
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [selectedEvidence, setSelectedEvidence] = useState<Record<string, unknown> | null>(null)
  const [recoveryQueue, setRecoveryQueue] = useState<RecoveryQueue | null>(null)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [retryingEvent, setRetryingEvent] = useState<string | null>(null)
  const [dependencyHealth, setDependencyHealth] = useState<DependencyHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const loadWorkspace = useCallback(async (access: string) => {
    setLoading(true); setError('')
    try {
      const [issuerRows, documentRows, caseRows, linkRows] = await Promise.all([
        request<Issuer[]>('/api/v1/issuers?limit=100', {}, access),
        request<DocumentRecord[]>('/api/v1/documents?limit=100', {}, access),
        ['SYSTEM_ADMIN', 'ORG_ADMIN', 'REVIEWER', 'AUDITOR'].includes(user?.role ?? '')
          ? request<ReviewCase[]>('/api/v1/reviews/cases', {}, access) : Promise.resolve([] as ReviewCase[]),
        ['SYSTEM_ADMIN', 'ORG_ADMIN', 'ISSUER_ADMIN', 'ISSUER_OPERATOR'].includes(user?.role ?? '')
          ? request<PublicLink[]>('/api/v1/public-verification/links', {}, access) : Promise.resolve([] as PublicLink[]),
      ])
      if (![issuerRows, documentRows, caseRows, linkRows].every(Array.isArray)) throw new Error('The server returned data in an unexpected format. Refresh or contact your administrator.');
      setIssuers(issuerRows); setDocuments(documentRows); setCases(caseRows); setPublicLinks(linkRows)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load workspace data.') }
    finally { setLoading(false) }
  }, [user?.role])

  useEffect(() => {
    if (!token || publicMatch) return
    request<User>('/api/v1/auth/me', {}, token).then(setUser).catch(() => { clearSession(tokenKey); clearSession(refreshKey); setToken('') })
  }, [token, publicMatch])
  useEffect(() => { if (token && user) void loadWorkspace(token) }, [token, user, loadWorkspace])
  useEffect(() => { const expire = () => { setToken(''); setUser(null) }; window.addEventListener('gdivs:session-expired', expire); return () => window.removeEventListener('gdivs:session-expired', expire) }, [])
  useEffect(() => { if (!selectedDocument || !token) return; const timer = window.setInterval(() => { void request<Version[]>(`/api/v1/documents/${selectedDocument.id}/versions`, {}, token).then(setVersions).catch(() => undefined) }, 7000); return () => window.clearInterval(timer) }, [selectedDocument, token])

  const loadVerificationHistory = async (offset: number) => {
    try {
      const page = await request<{ items: VerificationHistoryItem[]; returned: number; limit: number; offset: number }>(`/api/v1/verification/results?limit=25&offset=${offset}`, {}, token)
      if (!page || !Array.isArray(page.items)) throw new Error('Verification history returned an unexpected response format.');
      setVerificationRows(page.items); setHistoryOffset(offset); setHistoryHasMore(page.returned === page.limit)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load verification history.') }
  }
  const openEvidence = async (resultId: string) => {
    try { setSelectedEvidence(await request<Record<string, unknown>>(`/api/v1/verification/results/${resultId}/evidence-snapshot`, {}, token)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to retrieve evidence snapshot.') }
  }
  const downloadVerificationReport = async (resultId: string) => {
    try {
      const response = await fetch(`${API}/api/v1/verification/results/${resultId}/report.pdf`, { headers: { Authorization: `Bearer ${readSession(tokenKey) ?? token}`, Accept: 'application/pdf' }, cache: 'no-store' })
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.detail ?? `Report download failed (${response.status})`) }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `gdi-vs-verification-${resultId}.pdf`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download verification report.') }
  }
  useEffect(() => { if (token && user && tab === 'history') void loadVerificationHistory(0) }, [token, user, tab])
  const loadRecoveryQueue = useCallback(async () => {
    if (!token) return
    setRecoveryLoading(true)
    try { const data = await request<RecoveryQueue>('/api/v1/storage/ipfs/recovery/queue', {}, token); if (!data || !Array.isArray(data.items)) throw new Error('Recovery queue returned an unexpected response format.'); setRecoveryQueue(data) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load storage recovery queue.') }
    finally { setRecoveryLoading(false) }
  }, [token])
  useEffect(() => { if (token && user && tab === 'recovery') void loadRecoveryQueue() }, [token, user, tab, loadRecoveryQueue])
  const loadDependencyHealth = useCallback(async () => { if (!token) return; setHealthLoading(true); try { setDependencyHealth(await request<DependencyHealth>('/health/dependencies', {}, token)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load dependency health.') } finally { setHealthLoading(false) } }, [token])
  useEffect(() => { if (token && user && tab === 'health') void loadDependencyHealth() }, [token, user, tab, loadDependencyHealth])
  const retryRecoveryEvent = async (eventId: string) => {
    setRetryingEvent(eventId); setError(''); setNotice('')
    try {
      const result = await request<{ status: string; dispatch?: string; repair_performed?: boolean }>(`/api/v1/storage/ipfs/recovery/outbox/${eventId}/retry`, { method: 'POST' }, token)
      setNotice(result.repair_performed === false ? `Event requeued (${result.dispatch ?? 'scheduled recovery'}). No document repair was performed.` : `Recovery event status: ${result.status}`)
      await loadRecoveryQueue()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to retry recovery event.') }
    finally { setRetryingEvent(null) }
  }
  const onLogin = (nextUser: User, access: string, refresh: string) => {
    writeSession(tokenKey, access); writeSession(refreshKey, refresh); setToken(access); setUser(nextUser)
  }
  const logout = async () => {
    try { await request('/api/v1/auth/logout', { method: 'POST' }, token) } catch { /* local session is still cleared */ }
    clearSession(tokenKey); clearSession(refreshKey); setToken(''); setUser(null); setIssuers([]); setDocuments([]); setCases([])
  }
  const refresh = () => token && void loadWorkspace(token)
  const openDocument = async (document: DocumentRecord) => {
    setSelectedDocument(document); setQrSvg(''); setQrUrl('')
    try { setVersions(await request<Version[]>(`/api/v1/documents/${document.id}/versions`, {}, token)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load document versions.') }
  }
  const upload = async (documentId: string, file: File) => {
    const body = new FormData(); body.append('file', file)
    await request(`/api/v1/documents/${documentId}/versions`, { method: 'POST', body }, token)
    const target = documents.find(item => item.id === documentId) ?? selectedDocument
    if (target) await openDocument(target)
    await loadWorkspace(token)
  }
  const queueScan = async (versionId: string) => { const result = await request<{ status: string }>(`/api/v1/documents/versions/${versionId}/processing-jobs`, { method: 'POST' }, token); setNotice(`Safety processing: ${result.status}`) }
  const queueExtraction = async (versionId: string) => { const result = await request<{ status: string }>(`/api/v1/documents/versions/${versionId}/extraction-jobs`, { method: 'POST' }, token); setNotice(`Document extraction: ${result.status}`) }
  const createQr = async (versionId: string) => { const result = await request<{ verification_url: string; qr_svg: string }>('/api/v1/public-verification/links', { method: 'POST', body: JSON.stringify({ document_version_id: versionId, expires_in_days: 365 }) }, token); setQrSvg(result.qr_svg); setQrUrl(result.verification_url) }
  const revokeLink = async (id: string) => { await request(`/api/v1/public-verification/links/${id}/revoke`, { method: 'POST' }, token); setPublicLinks(await request<PublicLink[]>('/api/v1/public-verification/links', {}, token)); setNotice('Public verification link revoked.') }
  const changeIssuerStatus = async (issuer: Issuer, nextStatus: 'ACTIVE' | 'SUSPENDED' | 'REVOKED') => {
    const reason = window.prompt(`Reason for changing ${issuer.legal_name} from ${issuer.status} to ${nextStatus} (at least 10 characters):`);
    if (reason === null) return;
    if (reason.trim().length < 10) { setError('Please provide a reason of at least 10 characters.'); return; }
    try { await request(`/api/v1/issuers/${issuer.id}/status`, { method: 'PATCH', body: JSON.stringify({status: nextStatus, reason: reason.trim()}) }, token); setNotice(`Issuer status updated to ${nextStatus}.`); await loadWorkspace(token); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update issuer status.'); }
  }
  const canReview = ['SYSTEM_ADMIN', 'ORG_ADMIN', 'REVIEWER', 'AUDITOR'].includes(user?.role ?? '')
  const canManageIssuers = ['SYSTEM_ADMIN', 'ORG_ADMIN', 'ISSUER_ADMIN'].includes(user?.role ?? '')
  const canViewRecovery = ['SYSTEM_ADMIN', 'ORG_ADMIN', 'ISSUER_ADMIN', 'ISSUER_OPERATOR', 'REVIEWER', 'AUDITOR', 'VERIFIER'].includes(user?.role ?? '')
  const canRetryRecovery = ['SYSTEM_ADMIN', 'ORG_ADMIN'].includes(user?.role ?? '')
  const canViewSystemHealth = ['SYSTEM_ADMIN', 'ORG_ADMIN'].includes(user?.role ?? '')
  const nav = useMemo(() => ([['overview', t('overview')], ['documents', t('documents')], ['history', 'Verification history'], ...(canViewRecovery ? [['recovery', 'Storage & ledger operations'] as [Tab, string]] : []), ...(canViewSystemHealth ? [['health', 'System health'] as [Tab, string]] : []), ['issuers', t('issuers')], ...(canReview ? [['reviews', t('reviews')] as [Tab, string]] : []), ...(canManageIssuers ? [['credentials', t('credentials')] as [Tab, string], ['links', t('links')] as [Tab, string]] : [])] as [Tab, string][]), [canReview, canManageIssuers, canViewRecovery, canViewSystemHealth, t])
  const canCreateDocuments = ['SYSTEM_ADMIN', 'ORG_ADMIN', 'ISSUER_ADMIN', 'ISSUER_OPERATOR'].includes(user?.role ?? '')

  if (publicMatch) return <PublicVerification token={publicMatch[1]} />
  if (!user) return <Login onLogin={onLogin} />

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <a className="skip-link" href="#main-content">{t('skipToContent')}</a>
    <aside className="sidebar"><div className="brand"><span className="brand-mark">G</span><span className="brand-wordmark">GDI<span className="brand-light">-VS</span><small className="brand-caption">DOCUMENT TRUST PLATFORM</small></span><button className="sidebar-toggle" type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} aria-pressed={sidebarCollapsed} title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}>{sidebarCollapsed ? '»' : '«'}</button></div><div className="org-switch"><span className="org-dot"/><span className="org-copy"><b>Organisation workspace</b><small>ORG · {user.organisation_id.slice(0, 8)}…</small></span><span className="org-chevron" aria-hidden="true">⌄</span></div><nav className="primary-navigation" aria-label="Main navigation"><p className="nav-section-label">WORKSPACE</p>{nav.filter(([key]) => ['overview','documents','history','recovery','health'].includes(key)).map(([key, label]) => <button key={key} className={`nav-item ${tab === key ? 'active' : ''}`} aria-label={label} title={label} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setSelectedDocument(null) }}><span className="nav-icon" aria-hidden="true">{key === 'overview' ? '▦' : key === 'documents' ? '▤' : key === 'recovery' ? '⌁' : key === 'health' ? '✚' : '◷'}</span><span className="nav-label">{label}</span></button>)}<p className="nav-section-label nav-section-spaced">GOVERNANCE</p>{nav.filter(([key]) => ['issuers','reviews','credentials','links'].includes(key)).map(([key, label]) => <button key={key} className={`nav-item ${tab === key ? 'active' : ''}`} aria-label={label} title={label} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setSelectedDocument(null) }}><span className="nav-icon" aria-hidden="true">{key === 'issuers' ? '⌂' : key === 'reviews' ? '◎' : key === 'credentials' ? '◇' : '↗'}</span><span className="nav-label">{label}</span>{key === 'reviews' && cases.filter(item => item.status !== 'CLOSED').length > 0 && <span className="nav-count">{cases.filter(item => item.status !== 'CLOSED').length}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{(user.display_name || user.email || 'U').slice(0, 1).toUpperCase()}</div><span className="user-copy"><b>{user.display_name || user.email}</b><small>{(user.role || 'USER').replaceAll('_', ' ')}</small></span><span className="user-menu-mark" aria-hidden="true">⋯</span></div><button className="signout" onClick={logout}>↗ {t('signOut')}</button></div></aside>
    <main className="main-area" id="main-content" tabIndex={-1}><header className="topbar"><div><span className="crumb">{t('workspace')}</span><span className="crumb-sep">/</span><b>{nav.find(item => item[0] === tab)?.[1] ?? 'Overview'}</b></div><div className="top-actions"><span className="workspace-status"><span className="live-dot" aria-hidden="true"/> Secure session</span><label className="sr-only" htmlFor="app-locale">{t('language')}</label><select id="app-locale" className="locale-select" value={locale} onChange={e => setLocale(e.target.value as 'en-GB' | 'hi-IN')}><option value="en-GB">{t('english')}</option><option value="hi-IN">{t('hindi')}</option></select><label className="sr-only" htmlFor="app-timezone">{t('timezone')}</label><select id="app-timezone" className="locale-select timezone-select" value={timezone} onChange={e => setTimezone(e.target.value)}>{!['Asia/Kolkata', 'Europe/London', 'UTC'].includes(timezone) && <option value={timezone}>{timezone}</option>}<option value="Asia/Kolkata">Asia/Kolkata</option><option value="Europe/London">Europe/London</option><option value="UTC">UTC</option></select><button className="icon-button" onClick={refresh} title={t('refresh')} aria-label={t('refresh')}>↻</button></div></header>
      <div className="content" aria-busy={loading}><div className="page-heading"><div><p className="eyebrow">GOVERNMENT DOCUMENT INTEGRITY VERIFICATION SYSTEM</p><h1>{selectedDocument ? selectedDocument.title : tab === 'overview' ? (canReview && !canManageIssuers ? 'Your review workspace.' : 'Good to see you.') : nav.find(item => item[0] === tab)?.[1]}</h1><p className="muted">{selectedDocument ? 'Document record, versions and processing actions.' : tab === 'overview' ? (canReview && !canManageIssuers ? 'Review assigned cases, inspect evidence and record accountable decisions.' : 'A clear view of your document trust operations.') : tab === 'documents' ? 'Register documents, upload versions and track safety processing.' : tab === 'issuers' ? 'Manage the organisations authorised to issue documents.' : tab === 'recovery' ? 'Inspect IPFS-to-Fabric outbox events and perform controlled administrative requeues.' : tab === 'health' ? 'Review live dependency probes and API service health.' : 'Investigate evidence and record accountable review decisions.'}</p></div>{!selectedDocument && <button className="secondary" onClick={refresh}>↻ {t('refresh')}</button>}</div>
      {error && <div className="alert error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}{notice && <div className="alert success" role="status" aria-live="polite">{notice}<button onClick={() => setNotice('')}>×</button></div>}{loading && <div className="loading-line" role="status" aria-live="polite">Synchronising workspace…</div>}
      {selectedDocument ? <section className="panel detail-panel"><button className="back-link" onClick={() => setSelectedDocument(null)}>← Back to documents</button><div className="detail-top"><div><span className={`status-pill ${selectedDocument.status === 'ACTIVE' ? 'good' : 'warning'}`}>{selectedDocument.status}</span><h2>{selectedDocument.title}</h2><p className="muted">{selectedDocument.document_type} · Ref {selectedDocument.external_reference ?? '—'}</p></div>{canCreateDocuments && <DocumentUploadDropzone onUpload={file => upload(selectedDocument.id, file)} onError={message => setError(message)} onNotice={setNotice} />}</div><div className="document-overview-grid"><section className="document-overview-card"><p className="eyebrow">DOCUMENT OVERVIEW</p><dl className="document-metadata"><dt>Issuer</dt><dd>{issuers.find(item => item.id === selectedDocument.issuer_id)?.legal_name ?? 'Unknown issuer'}</dd><dt>Issue date</dt><dd>{selectedDocument.issued_at ? formatDate(selectedDocument.issued_at, { dateStyle: 'medium' }) : 'Not recorded'}</dd><dt>Expiry date</dt><dd>{selectedDocument.expires_at ? formatDate(selectedDocument.expires_at, { dateStyle: 'medium' }) : 'No expiry recorded'}</dd><dt>Registered</dt><dd>{formatDate(selectedDocument.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</dd><dt>Document ID</dt><dd><code>{selectedDocument.id}</code></dd></dl></section><section className="document-overview-card"><p className="eyebrow">LIFECYCLE SUMMARY</p><div className="lifecycle-stat"><strong>{versions.length}</strong><span>Uploaded {versions.length === 1 ? 'version' : 'versions'}</span></div><div className="lifecycle-stat"><strong>{versions.filter(item => item.sha256).length}</strong><span>Versions with recorded SHA-256</span></div><p className="footnote">Integrity digests are displayed as recorded by the API. A recorded digest alone does not establish authenticity.</p></section></div><div className="version-section-heading"><div><h3>Version history</h3><p className="muted">Uploaded files, processing state and integrity references.</p></div><span className="status-pill info">{versions.length} {versions.length === 1 ? 'VERSION' : 'VERSIONS'}</span></div>{versions.length === 0 ? <p className="empty">No binary versions uploaded yet. Upload the first file to begin the document's version history.</p> : <div className="table-wrap"><table><caption className="sr-only">Document versions</caption><thead><tr><th scope="col">Version</th><th scope="col">File</th><th scope="col">Safety state</th><th scope="col">SHA-256</th><th scope="col">Actions</th></tr></thead><tbody>{versions.map(version => <tr key={version.id}><td>v{version.version_number}</td><td>{version.original_filename}<small>{(version.byte_size / 1024).toFixed(1)} KB</small></td><td><span className="status-pill neutral">{version.ingestion_state}</span>{canCreateDocuments && <ProcessingStatus versionId={version.id} token={token} />}</td><td><code>{version.sha256?.slice(0, 16) ?? '—'}…</code></td><td className="actions"><VerificationFileCheck version={version} token={token} onError={setError} />{canCreateDocuments && <>
  {['QUARANTINED', 'SCAN_FAILED'].includes(version.ingestion_state) && (
    <button
      className="tiny"
      onClick={() => queueScan(version.id).then(async () => {
        if (selectedDocument) setVersions(await request<Version[]>(`/api/v1/documents/${selectedDocument.id}/versions`, {}, token))
        refresh()
      }).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to queue safety scanning.'))}
    >Run safety scan</button>
  )}
  {version.ingestion_state === 'SCAN_CLEAN' && (
    <button
      className="tiny"
      onClick={() => queueExtraction(version.id).then(async () => {
        if (selectedDocument) setVersions(await request<Version[]>(`/api/v1/documents/${selectedDocument.id}/versions`, {}, token))
        refresh()
      }).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to queue document extraction.'))}
    >Extract</button>
  )}
  <button className="tiny" onClick={() => createQr(version.id).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to create a verification link.'))}>QR link</button>
</>}</td></tr>)}</tbody></table></div>}{qrSvg && <div className="qr-result"><img className="qr-image" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`} alt="QR code for public document verification" /><div><b>Public verification link created</b><p><a href={qrUrl} target="_blank" rel="noreferrer">Open verification page ↗</a></p><small>Anyone with this bearer link can view the limited public summary.</small></div></div>}</section>
      : tab === 'overview' ? <Dashboard documents={documents} issuers={issuers} cases={cases} onOpenDocument={openDocument} onNavigate={setTab} canReview={canReview} />
      : tab === 'documents' ? <section className="panel"><div className="section-head"><div><h2>Document registry</h2><p className="muted">{documents.length} records in this organisation</p></div>{canCreateDocuments && <button className="primary" onClick={() => setShowDocumentForm(true)}>＋ Register document</button>}</div><DocumentTable rows={documents} issuers={issuers} onSelect={openDocument} /></section>
      : tab === 'history' ? <VerificationHistory rows={verificationRows} offset={historyOffset} hasMore={historyHasMore} onPage={loadVerificationHistory} onEvidence={openEvidence} onDownload={downloadVerificationReport} />
      : tab === 'issuers' ? <section className="panel"><div className="section-head"><div><h2>Issuer registry</h2><p className="muted">Organisation-scoped issuer records · status changes are audited</p></div>{canManageIssuers && <button className="primary" onClick={() => setShowIssuerForm(true)}>＋ Add issuer</button>}</div><div className="table-wrap"><table><caption className="sr-only">Issuer registry</caption><thead><tr><th scope="col">Issuer</th><th scope="col">Code</th><th scope="col">Status</th><th scope="col">Trust assessment</th>{canManageIssuers && <th scope="col">Actions</th>}</tr></thead><tbody>{issuers.map(issuer => <tr key={issuer.id}><td><b>{issuer.legal_name}</b><small>{issuer.id.slice(0, 8)}…</small></td><td>{issuer.issuer_code}</td><td><span className={`status-pill ${issuer.status === 'ACTIVE' ? 'good' : 'warning'}`}>{issuer.status}</span></td><td>{issuer.trust_level}</td>{canManageIssuers && <td>{issuer.status === 'REVOKED' ? 'Terminal' : <div className="action-group">{issuer.status === 'PENDING' && <button className="tiny" onClick={() => void changeIssuerStatus(issuer,'ACTIVE')}>Activate</button>}{issuer.status === 'SUSPENDED' && <button className="tiny" onClick={() => void changeIssuerStatus(issuer,'ACTIVE')}>Reactivate</button>}{issuer.status !== 'SUSPENDED' && <button className="tiny" onClick={() => void changeIssuerStatus(issuer,'SUSPENDED')}>Suspend</button>}<button className="tiny danger-button" onClick={() => void changeIssuerStatus(issuer,'REVOKED')}>Revoke</button></div>}</td>}</tr>)}</tbody></table>{issuers.length === 0 && <p className="empty">No issuers registered yet.</p>}</div><p className="footnote">Revocation is irreversible. Every lifecycle change requires a reason and is recorded in the audit trail. Trust assessment remains separate from lifecycle status.</p></section>
      : tab === 'reviews' ? <ReviewWorkspace rows={cases} token={token} currentUserId={user.id} canDecide={['SYSTEM_ADMIN','ORG_ADMIN','REVIEWER'].includes(user.role)} onChanged={refresh} onError={setError} />
      : tab === 'credentials' ? <CredentialWorkspace issuers={issuers} token={token} canManage={canManageIssuers} onError={setError} onNotice={setNotice} />
      : tab === 'health' ? <SystemHealthWorkspace health={dependencyHealth} loading={healthLoading} onRefresh={loadDependencyHealth} />
      : tab === 'recovery' ? <StorageRecoveryWorkspace queue={recoveryQueue} loading={recoveryLoading} canRetry={canRetryRecovery} canInspectErrors={canRetryRecovery} retryingEvent={retryingEvent} onRefresh={loadRecoveryQueue} onRetry={retryRecoveryEvent} />
      : <section className="panel"><div className="section-head"><div><h2>Public verification links</h2><p className="muted">Manage bearer references. Revocation prevents further public lookup.</p></div><button className="secondary" onClick={refresh}>Refresh</button></div><div className="table-wrap"><table><caption className="sr-only">Public verification links</caption><thead><tr><th scope="col">Link ID</th><th scope="col">Document version</th><th scope="col">Created</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{publicLinks.map(link => <tr key={link.id}><td><code>{link.id.slice(0,8)}…</code></td><td><code>{link.document_version_id.slice(0,8)}…</code></td><td>{link.created_at ? formatDate(link.created_at) : '—'}</td><td>{formatDate(link.expires_at)}</td><td><span className={`status-pill ${link.status === 'ACTIVE' ? 'good' : 'warning'}`}>{link.status}</span></td><td>{link.status === 'ACTIVE' && <button className="tiny danger-button" onClick={() => revokeLink(link.id).catch(e => setError(e.message))}>Revoke</button>}</td></tr>)}</tbody></table>{publicLinks.length === 0 && <p className="empty">No public verification links have been issued.</p>}</div></section>}
      </div>
    </main>
    {selectedEvidence && <Modal title="Verification evidence snapshot" onClose={() => setSelectedEvidence(null)}><EvidenceSnapshotView evidence={selectedEvidence} /></Modal>}
    {showIssuerForm && <Modal title="Register an issuer" onClose={() => setShowIssuerForm(false)}><IssuerForm token={token} onDone={() => { setShowIssuerForm(false); refresh() }} onError={message => setError(message)} /></Modal>}
    {showDocumentForm && <Modal title="Register a document" onClose={() => setShowDocumentForm(false)}><DocumentForm token={token} issuers={issuers} onDone={() => { setShowDocumentForm(false); refresh() }} onError={message => setError(message)} /></Modal>}
  </div>
}



function SystemHealthWorkspace({ health, loading, onRefresh }: { health: DependencyHealth | null; loading: boolean; onRefresh: () => void }) {
  const names: Record<string, string> = { postgresql: 'PostgreSQL database', redis: 'Redis / Celery broker', clamav: 'ClamAV scanner', ipfs: 'IPFS / Kubo API', fabric_gateway: 'Hyperledger Fabric Gateway' }
  const detail = health?.dependency_details ?? Object.fromEntries(Object.entries(health?.dependencies ?? {}).map(([key, ok]) => [key, { status: ok ? 'healthy' : 'unavailable', configured: true }]))
  return <div className="health-workspace"><section className="panel"><div className="section-head"><div><h2>System dependency health</h2><p className="muted">Point-in-time connectivity probes from the API process. This is not a historical uptime report or an end-to-end transaction test.</p></div><button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? 'Checking…' : '↻ Run checks'}</button></div>{health && <p className="muted health-timestamp">Last checked: {new Date(health.checked_at).toLocaleString()}</p>}</section>{!health ? <section className="panel"><p className="muted">{loading ? 'Checking configured dependencies…' : 'Health data is not available. Run checks to retry.'}</p></section> : <><section className="panel health-summary"><span className={`status-pill ${health.status === 'healthy' ? 'good' : 'warning'}`}>{health.status.toUpperCase()}</span><h2>{Object.values(detail).filter(item => item.status === 'healthy').length} healthy · {Object.values(detail).filter(item => item.status === 'unavailable').length} unavailable · {Object.values(detail).filter(item => item.status === 'not_configured').length} not configured</h2><p className="muted">{health.health_semantics ?? 'Unconfigured optional dependencies are not included in the health status.'}</p></section><section className="panel"><h2>Dependency checks</h2><div className="health-list">{Object.entries(detail).map(([key, item]) => <div className="health-row" key={key}><div><b>{names[key] ?? key}</b><small>{item.configured ? 'Configured' : 'Optional · not configured'}</small></div><span className={`status-pill ${item.status === 'healthy' ? 'good' : item.status === 'unavailable' ? 'danger' : 'neutral'}`}>{item.status.replaceAll('_', ' ')}</span></div>)}</div></section></>}</div>
}

function StorageRecoveryWorkspace({ queue, loading, canRetry, canInspectErrors, retryingEvent, onRefresh, onRetry }: { queue: RecoveryQueue | null; loading: boolean; canRetry: boolean; canInspectErrors: boolean; retryingEvent: string | null; onRefresh: () => void; onRetry: (eventId: string) => void }) {
  const statuses: RecoveryItem['status'][] = ['PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'DEAD_LETTER']
  const fmt = (value: string | null) => value ? new Date(value).toLocaleString() : '—'
  return <div className="recovery-workspace">
    <section className="panel recovery-intro"><div className="section-head"><div><h2>Storage & ledger operations</h2><p className="muted">Organisation-scoped IPFS-to-Fabric outbox events. This view reports event processing state; it does not independently prove live IPFS pin health or ledger availability.</p></div><button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh queue'}</button></div><div className="recovery-boundary"><b>Recovery boundary</b><span>Manual retry only requeues eligible failed anchor events. It does not recreate IPFS objects, overwrite documents or guarantee a successful Fabric commit.</span></div></section>
    {!queue && <section className="panel"><p className="muted">{loading ? 'Loading recovery events…' : 'Recovery queue data is not available. Refresh to try again.'}</p></section>}
    {queue && <>
      <div className="recovery-stat-grid">{statuses.map(status => <div className="stat-card recovery-stat" key={status}><span>{status.replaceAll('_',' ')}</span><strong>{queue.counts?.[status] ?? 0}</strong></div>)}</div>
      <section className="panel"><div className="section-head"><div><h2>Recovery event queue</h2><p className="muted">Showing up to {queue.limit} most recent organisation-owned events.</p></div><span className="status-pill info">{queue.items.length} events</span></div>
        {queue.truncated_possible && <div className="alert warning" role="status">This queue may be truncated. Counts describe the returned items only, not the organisation's complete event history.</div>}
        <div className="table-wrap"><table><caption className="sr-only">IPFS and Fabric recovery events</caption><thead><tr><th>Event</th><th>Document version</th><th>Status</th><th>Attempts</th><th>Created</th><th>Last error</th><th>Action</th></tr></thead><tbody>{queue.items.map(item => <tr key={item.event_id}><td><code>{item.event_id.slice(0,8)}…</code></td><td><code>{item.document_version_id.slice(0,8)}…</code></td><td><span className={`status-pill ${item.status === 'COMPLETED' ? 'good' : item.status === 'DEAD_LETTER' ? 'danger' : item.status === 'RETRY' ? 'warning' : 'neutral'}`}>{item.status.replaceAll('_',' ')}</span><small>Available: {fmt(item.available_at)}</small></td><td>{item.attempts}</td><td>{fmt(item.created_at)}</td><td className="recovery-error">{canInspectErrors ? (item.last_error || '—') : (item.last_error ? 'Failure details restricted to administrators' : '—')}</td><td>{canRetry && ['RETRY','DEAD_LETTER'].includes(item.status) ? <button className="tiny" disabled={retryingEvent === item.event_id} onClick={() => onRetry(item.event_id)}>{retryingEvent === item.event_id ? 'Requeuing…' : 'Requeue event'}</button> : '—'}</td></tr>)}</tbody></table>{queue.items.length === 0 && <p className="empty">No IPFS-to-Fabric outbox events were returned for this organisation.</p>}</div>
        {!canRetry && <p className="footnote">Requeue controls are restricted to organisation administrators and system administrators.</p>}
      </section>
    </>}
  </div>
}

type VerificationHistoryItem = { verification_result_id: string; verification_request_id: string; document_title: string; document_version_id: string; version_number: number; filename: string; request_status: string; record_status: string; issuer_trust: string; signature_status: string; hash_status: string; lifecycle_status: string; storage_status: string; risk_category: string; summary: string | null; created_at: string | null }

function VerificationHistory({ rows, offset, hasMore, onPage, onEvidence, onDownload }: { rows: VerificationHistoryItem[]; offset: number; hasMore: boolean; onPage: (offset: number) => void; onEvidence: (id: string) => void; onDownload: (id: string) => void }) {
  return <section className="panel"><div className="section-head"><div><h2>Verification history</h2><p className="muted">Persisted verification outcomes for this organisation. Independent evidence dimensions remain separate.</p></div><button className="secondary" onClick={() => onPage(offset)}>Refresh</button></div><div className="table-wrap"><table><caption className="sr-only">Verification history</caption><thead><tr><th>Document</th><th>Submitted</th><th>Record</th><th>Issuer</th><th>Signature</th><th>Hash</th><th>Lifecycle</th><th>Risk</th><th>Evidence</th><th>Report</th></tr></thead><tbody>{rows.map(row => <tr key={row.verification_result_id}><td><b>{row.document_title}</b><small>v{row.version_number} · {row.filename}</small></td><td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td><td>{row.record_status.replaceAll('_',' ')}</td><td>{row.issuer_trust.replaceAll('_',' ')}</td><td>{row.signature_status.replaceAll('_',' ')}</td><td>{row.hash_status.replaceAll('_',' ')}</td><td>{row.lifecycle_status.replaceAll('_',' ')}</td><td><span className="status-pill info">{row.risk_category.replaceAll('_',' ')}</span></td><td><button className="tiny" onClick={() => onEvidence(row.verification_result_id)}>Inspect snapshot</button></td><td><button className="tiny" onClick={() => onDownload(row.verification_result_id)}>Download PDF</button></td></tr>)}</tbody></table>{rows.length === 0 && <p className="empty">No verification results are recorded for this organisation yet.</p>}</div><div className="section-head history-pagination"><button className="secondary" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - 25))}>← Previous</button><small>Showing {rows.length ? offset + 1 : 0}–{offset + rows.length}</small><button className="secondary" disabled={!hasMore} onClick={() => onPage(offset + 25)}>Next →</button></div></section>
}

function EvidenceSnapshotView({ evidence }: { evidence: Record<string, unknown> }) {
  const payload = (evidence.evidence ?? evidence.evidence_json ?? evidence) as unknown
  const integrity = String(evidence.integrity_status ?? 'NOT_REPORTED')
  return <div><div className="verification-findings"><div className="verification-finding"><span>Snapshot integrity</span><b>{integrity.replaceAll('_', ' ')}</b></div><div className="verification-finding"><span>Canonicalisation</span><b>{String(evidence.canonicalization_version ?? 'Not recorded')}</b></div></div><p className="footnote">Stored SHA-256: <code className="digest">{String(evidence.stored_sha256 ?? 'Not available')}</code></p><p className="muted">Integrity is recomputed by the evidence API against the stored digest. It is not externally anchored and does not independently confer legal authenticity.</p><pre className="evidence-json">{JSON.stringify(payload, null, 2)}</pre></div>
}

type NativeVerification = {
  verification_request_id: string; verification_result_id: string; evidence_snapshot_id: string;
  final_disposition?: string; record_status?: string; issuer_trust?: string; signature_status?: string;
  integrity_status?: string; lifecycle_status?: string; ai_status?: string; risk_category?: string;
  review_status?: string; presented_file?: { filename?: string; byte_size?: number; sha256?: string; registered_hash_match?: boolean };
  detached_signature?: { provided?: boolean; status?: string; key_id?: string };
  fabric?: Record<string, unknown>; ipfs?: Record<string, unknown>; limitations?: string[];
  [key: string]: unknown;
}

function VerificationFileCheck({ version, token, onError }: { version: Version; token: string; onError: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<NativeVerification | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const run = async () => {
    if (!file) { input.current?.click(); return }
    const form = new FormData(); form.append('file', file); form.append('check_fabric', 'true'); form.append('check_ipfs', 'true')
    setBusy(true); setResult(null)
    try {
      const response = await request<NativeVerification>(`/api/v1/verification/documents/versions/${version.id}/verify-file`, { method: 'POST', body: form }, token)
      setResult(response)
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'File verification failed.') }
    finally { setBusy(false) }
  }
  const finding = (label: string, value?: unknown) => <div className="verification-finding"><span>{label}</span><b>{value === undefined || value === null || value === '' ? 'Not available' : String(value).replaceAll('_', ' ')}</b></div>
  return <div className="native-verification">
    <input ref={input} className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" aria-label={`Choose file to verify against version ${version.version_number}`} onChange={e => setFile(e.target.files?.[0] ?? null)} />
    <div className="verification-controls"><button type="button" className="tiny" disabled={busy} onClick={() => input.current?.click()}>{file ? 'Change file' : 'Choose file to verify'}</button><button type="button" className="tiny primary" disabled={busy || !file} onClick={() => void run()}>{busy ? 'Verifying…' : 'Verify file'}</button></div>
    {file && <small className="verification-file">{file.name} · {(file.size / 1024).toFixed(1)} KB</small>}
    {result && <section className="verification-result" aria-live="polite">
      <div className="verification-result-head"><b>Verification findings</b><span className="status-pill info">{String(result.final_disposition ?? 'RESULT RECORDED').replaceAll('_', ' ')}</span></div>
      <div className="verification-findings">
        {finding('Record availability', result.record_status)}{finding('Issuer trust', result.issuer_trust)}{finding('Signature validity', result.signature_status ?? result.detached_signature?.status)}{finding('Hash comparison', result.integrity_status ?? (result.presented_file?.registered_hash_match === true ? 'MATCH' : result.presented_file?.registered_hash_match === false ? 'MISMATCH' : undefined))}{finding('Document lifecycle', result.lifecycle_status)}{finding('IPFS availability', (result.ipfs as any)?.status)}{finding('AI findings', result.ai_status)}{finding('Risk category', result.risk_category)}{finding('Manual review', result.review_status)}
      </div>
      {result.presented_file?.sha256 && <details><summary>Presented file evidence</summary><p><small>Server-computed SHA-256</small></p><code className="digest">{result.presented_file.sha256}</code><p className="footnote">Evidence snapshot: {result.evidence_snapshot_id}</p></details>}
      {Array.isArray(result.limitations) && result.limitations.length > 0 && <details><summary>Verification limitations</summary><ul>{result.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></details>}
      <p className="footnote">A hash match establishes byte-level integrity against the registered digest; it does not independently establish legal authenticity or issuer authority.</p>
    </section>}
  </div>
}

function DocumentUploadDropzone({ onUpload, onError, onNotice }: { onUpload: (file: File) => Promise<void>; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const maxBytes = 20 * 1024 * 1024
  const accept = '.pdf,.png,.jpg,.jpeg,.txt'
  const submit = async (file?: File) => {
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['pdf', 'png', 'jpg', 'jpeg', 'txt'].includes(extension)) { onError('Unsupported file type. Choose a PDF, PNG, JPEG or TXT file.'); return }
    if (file.size === 0) { onError('The selected file is empty. Choose a non-empty document.'); return }
    if (file.size > maxBytes) { onError('The selected file exceeds the 20 MiB upload limit.'); return }
    setBusy(true); setFileName(file.name)
    try { await onUpload(file); onNotice('Upload received in quarantine. Safety scanning is required before further processing.') }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'The document upload failed.') }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  return <div className={`document-dropzone ${dragging ? 'is-dragging' : ''} ${busy ? 'is-busy' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) void submit(event.dataTransfer.files?.[0]) }} aria-busy={busy}>
    <input ref={inputRef} className="sr-only" type="file" accept={accept} disabled={busy} onChange={event => { void submit(event.target.files?.[0]) }} aria-label="Choose document version to upload" />
    <span className="dropzone-icon" aria-hidden="true">⇧</span>
    <div><b>{busy ? 'Uploading document…' : dragging ? 'Drop document to upload' : 'Add a document version'}</b><p>{busy ? `Transferring ${fileName}. Please keep this page open.` : 'Drag and drop a file here, or choose one from your device.'}</p><small>PDF, PNG, JPEG or TXT · Maximum 20 MiB · Uploaded files enter quarantine</small></div>
    <button type="button" className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Please wait…' : 'Browse files'}</button>
    <span className="sr-only" role="status" aria-live="polite">{busy ? `Uploading ${fileName}` : 'Upload area ready'}</span>
  </div>
}

function ProcessingStatus({ versionId, token }: { versionId: string; token: string }) {
  const [state, setState] = useState<{status:string; extraction_status:string; schema_validation_status:string}>({status:'UNKNOWN', extraction_status:'UNKNOWN', schema_validation_status:'UNKNOWN'})
  useEffect(() => { let live = true; const load = () => request<typeof state & {structured_fields_status:string}>(`/api/v1/documents/versions/${versionId}/processing-jobs`, {}, token).then(v => { if (live) setState({...v, schema_validation_status:v.schema_validation_status}) }).catch(() => undefined); void load(); const timer = window.setInterval(load, 6000); return () => { live=false; window.clearInterval(timer) } }, [versionId, token])
  return <small className="processing-state">Scan: {state.status} · Extraction: {state.extraction_status} · Schema: {state.schema_validation_status}</small>
}

function ReviewWorkspace({ rows, token, currentUserId, canDecide, onChanged, onError }: { rows: ReviewCase[]; token: string; currentUserId: string; canDecide: boolean; onChanged: () => void; onError: (message:string) => void }) {
  const { formatDate } = useLocale()
  const [selected, setSelected] = useState<ReviewCase | null>(null); const [caseSearch,setCaseSearch]=useState(''); const [statusFilter,setStatusFilter]=useState<'active'|'all'|'CLOSED'>('active'); const [priorityFilter,setPriorityFilter]=useState('all'); const [sortOrder,setSortOrder]=useState<'newest'|'oldest'>('newest'); const [casePage,setCasePage]=useState(1); const [outcome,setOutcome]=useState('ACCEPTED'); const [rationale,setRationale]=useState(''); const [refs,setRefs]=useState(''); const [escalation,setEscalation]=useState(''); const [busy,setBusy]=useState(false); const [decisionHistory,setDecisionHistory]=useState<ReviewDecisionRecord[]>([]); const [historyLoading,setHistoryLoading]=useState(false); const [assignmentFilter,setAssignmentFilter]=useState('all'); const [reviewers,setReviewers]=useState<Array<{id:string;display_name:string;role:string}>>([]); const [assignee,setAssignee]=useState(''); const [assignmentNote,setAssignmentNote]=useState(''); const [workload,setWorkload]=useState<{unassigned_active_cases:number;reviewers:Array<{user_id:string;display_name:string;active_cases:number;high_priority_cases:number;older_than_24h:number;older_than_72h:number}>;age_bucket_disclaimer:string}|null>(null); const [assignmentHistory,setAssignmentHistory]=useState<Array<{id:string;action:string;actor:string;previous_assignee_user_id:string|null;new_assignee_user_id:string|null;note:string;created_at:string|null}>>([]); const [lineage,setLineage]=useState<Array<{id:string;case_number:string;status:string;priority:string;created_at:string|null}>>([])
  useEffect(() => { request<typeof reviewers>('/api/v1/reviews/reviewers',{},token).then(setReviewers).catch(err=>onError(err instanceof Error?err.message:'Reviewer list unavailable.')); request<NonNullable<typeof workload>>('/api/v1/reviews/workload',{},token).then(setWorkload).catch(err=>onError(err instanceof Error?err.message:'Workload summary unavailable.')) }, [token, rows])
  useEffect(() => { let live = true; if (!selected) { setDecisionHistory([]); return } setHistoryLoading(true); request<ReviewDecisionRecord[]>(`/api/v1/reviews/cases/${selected.id}/decisions`, {}, token).then(items => { if(live) setDecisionHistory(items) }); request<typeof assignmentHistory>(`/api/v1/reviews/cases/${selected.id}/assignment-history`,{},token).then(items=>{if(live)setAssignmentHistory(items)}); request<typeof lineage>(`/api/v1/reviews/cases/${selected.id}/escalation-lineage`,{},token).then(items=>{if(live)setLineage(items)}).catch(err => { if(live) onError(err instanceof Error ? err.message : 'Decision history could not be loaded.') }).finally(() => { if(live) setHistoryLoading(false) }); return () => { live = false } }, [selected?.id, token])
  const assign = async () => { if(!selected)return; setBusy(true); try { const updated=await request<ReviewCase>(`/api/v1/reviews/cases/${selected.id}/assignment`,{method:'PATCH',body:JSON.stringify({assigned_to_user_id:assignee||null,note:assignmentNote})},token); setSelected(updated); setAssignmentNote(''); onChanged() } catch(err){onError(err instanceof Error?err.message:'Assignment update failed.')} finally{setBusy(false)} }
  const decide = async (e: FormEvent) => { e.preventDefault(); if(!selected)return; setBusy(true); try { await request(`/api/v1/reviews/cases/${selected.id}/decisions`,{method:'POST',body:JSON.stringify({outcome,rationale,evidence_references:refs.split('\n').map(x=>x.trim()).filter(Boolean)})},token); setRationale(''); setRefs(''); setSelected(null); onChanged() } catch(err){onError(err instanceof Error?err.message:'Decision could not be saved.')} finally{setBusy(false)} }
  const escalate = async () => { if(!selected)return; setBusy(true); try { await request(`/api/v1/reviews/cases/${selected.id}/escalate`,{method:'POST',body:JSON.stringify({reason:escalation})},token); setEscalation(''); setSelected(null); onChanged() } catch(err){onError(err instanceof Error?err.message:'Escalation failed.')} finally{setBusy(false)} }
  const filteredRows=rows.filter(item=>{
    const assignmentMatch=assignmentFilter==='all'||(assignmentFilter==='mine'&&item.assigned_to_user_id===currentUserId)||(assignmentFilter==='unassigned'&&!item.assigned_to_user_id)
    const statusMatch=statusFilter==='all'||(statusFilter==='active'&&item.status!=='CLOSED')||item.status===statusFilter
    const priorityMatch=priorityFilter==='all'||item.priority===priorityFilter
    const query=caseSearch.trim().toLowerCase()
    const searchMatch=!query||[item.case_number,item.reason,item.status,item.priority].some(value=>value.toLowerCase().includes(query))
    return assignmentMatch&&statusMatch&&priorityMatch&&searchMatch
  }).sort((a,b)=>sortOrder==='oldest'?Date.parse(a.created_at)-Date.parse(b.created_at):Date.parse(b.created_at)-Date.parse(a.created_at))
  const pageSize=12; const pageCount=Math.max(1,Math.ceil(filteredRows.length/pageSize)); const safePage=Math.min(casePage,pageCount)
  const visibleRows=filteredRows.slice((safePage-1)*pageSize,safePage*pageSize)
  return <section className="panel"><div className="workload-strip"><div><b>{workload?.unassigned_active_cases ?? '—'}</b><span>Unassigned active</span></div>{workload?.reviewers.map(r=><div key={r.user_id}><b>{r.active_cases}</b><span>{r.display_name} · {r.high_priority_cases} high/critical · {r.older_than_24h} over 24h</span></div>)}</div>{workload&&<p className="footnote">{workload.age_bucket_disclaimer}</p>}<div className="section-head"><div><h2>Reviewer case management</h2><p className="muted">Assignment, workload triage, evidence inspection and accountable decisions.</p></div><label className="filter-field">Assignment<select aria-label="Filter case assignments" value={assignmentFilter} onChange={e=>{setAssignmentFilter(e.target.value);setCasePage(1)}}><option value="all">All cases</option><option value="mine">My assigned cases</option><option value="unassigned">Unassigned cases</option></select></label></div><div className="case-toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="Search review cases" placeholder="Search case number, reason, status or priority" value={caseSearch} onChange={e=>{setCaseSearch(e.target.value);setCasePage(1)}} /></label><label className="filter-field">Status<select value={statusFilter} onChange={e=>{const value=e.target.value;if(value==='active'||value==='all'||value==='CLOSED')setStatusFilter(value);setCasePage(1)}}><option value="active">Active</option><option value="all">All statuses</option><option value="CLOSED">Closed</option></select></label><label className="filter-field">Priority<select value={priorityFilter} onChange={e=>{setPriorityFilter(e.target.value);setCasePage(1)}}><option value="all">All priorities</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select></label><label className="filter-field">Sort<select value={sortOrder} onChange={e=>setSortOrder(e.target.value as 'newest'|'oldest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><span className="table-count">{filteredRows.length} matching cases</span></div><div className="case-list">{visibleRows.map(item=><article className="case-row" key={item.id}><div className="case-symbol">◎</div><div className="case-info"><b>{item.case_number}</b><p>{item.reason}</p><small>{item.status.replaceAll('_',' ')} · {item.priority} · {formatDate(item.created_at)} · {item.assigned_to_user_id ? `Assigned: ${reviewers.find(r=>r.id===item.assigned_to_user_id)?.display_name??'Reviewer'}` : 'Unassigned'}</small><div className="row-actions"><button className="tiny" onClick={()=>{setSelected(item);setAssignee(item.assigned_to_user_id??'')}}>Open case & evidence</button></div></div><span className={`status-pill ${item.priority==='CRITICAL'||item.priority==='HIGH'?'warning':'neutral'}`}>{item.priority}</span></article>)}{visibleRows.length===0&&<p className="empty">No cases match the selected search and filters.</p>}</div>{filteredRows.length>pageSize&&<nav className="table-pagination" aria-label="Review case pages"><button className="secondary" disabled={safePage===1} onClick={()=>setCasePage(value=>Math.max(1,value-1))}>Previous</button><span>Page {safePage} of {pageCount}</span><button className="secondary" disabled={safePage===pageCount} onClick={()=>setCasePage(value=>Math.min(pageCount,value+1))}>Next</button></nav>}{selected&&<Modal title={`Review ${selected.case_number}`} onClose={()=>setSelected(null)}><div className="stack-form"><p>{selected.reason}</p>{canDecide&&selected.status!=='CLOSED'&&<section className="assignment-panel"><h3>Case ownership</h3><label>Assigned reviewer<select value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Unassigned</option>{reviewers.map(r=><option key={r.id} value={r.id}>{r.display_name} · {r.role.replaceAll('_',' ')}</option>)}</select></label><label>Handover note<input value={assignmentNote} onChange={e=>setAssignmentNote(e.target.value)} maxLength={2000} placeholder="Optional assignment context" /></label><button type="button" className="secondary" disabled={busy} onClick={()=>void assign()}>Save assignment</button></section>}<h3>Escalation lineage</h3>{lineage.length>1?<ol className="decision-history">{lineage.map(item=><li key={item.id}><b>{item.case_number}</b> · {item.status.replaceAll('_',' ')} · {item.priority}</li>)}</ol>:<p className="footnote">This case has no recorded predecessor.</p>}<h3>Assignment history</h3>{assignmentHistory.length?<ol className="decision-history">{assignmentHistory.map(item=><li key={item.id}><b>{item.action.replaceAll('_',' ')}</b><p>{item.actor} · {item.created_at?formatDate(item.created_at,{dateStyle:'medium',timeStyle:'short'}):'Timestamp unavailable'}</p>{item.note&&<small>{item.note}</small>}</li>)}</ol>:<p className="footnote">No assignment changes recorded.</p>}<h3>Evidence snapshot</h3><pre className="evidence-pre">{JSON.stringify(selected.evidence_snapshot,null,2)}</pre><p className="footnote">This snapshot is a review aid, not a replacement for live source-system verification.</p><div className="divider-line"/><h3>Decision history</h3>{historyLoading?<p className="muted" role="status">Loading decision history…</p>:decisionHistory.length===0?<p className="empty">No human decisions have been recorded for this document version.</p>:<ol className="decision-history">{decisionHistory.map(item=><li key={item.id}><div className="section-head"><b>{item.outcome.replaceAll('_',' ')}</b><small>{item.created_at ? formatDate(item.created_at,{dateStyle:'medium',timeStyle:'short'}) : 'Timestamp unavailable'}</small></div><p>{item.rationale}</p><small>Reviewer: {item.reviewer_display_name}</small>{item.evidence_references.length>0&&<p className="footnote">Evidence references: {item.evidence_references.join(' · ')}</p>}</li>)}</ol>}<p className="footnote">Human decisions are historical records and do not overwrite the automated verification evidence.</p>{canDecide&&selected.status!=='CLOSED'&&<><form className="stack-form" onSubmit={decide}><label>Decision outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="ACCEPTED">Accepted</option><option value="REJECTED">Rejected</option><option value="CONFIRMED_ISSUE">Confirmed issue</option><option value="REQUIRES_ADDITIONAL_EVIDENCE">Requires additional evidence</option></select></label><label>Rationale<textarea required minLength={10} value={rationale} onChange={e=>setRationale(e.target.value)} placeholder="Explain the decision and reasoning." /></label><label>Evidence references <span className="muted">(one per line)</span><textarea value={refs} onChange={e=>setRefs(e.target.value)} placeholder="Evidence IDs or source references" /></label><button className="primary" disabled={busy}>{busy?'Saving…':'Record decision'}</button></form><div className="divider-line"/><label>Escalation reason<textarea minLength={10} value={escalation} onChange={e=>setEscalation(e.target.value)} placeholder="Why does this case require escalation?" /></label><button className="secondary" disabled={busy||escalation.trim().length<10} onClick={()=>void escalate()}>Escalate to successor case</button></>}</div></Modal>}</section>
}

function CredentialWorkspace({issuers,token,canManage,onError,onNotice}:{issuers:Issuer[];token:string;canManage:boolean;onError:(m:string)=>void;onNotice:(m:string)=>void}) {
 const { formatDate } = useLocale()
 const [issuerId,setIssuerId]=useState(issuers.find(x=>x.status==='ACTIVE')?.id??''); const [keys,setKeys]=useState<Array<{id:string;key_id:string;algorithm:string;fingerprint_sha256:string;status:string;valid_until:string|null}>>([]); const [keyId,setKeyId]=useState(''); const [pem,setPem]=useState(''); const [busy,setBusy]=useState(false)
 useEffect(()=>{if(!issuerId){setKeys([]);return} void request<typeof keys>(`/api/v1/issuers/${issuerId}/public-keys`,{},token).then(setKeys).catch(e=>onError(e.message))},[issuerId,token])
 const register=async(e:FormEvent)=>{e.preventDefault();setBusy(true);try{await request(`/api/v1/issuers/${issuerId}/public-keys`,{method:'POST',body:JSON.stringify({key_id:keyId,public_key_pem:pem})},token);setKeyId('');setPem('');setKeys(await request<typeof keys>(`/api/v1/issuers/${issuerId}/public-keys`,{},token));onNotice('Issuer public key registered. Private keys must never be entered here.')}catch(err){onError(err instanceof Error?err.message:'Key registration failed.')}finally{setBusy(false)}}
 const revoke=async(id:string)=>{const why=window.prompt('Reason for revoking this public key (minimum 5 characters):');if(!why||why.trim().length<5)return;try{await request(`/api/v1/issuers/${issuerId}/public-keys/${encodeURIComponent(id)}/revoke`,{method:'POST',body:JSON.stringify({reason:why})},token);setKeys(await request<typeof keys>(`/api/v1/issuers/${issuerId}/public-keys`,{},token));onNotice('Public key revoked.')}catch(err){onError(err instanceof Error?err.message:'Revocation failed.')}}
 return <section className="panel"><div className="section-head"><div><h2>Issuer signing credentials</h2><p className="muted">Public-key registry only. Private key material is never accepted.</p></div></div><label className="inline-label">Issuer<select value={issuerId} onChange={e=>setIssuerId(e.target.value)}><option value="">Select issuer</option>{issuers.map(i=><option key={i.id} value={i.id}>{i.legal_name}</option>)}</select></label>{canManage&&issuerId&&<form className="stack-form credential-form" onSubmit={register}><label>Key identifier<input required value={keyId} onChange={e=>setKeyId(e.target.value)} /></label><label>Public key PEM<textarea required minLength={80} value={pem} onChange={e=>setPem(e.target.value)} placeholder="-----BEGIN PUBLIC KEY----- …" /></label><p className="footnote">Do not paste a private key, certificate bundle or secret. Supported public keys are validated by the server.</p><button className="primary" disabled={busy||!issuerId}>{busy?'Registering…':'Register public key'}</button></form>}<div className="table-wrap"><table><caption className="sr-only">Issuer public keys</caption><thead><tr><th scope="col">Key ID</th><th scope="col">Algorithm</th><th scope="col">Fingerprint SHA-256</th><th scope="col">Status</th><th scope="col">Validity</th><th scope="col">Action</th></tr></thead><tbody>{keys.map(k=><tr key={k.id}><td>{k.key_id}</td><td>{k.algorithm}</td><td><code>{k.fingerprint_sha256.slice(0,20)}…</code></td><td>{k.status}</td><td>{k.valid_until?formatDate(k.valid_until):'No end date'}</td><td>{canManage&&k.status==='ACTIVE'&&<button className="tiny danger-button" onClick={()=>void revoke(k.key_id)}>Revoke</button>}</td></tr>)}</tbody></table>{issuerId&&keys.length===0&&<p className="empty">No public keys registered for this issuer.</p>}</div></section>
}

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) { const { formatNumber } = useLocale(); return <div className="stat-card"><span>{label}</span><strong>{formatNumber(value)}</strong><small>{detail}</small></div> }
function DocumentTable({ rows, issuers, onSelect }: { rows: DocumentRecord[]; issuers: Issuer[]; onSelect: (row: DocumentRecord) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const pageSize = 8
  const issuerName = (id: string) => issuers.find(item => item.id === id)?.legal_name ?? 'Unknown issuer'
  const filtered = useMemo(() => rows.filter(row => {
    const needle = query.trim().toLocaleLowerCase()
    const matchesQuery = !needle || [row.title, row.external_reference ?? '', row.document_type, issuerName(row.issuer_id)].some(value => value.toLocaleLowerCase().includes(needle))
    return matchesQuery && (status === 'ALL' || row.status === status)
  }), [rows, issuers, query, status])
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'status') return a.status.localeCompare(b.status) || a.title.localeCompare(b.title)
    if (sort === 'oldest') return Date.parse(a.created_at) - Date.parse(b.created_at)
    return Date.parse(b.created_at) - Date.parse(a.created_at)
  }), [filtered, sort])
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize)
  useEffect(() => { setPage(1) }, [query, status, sort, rows.length])
  return <div className="document-table-workspace">
    <div className="table-tools"><label className="search-field"><span className="sr-only">Search documents</span><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, reference, issuer or type" /></label><label className="filter-field">Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option>{Array.from(new Set(rows.map(row => row.status))).sort().map(value => <option key={value}>{value}</option>)}</select></label><label className="filter-field">Sort by<select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option><option value="status">Status</option></select></label>{(query || status !== 'ALL' || sort !== 'newest') && <button className="text-button" onClick={() => { setQuery(''); setStatus('ALL'); setSort('newest') }}>Clear filters</button>}<span className="table-count" aria-live="polite">{sorted.length} of {rows.length} records</span></div>
    <div className="table-wrap"><table><caption className="sr-only">Registered documents</caption><thead><tr><th scope="col">Document</th><th scope="col">Issuer</th><th scope="col">Type</th><th scope="col">Status</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><button className="table-link" onClick={() => onSelect(row)}><b>{row.title}</b><small>{row.external_reference ?? row.id.slice(0, 8)}</small><span className="sr-only">Open document details</span></button></td><td>{issuerName(row.issuer_id)}</td><td>{row.document_type}</td><td><span className={`status-pill ${row.status === 'ACTIVE' ? 'good' : 'warning'}`}>{row.status}</span></td></tr>)}</tbody></table>{sorted.length === 0 && <p className="empty">{rows.length === 0 ? 'Nothing here yet. Register your first document to get started.' : 'No documents match these filters.'}</p>}</div>
    {sorted.length > pageSize && <nav className="table-pagination" aria-label="Document pages"><button className="secondary" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><span>Page {page} of {pageCount}</span><button className="secondary" disabled={page === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</button></nav>}
  </div>
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = `dialog-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const focusable = () => dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
    focusable()?.[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items?.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus() }
  }, [])
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="section-head"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button></div>{children}</section></div>
}
function IssuerForm({ token, onDone, onError }: { token: string; onDone: () => void; onError: (message: string) => void }) { const [code, setCode] = useState(''); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); return <form className="stack-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await request('/api/v1/issuers', { method: 'POST', body: JSON.stringify({ issuer_code: code, legal_name: name }) }, token); onDone() } catch (reason) { onError(reason instanceof Error ? reason.message : 'Could not register issuer.') } finally { setBusy(false) } }}><label>Issuer code<input required value={code} onChange={e => setCode(e.target.value)} placeholder="MINISTRY-001" /></label><label>Legal name<input required value={name} onChange={e => setName(e.target.value)} placeholder="Issuing authority's legal name" /></label><p className="footnote">New issuers are created in PENDING status and require an authorised status transition.</p><button className="primary full" disabled={busy}>{busy ? 'Saving…' : 'Create issuer'}</button></form> }
function DocumentForm({ token, issuers, onDone, onError }: { token: string; issuers: Issuer[]; onDone: () => void; onError: (message: string) => void }) { const [issuer, setIssuer] = useState(issuers.find(item => item.status === 'ACTIVE')?.id ?? ''); const [title, setTitle] = useState(''); const [type, setType] = useState(''); const [reference, setReference] = useState(''); const [busy, setBusy] = useState(false); return <form className="stack-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await request('/api/v1/documents', { method: 'POST', body: JSON.stringify({ issuer_id: issuer, title, document_type: type, external_reference: reference || null, metadata: {} }) }, token); onDone() } catch (reason) { onError(reason instanceof Error ? reason.message : 'Could not register document.') } finally { setBusy(false) } }}><label>Active issuer<select required value={issuer} onChange={e => setIssuer(e.target.value)}><option value="">Select issuer</option>{issuers.filter(item => item.status === 'ACTIVE').map(item => <option key={item.id} value={item.id}>{item.legal_name}</option>)}</select></label><label>Document title<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Degree Certificate" /></label><label>Document type<input required value={type} onChange={e => setType(e.target.value)} placeholder="e.g. EDUCATIONAL_CERTIFICATE" /></label><label>External reference <span className="muted">(optional)</span><input value={reference} onChange={e => setReference(e.target.value)} /></label><p className="footnote">Registration creates metadata only. Upload a document version separately from its record page.</p><button className="primary full" disabled={busy || !issuer}>{busy ? 'Saving…' : 'Register document'}</button></form> }


function Dashboard({documents,issuers,cases,onOpenDocument,onNavigate,canReview}:{documents:DocumentRecord[];issuers:Issuer[];cases:ReviewCase[];onOpenDocument:(row:DocumentRecord)=>void;onNavigate:(tab:Tab)=>void;canReview:boolean}) {
  const {formatDate,formatNumber}=useLocale()
  const openCases=cases.filter(item=>item.status!=='CLOSED')
  const highPriority=openCases.filter(item=>item.priority==='HIGH'||item.priority==='CRITICAL')
  const docStatuses=useMemo(()=>Object.entries(documents.reduce<Record<string,number>>((acc,row)=>{acc[row.status]=(acc[row.status]??0)+1;return acc},{})).sort((a,b)=>b[1]-a[1]),[documents])
  const issuerStatuses=useMemo(()=>Object.entries(issuers.reduce<Record<string,number>>((acc,row)=>{acc[row.status]=(acc[row.status]??0)+1;return acc},{})).sort((a,b)=>b[1]-a[1]),[issuers])
  const [documentQuery,setDocumentQuery]=useState('')
  const matchingDocuments=useMemo(()=>{const query=documentQuery.trim().toLocaleLowerCase();return [...documents].filter(row=>!query||[row.title,row.document_type,row.external_reference??'',row.status].some(value=>value.toLocaleLowerCase().includes(query))).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,6)},[documents,documentQuery])
  const recentDocuments=[...documents].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,5)
  const recentCases=[...openCases].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,4)
  const maxDoc=Math.max(1,...docStatuses.map(([,n])=>n)); const maxIssuer=Math.max(1,...issuerStatuses.map(([,n])=>n))
  return <div className="dashboard-workspace">
    <div className="dashboard-welcome"><div><p className="eyebrow">OPERATIONAL SUMMARY</p><h2>Document trust at a glance</h2><p>Live counts from the records currently loaded for your organisation.</p></div><div className="dashboard-actions">{canReview&&<button className="primary" onClick={()=>onNavigate('reviews')}>Open review queue <span aria-hidden="true">→</span></button>}<button className="secondary" onClick={()=>onNavigate('documents')}>Browse documents</button>{!canReview&&<button className="primary" onClick={()=>onNavigate('issuers')}>Issuer registry</button>}</div></div>
    <div className="stat-grid"><Stat label="Registered documents" value={documents.length} detail="Loaded organisation records"/><Stat label="Active issuers" value={issuers.filter(x=>x.status==='ACTIVE').length} detail={`${issuers.length} loaded issuer records`}/><Stat label="Open review cases" value={openCases.length} detail="Cases not marked closed"/><Stat label="High-priority reviews" value={highPriority.length} detail="High or critical priority"/></div>
    <div className="dashboard-grid">
      <section className="panel dashboard-panel"><div className="section-head"><div><h2>Document status</h2><p className="muted">Distribution of loaded registry records</p></div><button className="text-button" onClick={()=>onNavigate('documents')}>Open registry →</button></div>{docStatuses.length===0?<p className="empty">No document records are available.</p>:<div className="distribution-list">{docStatuses.map(([label,count])=><div className="distribution-row" key={label}><div className="distribution-label"><span>{label.replaceAll('_',' ')}</span><b>{formatNumber(count)}</b></div><div className="distribution-track"><span style={{width:`${count/maxDoc*100}%`}}/></div></div>)}</div>}</section>
      <section className="panel dashboard-panel"><div className="section-head"><div><h2>Issuer status</h2><p className="muted">Current issuer registry distribution</p></div><button className="text-button" onClick={()=>onNavigate('issuers')}>Open issuers →</button></div>{issuerStatuses.length===0?<p className="empty">No issuer records are available.</p>:<div className="distribution-list">{issuerStatuses.map(([label,count])=><div className="distribution-row" key={label}><div className="distribution-label"><span>{label.replaceAll('_',' ')}</span><b>{formatNumber(count)}</b></div><div className="distribution-track issuer-track"><span style={{width:`${count/maxIssuer*100}%`}}/></div></div>)}</div>}</section>
    </div>
    <section className="panel document-finder"><div className="section-head"><div><h2>Find a document</h2><p className="muted">Search loaded records by title, type, reference or status</p></div><span className="finder-count">{formatNumber(documents.length)} records</span></div><label className="finder-input"><span aria-hidden="true">⌕</span><input aria-label="Search documents" value={documentQuery} onChange={event=>setDocumentQuery(event.target.value)} placeholder="Try a document title or reference…"/><kbd>LIVE</kbd></label>{matchingDocuments.length===0?<p className="empty">{documents.length===0?'No documents have been registered.':'No documents match that search.'}</p>:<div className="recent-record-list">{matchingDocuments.map(row=><button className="recent-record" key={row.id} onClick={()=>onOpenDocument(row)}><span className="record-mark">▤</span><span className="record-copy"><b>{row.title}</b><small>{row.document_type} · {row.external_reference??row.id.slice(0,8)}</small></span><span className={`status-pill ${row.status==='ACTIVE'?'good':'neutral'}`}>{row.status.replaceAll('_',' ')}</span><small className="record-date">{formatDate(row.created_at,{dateStyle:'medium'})}</small></button>)}</div>}</section>
    <div className="section-grid"><section className="panel"><div className="section-head"><div><h2>Recently registered</h2><p className="muted">Most recently created document records</p></div><button className="text-button" onClick={()=>onNavigate('documents')}>View all →</button></div>{recentDocuments.length===0?<p className="empty">No documents have been registered.</p>:<div className="recent-record-list">{recentDocuments.map(row=><button className="recent-record" key={row.id} onClick={()=>onOpenDocument(row)}><span className="record-mark">▤</span><span className="record-copy"><b>{row.title}</b><small>{row.document_type} · {row.external_reference??row.id.slice(0,8)}</small></span><span className={`status-pill ${row.status==='ACTIVE'?'good':'neutral'}`}>{row.status.replaceAll('_',' ')}</span><small className="record-date">{formatDate(row.created_at,{dateStyle:'medium'})}</small></button>)}</div>}</section>
    <section className="panel"><div className="section-head"><div><h2>Review attention</h2><p className="muted">Most recently created open cases</p></div>{cases.length>0&&<button className="text-button" onClick={()=>onNavigate('reviews')}>Review queue →</button>}</div>{recentCases.length===0?<p className="empty">No open review cases are currently loaded.</p>:<div className="review-summary-list">{recentCases.map(item=><div className="review-summary" key={item.id}><span className={`priority-marker ${item.priority==='CRITICAL'?'critical':item.priority==='HIGH'?'high':''}`}/><div><b>{item.case_number}</b><p>{item.reason}</p><small>{item.status.replaceAll('_',' ')} · {formatDate(item.created_at,{dateStyle:'medium'})}</small></div><span className="status-pill warning">{item.priority}</span></div>)}</div>}</section></div>
    <div className="callout"><div className="callout-icon">◇</div><div><b>Evidence, not assumptions</b><p>These summaries reflect only the API records currently loaded. Hash-match rates, suspicious-document totals, blockchain transactions, IPFS availability and AI anomaly statistics are not represented unless supported by dedicated live data sources.</p></div></div>
  </div>
}
