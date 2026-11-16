import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  Clock3,
  Inbox as InboxIcon,
  Instagram,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Page = 'overview' | 'inbox' | 'settings'
type Account = {
  connected: boolean
  username?: string
  ig_user_id?: string
  connected_at?: string
  token_expires_at?: string
  webhook_subscribed?: boolean
  meta_configured: boolean
  ai_configured: boolean
}
type AppSettings = {
  automation_enabled: boolean
  personality: string
  business_context: string
  ai_configured: boolean
}
type Conversation = {
  id: number
  participant_username: string
  participant_id: string
  last_message_at: string
  last_inbound_at?: string | null
  latest_intent: string
  priority: string
  is_spam: boolean
  human_takeover: boolean
  needs_human: boolean
  message_count: number
  last_message: string
  last_direction: string
}
type ChatMessage = {
  id: number
  direction: string
  text: string
  is_automated: boolean
  created_at: string
}
type Analytics = {
  inbound_7d: number
  outbound_7d: number
  automated_7d: number
  collaborations: number
  spam_detected: number
  priority_needs_human: number
  reply_rate: number
  daily: { date: string; inbound: number; outbound: number }[]
}

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

let csrfToken = ''

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(path, { ...options, method, headers, credentials: 'include' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') csrfToken = ''
    throw new ApiError(payload.detail || 'Something went wrong. Please try again.', response.status)
  }
  return payload as T
}

function cx(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(' ')
}

function formatTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function initials(value: string) {
  return value.replace(/^@/, '').slice(0, 2).toUpperCase() || 'IG'
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cx(
      'grid shrink-0 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-[#7755c9] via-[#533987] to-[#2c2340] font-bold text-white shadow-glow',
      size === 'sm' && 'h-10 w-10 rounded-xl text-xs',
      size === 'md' && 'h-12 w-12 text-sm',
      size === 'lg' && 'h-14 w-14 text-base',
    )}>
      {initials(name)}
    </div>
  )
}

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'purple' }) {
  const styles = {
    neutral: 'border-white/10 bg-white/[0.04] text-slate-300',
    green: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    amber: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
    red: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
    purple: 'border-violet-300/20 bg-violet-300/10 text-violet-200',
  }
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize', styles[tone])}>{children}</span>
}

function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
  className,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
  type?: 'button' | 'submit'
  className?: string
}) {
  const variants = {
    primary: 'border border-violet-300/20 bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-[0_8px_24px_rgba(123,84,224,.22)] hover:brightness-110',
    secondary: 'border border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/[0.09]',
    ghost: 'border border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-white',
  }
  return <button type={type} onClick={onClick} disabled={disabled} className={cx('inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', variants[variant], className)}>{children}</button>
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label || 'Toggle'} onClick={() => onChange(!checked)} className={cx('relative h-7 w-12 rounded-full border transition', checked ? 'border-violet-300/30 bg-violet-500' : 'border-white/10 bg-white/10')}>
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[23px]' : 'left-0.5')} />
    </button>
  )
}

function Metric({ icon: Icon, label, value, footnote, accent }: { icon: LucideIcon; label: string; value: string | number; footnote: string; accent: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-3 font-display text-3xl font-bold tracking-tight text-white">{value}</p>
        </div>
        <div className={cx('grid h-11 w-11 place-items-center rounded-xl border', accent)}><Icon size={19} /></div>
      </div>
      <p className="mt-4 text-xs text-slate-500">{footnote}</p>
    </div>
  )
}

function EmptyState({ icon: Icon, title, detail, action }: { icon: LucideIcon; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[270px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-violet-300/10 bg-violet-400/[0.08] text-lavender"><Icon size={23} /></div>
      <h3 className="font-display text-base font-bold text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const navItems: { id: Page; title: string; icon: LucideIcon }[] = [
  { id: 'overview', title: 'Overview', icon: LayoutDashboard },
  { id: 'inbox', title: 'Inbox', icon: InboxIcon },
  { id: 'settings', title: 'AI settings', icon: SettingsIcon },
]

export default function App() {
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [page, setPage] = useState<Page>('overview')
  const [account, setAccount] = useState<Account | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [thread, setThread] = useState<{ conversation: Conversation; messages: ChatMessage[] } | null>(null)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)

  const loadWorkspace = useCallback(async () => {
    const [accountData, settingsData, conversationData, analyticsData] = await Promise.all([
      api<Account>('/api/instagram/account'),
      api<AppSettings>('/api/settings'),
      api<Conversation[]>('/api/conversations?limit=100'),
      api<Analytics>('/api/analytics'),
    ])
    setAccount(accountData)
    setSettings(settingsData)
    setConversations(conversationData)
    setAnalytics(analyticsData)
  }, [])

  useEffect(() => {
    api<{ authenticated: boolean; username: string; csrf_token: string }>('/api/auth/me')
      .then(async (session) => {
        csrfToken = session.csrf_token
        setUsername(session.username)
        setAuthenticated(true)
        await loadWorkspace()
      })
      .catch((error: Error) => {
        if (!(error instanceof ApiError) || error.status !== 401) setToast(`Backend connection: ${error.message}`)
      })
      .finally(() => setReady(true))
  }, [loadWorkspace])

  useEffect(() => {
    if (!authenticated) return
    const result = new URLSearchParams(window.location.search).get('connect')
    if (result) {
      const message = result === 'success'
        ? 'Instagram connected. You can review the webhook status in settings.'
        : result === 'webhook'
          ? 'Account connected, but Meta did not confirm the message webhook subscription.'
          : 'Instagram connection did not finish. Check Meta configuration and try again.'
      setToast(message)
      window.history.replaceState({}, '', window.location.pathname)
      loadWorkspace().catch((error: Error) => setToast(error.message))
    }
  }, [authenticated, loadWorkspace])

  useEffect(() => {
    if (!selectedId || !authenticated) {
      setThread(null)
      return
    }
    api<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/conversations/${selectedId}`)
      .then(setThread)
      .catch((error: Error) => setToast(error.message))
  }, [selectedId, authenticated])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 5000)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    const form = new FormData(event.currentTarget)
    try {
      const result = await api<{ authenticated: boolean; csrf_token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      })
      csrfToken = result.csrf_token
      setUsername(String(form.get('username') || 'admin'))
      setAuthenticated(true)
      await loadWorkspace()
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not sign in.')
    } finally {
      setLoading(false)
      setReady(true)
    }
  }

  async function toggleAutomation(value: boolean) {
    if (!settings) return
    try {
      const updated = await api<AppSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify({ automation_enabled: value }) })
      setSettings(updated)
      setToast(value ? 'Automation enabled.' : 'Automation paused.')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not update automation.')
    }
  }

  async function saveSettings(personality: string, businessContext: string) {
    const updated = await api<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ personality, business_context: businessContext }),
    })
    setSettings(updated)
    setToast('AI preferences saved.')
  }

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' })
    } catch {
      // Clear the local view even if the session has already expired.
    }
    csrfToken = ''
    setAuthenticated(false)
    setUsername('')
    setAccount(null)
    setSettings(null)
  }

  async function reloadInbox() {
    const rows = await api<Conversation[]>('/api/conversations?limit=100')
    setConversations(rows)
    if (selectedId) {
      const data = await api<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/conversations/${selectedId}`)
      setThread(data)
    }
  }

  if (!ready) return <LoadingScreen />
  if (!authenticated) return <LoginScreen onSubmit={handleLogin} loading={loading} toast={toast} />

  const pageTitle = navItems.find((item) => item.id === page)?.title || 'Overview'

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink">
      <div className="pointer-events-none fixed -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-purple-700/[0.12] blur-[120px]" />
      <div className="pointer-events-none fixed -right-52 top-1/4 h-[480px] w-[480px] rounded-full bg-indigo-600/[0.08] blur-[120px]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1680px]">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/[0.06] bg-[#110e18]/90 px-5 py-6 lg:flex">
          <Brand />
          <div className="mt-12 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-600">Workspace</div>
          <nav className="mt-3 space-y-1">
            {navItems.map((item) => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)} />)}
          </nav>
          <div className="mt-auto">
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><ShieldCheck size={15} className="text-emerald-300" /> Your data stays private</div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">Instagram access tokens are stored on the server, never in this dashboard.</p>
            </div>
            <button onClick={signOut} className="mt-5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-200">
              <LogOut size={16} /> Sign out <span className="ml-auto max-w-24 truncate text-xs text-slate-600">{username}</span>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-8">
          <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-white/[0.06] bg-ink/80 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
            <div className="flex items-center gap-3">
              <div className="lg:hidden"><Brand compact /></div>
              <div className="hidden lg:block">
                <p className="text-xs text-slate-500">Workspace <span className="px-1.5 text-slate-700">/</span> <span className="text-slate-300">{pageTitle}</span></p>
                <h1 className="mt-1 font-display text-base font-bold">{pageTitle}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {account?.connected && <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 sm:flex"><span className={cx('h-1.5 w-1.5 rounded-full', account.webhook_subscribed ? 'bg-emerald-300' : 'bg-amber-300')} /><span className="max-w-28 truncate text-xs text-slate-300">@{account.username}</span></div>}
              {settings && <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 sm:flex"><span className="text-xs text-slate-400">AI {settings.automation_enabled ? 'on' : 'off'}</span><Switch checked={settings.automation_enabled} onChange={toggleAutomation} label="Toggle automation" /></div>}
              {!account?.connected && <Button onClick={() => setPage('settings')} variant="secondary" className="px-3 py-2 text-xs">Connect Instagram <ArrowRight size={14} /></Button>}
              <div className="hidden h-9 w-9 place-items-center rounded-full border border-white/10 bg-gradient-to-br from-[#3f3156] to-[#1d1928] text-xs font-bold text-lilac sm:grid">{initials(username)}</div>
            </div>
          </header>

          <div className="mx-auto max-w-[1460px] px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
            {page === 'overview' && <Overview account={account} settings={settings} analytics={analytics} conversations={conversations} onNavigate={setPage} onOpenConversation={(id) => { setSelectedId(id); setPage('inbox') }} onAutomation={toggleAutomation} />}
            {page === 'inbox' && <InboxPage account={account} conversations={conversations} selectedId={selectedId} thread={thread} onSelect={setSelectedId} onReload={reloadInbox} onToast={setToast} />}
            {page === 'settings' && <SettingsPage account={account} settings={settings} onSave={saveSettings} onAutomation={toggleAutomation} />}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-2xl border border-white/10 bg-[#1a1623]/95 p-2 shadow-2xl backdrop-blur-xl lg:hidden">
        {navItems.map((item) => <button key={item.id} onClick={() => setPage(item.id)} className={cx('flex min-w-[88px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-semibold', page === item.id ? 'bg-violet-400/10 text-lilac' : 'text-slate-500')}><item.icon size={18} />{item.title}</button>)}
      </nav>
      {toast && <div role="status" className="fixed bottom-24 right-4 z-50 flex max-w-md items-start gap-3 rounded-2xl border border-white/10 bg-[#211b2b] px-4 py-3 text-sm text-slate-200 shadow-2xl sm:bottom-6 sm:right-6"><Activity size={17} className="mt-0.5 shrink-0 text-lavender" /><span>{toast}</span><button onClick={() => setToast('')} className="ml-1 text-slate-500 hover:text-white">×</button></div>}
    </div>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-10 w-10 place-items-center rounded-[14px] border border-violet-300/20 bg-gradient-to-br from-[#a47aff] via-[#7351c6] to-[#44316d] shadow-glow">
        <Instagram size={19} className="text-white" /><span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-ink bg-emerald-300" />
      </div>
      <div><div className="font-display text-[15px] font-extrabold tracking-tight text-white">InstaMate <span className="text-lavender">AI</span></div>{!compact && <div className="mt-0.5 text-[10px] tracking-wide text-slate-500">YOUR THOUGHTFUL DM ASSISTANT</div>}</div>
    </div>
  )
}

function NavButton({ item, active, onClick }: { item: { id: Page; title: string; icon: LucideIcon }; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={cx('group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition', active ? 'border border-violet-300/10 bg-violet-400/[0.11] text-white' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200')}><item.icon size={17} className={active ? 'text-lavender' : 'text-slate-600 group-hover:text-slate-300'} />{item.title}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-lavender" />}</button>
}

function LoadingScreen() {
  return <div className="grid min-h-screen place-items-center bg-ink"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-lavender" size={18} /> Loading InstaMate…</div></div>
}

function LoginScreen({ onSubmit, loading, toast }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; loading: boolean; toast: string }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink px-4 py-10">
      <div className="pointer-events-none absolute -left-48 top-0 h-[620px] w-[620px] rounded-full bg-purple-600/[0.15] blur-[140px]" />
      <div className="pointer-events-none absolute -right-44 bottom-0 h-[550px] w-[550px] rounded-full bg-indigo-500/[0.10] blur-[130px]" />
      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 flex justify-center"><Brand /></div>
        <div className="glass rounded-[28px] p-7 shadow-2xl sm:p-9">
          <div className="mb-7"><Pill tone="purple"><ShieldCheck size={12} /> Private workspace</Pill><h1 className="mt-5 font-display text-2xl font-bold tracking-tight">Welcome back</h1><p className="mt-2 text-sm leading-6 text-slate-400">Sign in to manage your Instagram messages and automation.</p></div>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-400">Username<input required name="username" autoComplete="username" placeholder="Your workspace username" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/50" /></label>
            <label className="block text-xs font-semibold text-slate-400">Password<input required name="password" type="password" autoComplete="current-password" placeholder="Your workspace password" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/50" /></label>
            <Button type="submit" disabled={loading} className="mt-2 w-full py-3">{loading ? <LoaderCircle size={16} className="animate-spin" /> : 'Sign in'}<ArrowRight size={16} /></Button>
          </form>
          <p className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-600"><ShieldCheck size={13} /> Account credentials are stored in your server environment.</p>
          {toast && <div className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[0.07] p-3 text-xs leading-5 text-amber-100">{toast}</div>}
        </div>
        <p className="mt-5 text-center text-[11px] text-slate-600">No Instagram password is requested or stored.</p>
      </div>
    </div>
  )
}

function Overview({ account, settings, analytics, conversations, onNavigate, onOpenConversation, onAutomation }: {
  account: Account | null
  settings: AppSettings | null
  analytics: Analytics | null
  conversations: Conversation[]
  onNavigate: (page: Page) => void
  onOpenConversation: (id: number) => void
  onAutomation: (value: boolean) => void
}) {
  const chartData = useMemo(() => analytics?.daily.map((row) => ({ ...row, label: new Date(`${row.date}T00:00:00`).toLocaleDateString([], { weekday: 'short' }) })) || [], [analytics])
  const connected = Boolean(account?.connected)
  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><div className="mb-3 flex items-center gap-2 text-xs text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> YOUR INBOX, IN GOOD HANDS</div><h2 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">A calmer way to say hello.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Keep conversations moving while staying thoughtful, personal, and in control.</p></div>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => onNavigate('inbox')}><InboxIcon size={15} /> Open inbox</Button>{account?.meta_configured && !connected && <Button onClick={() => onNavigate('settings')}><Instagram size={15} /> Connect account</Button>}</div>
      </section>

      {!connected && <div className="relative overflow-hidden rounded-3xl border border-violet-300/[0.15] bg-gradient-to-br from-[#2b2040] via-[#21192f] to-[#17131f] p-6 shadow-glow sm:p-8">
        <div className="grain pointer-events-none absolute inset-0 opacity-[0.025]" /><div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-purple-400/[0.12] blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center"><div><Pill tone="purple"><Sparkles size={12} /> SETUP · STEP 1 OF 3</Pill><h3 className="mt-4 font-display text-xl font-bold">Connect your Instagram professional account</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Use Meta’s official API setup with Unified Login. You can sign in with Instagram or Facebook; InstaMate never asks for your Instagram password, and the access token stays on the server.</p><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400"><span className="flex items-center gap-2"><Check size={14} className="text-emerald-300" /> Business or Creator account</span><span className="flex items-center gap-2"><Check size={14} className="text-emerald-300" /> Official Meta authorization</span><span className="flex items-center gap-2"><Check size={14} className="text-emerald-300" /> No password collection</span></div></div><div className="flex flex-col gap-3 lg:min-w-48"><Button onClick={() => onNavigate('settings')} disabled={!account?.meta_configured}>Review connection <ArrowRight size={15} /></Button>{!account?.meta_configured && <span className="max-w-48 text-center text-[11px] leading-5 text-amber-200/70">Meta app credentials and a login configuration need to be set on the server first.</span>}</div></div>
      </div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={MessageCircle} label="Incoming messages" value={analytics?.inbound_7d ?? 0} footnote="Last 7 days" accent="border-violet-300/10 bg-violet-300/[0.08] text-lavender" />
        <Metric icon={Zap} label="AI replies sent" value={analytics?.automated_7d ?? 0} footnote="Only when automation is on" accent="border-amber-300/10 bg-amber-300/[0.08] text-amber-200" />
        <Metric icon={Users} label="Collaboration leads" value={analytics?.collaborations ?? 0} footnote="Flagged conversations" accent="border-sky-300/10 bg-sky-300/[0.08] text-sky-200" />
        <Metric icon={AlertTriangle} label="Needs your attention" value={analytics?.priority_needs_human ?? 0} footnote={`${analytics?.spam_detected ?? 0} spam messages flagged`} accent="border-rose-300/10 bg-rose-300/[0.08] text-rose-200" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <div className="glass rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-base font-bold">Conversation activity</h3><p className="mt-1 text-xs text-slate-500">Messages received and sent over the last 7 days</p></div><Pill tone="neutral"><Activity size={12} /> 7 day view</Pill></div>
          {connected && chartData.some((row) => row.inbound || row.outbound) ? <div className="mt-5 h-[240px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}><CartesianGrid stroke="#ffffff0b" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#716b7c', fontSize: 11 }} dy={10} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#716b7c', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#201b2a', border: '1px solid #ffffff16', borderRadius: 12, color: '#f5f2fa', fontSize: 12 }} /><Line type="monotone" dataKey="inbound" name="Incoming" stroke="#ad8cff" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#ad8cff' }} /><Line type="monotone" dataKey="outbound" name="Sent" stroke="#65d6b0" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#65d6b0' }} /></LineChart></ResponsiveContainer></div> : <EmptyState icon={Activity} title={connected ? 'Activity will appear here' : 'Your activity starts after setup'} detail={connected ? 'When Instagram sends new messages to your webhook, daily activity will show here.' : 'Connect an Instagram account to see real conversation and reply activity.'} />}
          {connected && chartData.some((row) => row.inbound || row.outbound) && <div className="mt-1 flex gap-5 pl-1 text-[11px] text-slate-500"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lavender" /> Incoming</span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Sent</span></div>}
        </div>

        <div className="glass rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><h3 className="font-display text-base font-bold">Assistant status</h3><p className="mt-1 text-xs text-slate-500">Your automation controls</p></div><div className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/10 bg-violet-300/[0.08] text-lavender"><Bot size={18} /></div></div>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5"><div><p className="text-sm font-semibold">Automatic replies</p><p className="mt-1 text-[11px] text-slate-500">You can pause this any time</p></div><Switch checked={Boolean(settings?.automation_enabled)} onChange={onAutomation} label="Automatic replies" /></div>
            <StatusRow title="Instagram account" ready={connected} value={connected ? `@${account?.username}` : 'Not connected'} />
            <StatusRow title="Message webhook" ready={Boolean(account?.webhook_subscribed)} value={account?.webhook_subscribed ? 'Receiving events' : connected ? 'Needs attention' : 'Waiting for account'} />
            <StatusRow title="AI provider" ready={Boolean(account?.ai_configured)} value={account?.ai_configured ? 'API key configured' : 'Add API key on server'} />
          </div>
          {settings?.automation_enabled && (!account?.connected || !account?.ai_configured || !account?.webhook_subscribed) && <div className="mt-4 rounded-xl border border-amber-200/10 bg-amber-200/[0.06] p-3 text-xs leading-5 text-amber-100"><AlertTriangle size={14} className="mr-1.5 inline" />Automation is on, but replies are held until the account, webhook, and AI provider are ready.</div>}
          <button onClick={() => onNavigate('settings')} className="mt-5 flex items-center gap-2 text-xs font-semibold text-lilac hover:text-white">Manage assistant <ArrowUpRight size={14} /></button>
        </div>
      </section>

      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:px-6"><div><h3 className="font-display text-base font-bold">Recent conversations</h3><p className="mt-1 text-xs text-slate-500">Latest activity from your Instagram inbox</p></div><button onClick={() => onNavigate('inbox')} className="flex items-center gap-1.5 text-xs font-semibold text-lilac hover:text-white">Open inbox <ArrowRight size={14} /></button></div>
        {conversations.length ? <div className="divide-y divide-white/[0.05]">{conversations.slice(0, 4).map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} onClick={() => onOpenConversation(conversation.id)} />)}</div> : <EmptyState icon={InboxIcon} title="No conversations yet" detail={connected ? 'New Instagram messages will appear here after Meta delivers them to your webhook.' : 'Connect Instagram to start receiving real conversations.'} action={!connected && <Button variant="secondary" onClick={() => onNavigate('settings')}>Set up connection</Button>} />}
      </section>
    </div>
  )
}

function StatusRow({ title, value, ready }: { title: string; value: string; ready: boolean }) {
  return <div className="flex items-center justify-between gap-3 px-1"><span className="text-xs text-slate-400">{title}</span><span className={cx('flex items-center gap-1.5 text-[11px]', ready ? 'text-emerald-300' : 'text-slate-500')}><span className={cx('h-1.5 w-1.5 rounded-full', ready ? 'bg-emerald-300' : 'bg-slate-600')} />{value}</span></div>
}

function ConversationRow({ conversation, onClick }: { conversation: Conversation; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.025] sm:px-6"><Avatar name={conversation.participant_username} size="sm" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-slate-200">@{conversation.participant_username}</span>{conversation.needs_human && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />}</div><p className="mt-0.5 break-all text-[9px] text-slate-600">IG ID: {conversation.participant_id}</p><p className="mt-1 truncate text-xs text-slate-500">{conversation.last_direction === 'out' ? 'You: ' : ''}{conversation.last_message || 'New conversation'}</p></div><div className="flex shrink-0 flex-col items-end gap-2"><span className="text-[10px] text-slate-600">{formatTime(conversation.last_message_at)}</span><Pill tone={conversation.latest_intent === 'collaboration' ? 'purple' : conversation.priority === 'urgent' ? 'red' : 'neutral'}>{conversation.latest_intent === 'general' ? conversation.priority : conversation.latest_intent}</Pill></div></button>
}

function InboxPage({ account, conversations, selectedId, thread, onSelect, onReload, onToast }: {
  account: Account | null
  conversations: Conversation[]
  selectedId: number | null
  thread: { conversation: Conversation; messages: ChatMessage[] } | null
  onSelect: (id: number | null) => void
  onReload: () => Promise<void>
  onToast: (message: string) => void
}) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [takeoverLoading, setTakeoverLoading] = useState(false)
  const filtered = useMemo(() => conversations.filter((row) => {
    const matchesSearch = `${row.participant_username} ${row.last_message}`.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || (filter === 'priority' && (row.priority === 'high' || row.priority === 'urgent' || row.needs_human)) || (filter === 'collaboration' && row.latest_intent === 'collaboration') || (filter === 'spam' && row.is_spam)
    return matchesSearch && matchesFilter
  }), [conversations, filter, search])
  const inWindow = thread ? Date.now() - new Date(thread.conversation.last_inbound_at || thread.conversation.last_message_at).getTime() <= 24 * 60 * 60 * 1000 : false

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!thread || !draft.trim()) return
    setSending(true)
    try {
      await api(`/api/conversations/${thread.conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ text: draft.trim() }) })
      setDraft('')
      await onReload()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not send message.')
    } finally {
      setSending(false)
    }
  }

  async function toggleTakeover() {
    if (!thread) return
    setTakeoverLoading(true)
    try {
      await api(`/api/conversations/${thread.conversation.id}/takeover`, { method: 'PATCH', body: JSON.stringify({ human_takeover: !thread.conversation.human_takeover }) })
      await onReload()
      onToast(thread.conversation.human_takeover ? 'AI may assist with this conversation again.' : 'You have taken over this conversation.')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not update takeover mode.')
    } finally {
      setTakeoverLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-lavender">CONVERSATIONS</p><h2 className="font-display text-3xl font-bold tracking-tight">Your inbox</h2><p className="mt-2 text-sm text-slate-400">Read the context, take over whenever you need to.</p></div><Pill tone={account?.connected ? 'green' : 'amber'}><span className="h-1.5 w-1.5 rounded-full bg-current" />{account?.connected ? `@${account.username}` : 'Instagram not connected'}</Pill></div>
      {!account?.connected ? <div className="glass rounded-2xl"><EmptyState icon={Instagram} title="Connect Instagram to open your inbox" detail="InstaMate only displays real messages received through Meta’s official Instagram Messaging API. There is no sample inbox data." /></div> : <div className="grid min-h-[640px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#15121c]/90 lg:grid-cols-[330px_minmax(0,1fr)]">
        <section className={cx('flex min-h-[640px] flex-col border-b border-white/[0.07] lg:border-b-0 lg:border-r', Boolean(thread) && 'hidden lg:flex')}>
          <div className="border-b border-white/[0.06] p-4"><div className="flex items-center justify-between"><div className="font-display text-sm font-bold">Messages <span className="ml-1 text-xs font-normal text-slate-500">{conversations.length}</span></div><button onClick={() => onReload().catch((error: Error) => onToast(error.message))} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white" title="Refresh inbox"><Activity size={15} /></button></div><div className="relative mt-3"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="w-full rounded-xl border border-white/[0.07] bg-black/20 py-2.5 pl-9 pr-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-violet-300/30" /></div><div className="scrollbar-hide mt-3 flex gap-1 overflow-x-auto">{[['all', 'All'], ['priority', 'Priority'], ['collaboration', 'Collab'], ['spam', 'Spam']].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={cx('shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold', filter === id ? 'bg-violet-300/10 text-lilac' : 'text-slate-500 hover:bg-white/[0.04]')}>{label}</button>)}</div></div>
          <div className="flex-1 overflow-y-auto">{filtered.length ? filtered.map((row) => <button key={row.id} onClick={() => onSelect(row.id)} className={cx('flex w-full items-center gap-3 border-b border-white/[0.045] px-4 py-4 text-left transition hover:bg-white/[0.03]', selectedId === row.id && 'bg-violet-400/[0.07]')}><Avatar name={row.participant_username} size="sm" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-xs font-semibold text-slate-200">@{row.participant_username}</span>{row.needs_human && <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />}</div><p className="mt-0.5 break-all text-[9px] text-slate-600">IG ID: {row.participant_id}</p><p className="mt-1 truncate text-[11px] text-slate-500">{row.last_direction === 'out' ? 'You: ' : ''}{row.last_message || 'New conversation'}</p><div className="mt-2 flex gap-1.5">{row.latest_intent === 'collaboration' && <Pill tone="purple">Collaboration</Pill>}{row.priority === 'urgent' && <Pill tone="red">Urgent</Pill>}{row.human_takeover && <Pill tone="amber">Manual</Pill>}</div></div><span className="self-start pt-1 text-[9px] text-slate-600">{formatTime(row.last_message_at)}</span></button>) : <div className="px-5 py-16 text-center text-xs text-slate-500">No conversations match this view.</div>}</div>
          <div className="border-t border-white/[0.06] p-3 text-center text-[10px] text-slate-600">Only conversations delivered by Instagram appear here.</div>
        </section>

        <section className={cx('flex min-h-[640px] min-w-0 flex-col', !thread && 'hidden lg:flex')}>
          {thread ? <>
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5 sm:px-6"><div className="flex min-w-0 items-center gap-3"><button onClick={() => onSelect(null)} className="mr-1 text-xs text-slate-500 hover:text-white lg:hidden">←</button><Avatar name={thread.conversation.participant_username} size="sm" /><div className="min-w-0"><div className="truncate text-sm font-semibold">@{thread.conversation.participant_username}</div><div className="mt-1 break-all text-[10px] text-slate-500">Instagram ID: {thread.conversation.participant_id}</div><div className="mt-1 flex flex-wrap gap-1.5">{thread.conversation.latest_intent !== 'general' && <Pill tone={thread.conversation.latest_intent === 'collaboration' ? 'purple' : 'neutral'}>{thread.conversation.latest_intent}</Pill>}{thread.conversation.priority !== 'normal' && <Pill tone={thread.conversation.priority === 'urgent' ? 'red' : 'amber'}>{thread.conversation.priority} priority</Pill>}</div></div></div><Button variant={thread.conversation.human_takeover ? 'primary' : 'secondary'} onClick={toggleTakeover} disabled={takeoverLoading} className="shrink-0 px-3 py-2 text-xs">{takeoverLoading ? <LoaderCircle size={14} className="animate-spin" /> : <ShieldCheck size={14} />}{thread.conversation.human_takeover ? 'You’re in control' : 'Take over'}</Button></div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">{thread.messages.length ? thread.messages.map((message) => <div key={message.id} className={cx('flex', message.direction === 'out' ? 'justify-end' : 'justify-start')}><div className={cx('max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[72%]', message.direction === 'out' ? 'rounded-br-md border border-violet-300/10 bg-gradient-to-br from-[#6949a9] to-[#4c3779] text-white' : 'rounded-bl-md border border-white/[0.06] bg-white/[0.045] text-slate-200')}><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p><div className={cx('mt-2 flex items-center justify-end gap-1.5 text-[9px]', message.direction === 'out' ? 'text-white/50' : 'text-slate-600')}>{message.is_automated && <><Bot size={10} /> AI · </>}{formatTime(message.created_at)}</div></div></div>) : <EmptyState icon={MessageCircle} title="This conversation has no messages" detail="Messages received from Instagram will be shown here." />}</div>
            {thread.conversation.needs_human && !thread.conversation.human_takeover && <div className="mx-4 mb-3 rounded-xl border border-amber-200/10 bg-amber-200/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-100 sm:mx-6"><AlertTriangle size={14} className="mr-1.5 inline" />This conversation is flagged for your review. Automation will not reply to it.</div>}
            <form onSubmit={send} className="border-t border-white/[0.06] p-4 sm:p-5"><div className="rounded-2xl border border-white/[0.09] bg-black/20 p-2 focus-within:border-violet-300/30"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={1000} disabled={!inWindow} placeholder={inWindow ? 'Write a thoughtful reply…' : 'Instagram’s 24-hour messaging window has passed.'} className="max-h-36 w-full resize-y bg-transparent px-2 py-1.5 text-sm leading-6 text-white outline-none placeholder:text-slate-600 disabled:cursor-not-allowed" /><div className="flex items-center justify-between px-1 pt-1"><span className="flex items-center gap-1.5 text-[10px] text-slate-600"><Clock3 size={12} />{inWindow ? 'Within Instagram’s standard reply window' : 'Reply window closed'}</span><Button type="submit" disabled={!inWindow || !draft.trim() || sending} className="px-3 py-2 text-xs">{sending ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={13} />} Send</Button></div></div></form>
          </> : <EmptyState icon={MessageCircle} title="Choose a conversation" detail="Select a message on the left to read the thread and reply." />}
        </section>
      </div>}
    </div>
  )
}

function SettingsPage({ account, settings, onSave, onAutomation }: {
  account: Account | null
  settings: AppSettings | null
  onSave: (personality: string, businessContext: string) => Promise<void>
  onAutomation: (value: boolean) => void
}) {
  const [personality, setPersonality] = useState(settings?.personality || '')
  const [businessContext, setBusinessContext] = useState(settings?.business_context || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setPersonality(settings?.personality || ''); setBusinessContext(settings?.business_context || '') }, [settings?.personality, settings?.business_context])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await onSave(personality, businessContext)
      setMessage('Saved. The AI will use these preferences for future messages.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save preferences.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-lavender">CONTROL ROOM</p><h2 className="font-display text-3xl font-bold tracking-tight">AI settings</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Set the assistant’s tone, give it accurate business facts, and decide when it may reply.</p></div>

      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] p-5 sm:p-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-violet-300/10 bg-violet-300/[0.08] text-lavender"><Bot size={19} /></div><div><h3 className="font-display text-sm font-bold">Reply automation</h3><p className="mt-1 text-xs text-slate-500">Pause or resume AI replies globally</p></div></div><div className="flex items-center gap-3"><Pill tone={settings?.automation_enabled ? 'green' : 'neutral'}>{settings?.automation_enabled ? 'Active' : 'Paused'}</Pill><Switch checked={Boolean(settings?.automation_enabled)} onChange={onAutomation} label="Reply automation" /></div></div>
        <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6"><MiniInfo icon={Instagram} title="Instagram" detail={account?.connected ? `Connected as @${account.username}` : 'Not connected'} ready={Boolean(account?.connected)} /><MiniInfo icon={Activity} title="Message webhook" detail={account?.webhook_subscribed ? 'Subscribed to message events' : 'Needs Meta configuration'} ready={Boolean(account?.webhook_subscribed)} /><MiniInfo icon={Sparkles} title="AI provider" detail={settings?.ai_configured ? 'Server API key is set' : 'Configure the key on the server'} ready={Boolean(settings?.ai_configured)} /></div>
        {account?.connected && !account.webhook_subscribed && <div className="mx-5 mb-5 rounded-xl border border-amber-200/10 bg-amber-200/[0.06] p-4 text-xs leading-5 text-amber-100 sm:mx-6"><AlertTriangle size={14} className="mr-1.5 inline" />Meta did not confirm the webhook subscription. Check that the app has message permissions and that its Instagram webhook is configured, then reconnect the account.</div>}
      </section>

      <section className="glass rounded-2xl p-5 sm:p-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-pink-300/10 bg-pink-300/[0.07] text-pink-200"><Instagram size={19} /></div><div><h3 className="font-display text-sm font-bold">Instagram connection</h3><p className="mt-1 text-xs text-slate-500">Official Instagram API with Unified Login</p></div></div>
        <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold">{account?.connected ? `@${account.username}` : 'No account connected'}{account?.connected && <Pill tone="green">Connected</Pill>}</div><p className="mt-1 text-xs text-slate-500">{account?.connected ? account.token_expires_at ? `Token expires: ${formatDate(account.token_expires_at)} · access token hidden` : 'Meta system token · access token hidden from browser' : 'Your Instagram password is never shared with this app.'}</p></div>{account?.meta_configured ? <a href="/api/instagram/oauth/start" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.09]"><Instagram size={14} />{account?.connected ? 'Reconnect account' : 'Connect Instagram'}</a> : <Pill tone="amber"><AlertTriangle size={12} />Server credentials missing</Pill>}</div>
          {!account?.meta_configured && <p className="mt-4 max-w-2xl text-xs leading-5 text-slate-500">Before connecting, add your Meta App ID, App Secret, exact OAuth redirect URI, and webhook verify token to the backend environment file. The redirect URI must also be listed in your Meta app settings.</p>}
          {account?.connected && <p className="mt-3 text-[10px] text-slate-600">Instagram account ID: {account.ig_user_id}</p>}
        </div>
      </section>

      <section className="glass rounded-2xl p-5 sm:p-6"><div className="mb-5"><h3 className="font-display text-sm font-bold">How should your assistant sound?</h3><p className="mt-1 text-xs leading-5 text-slate-500">This is guidance for the AI. It does not override safety rules or Instagram’s messaging policies.</p></div>
        <form onSubmit={submit} className="space-y-5"><label className="block text-xs font-semibold text-slate-300">Personality<textarea value={personality} onChange={(event) => setPersonality(event.target.value)} maxLength={1200} rows={3} placeholder="Warm, concise, helpful, and natural…" className="mt-2 w-full resize-y rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-violet-300/30" /><span className="mt-1 block text-right text-[10px] font-normal text-slate-600">{personality.length}/1200</span></label>
          <label className="block text-xs font-semibold text-slate-300">Verified business facts<textarea value={businessContext} onChange={(event) => setBusinessContext(event.target.value)} maxLength={3000} rows={5} placeholder="Add accurate details the assistant may use, such as your business name, products, hours, shipping policy, or public contact information. Leave blank if you have not verified the facts." className="mt-2 w-full resize-y rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-violet-300/30" /><span className="mt-1 block text-right text-[10px] font-normal text-slate-600">{businessContext.length}/3000</span></label>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex max-w-xl items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-300" />Sensitive messages and messages needing facts you haven’t provided are held for a human review.</p><Button type="submit" disabled={saving}>{saving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Save preferences</Button></div>
          {message && <p role="status" className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-slate-300">{message}</p>}
        </form>
      </section>

      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"><div className="flex items-start gap-3"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-300" /><div><h3 className="text-sm font-semibold text-slate-200">Designed for safe handoff</h3><p className="mt-1 text-xs leading-5 text-slate-500">Take over any conversation in the inbox. Health, legal, credential, payment, threat, abuse, and other sensitive messages are flagged for human review. The assistant is instructed not to invent facts about your business.</p></div></div></section>
    </div>
  )
}

function MiniInfo({ icon: Icon, title, detail, ready }: { icon: LucideIcon; title: string; detail: string; ready: boolean }) {
  return <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4"><div className="flex items-center justify-between"><Icon size={16} className="text-slate-400" /><span className={cx('h-1.5 w-1.5 rounded-full', ready ? 'bg-emerald-300' : 'bg-slate-600')} /></div><h4 className="mt-4 text-xs font-semibold text-slate-300">{title}</h4><p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p></div>
}
