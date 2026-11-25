import { useEffect, useRef, useState } from 'react'
import { ArrowUpLeft, Check, Copy, ListChecks, MessageCircle, Plus, SendHorizontal, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useServicePrices } from '../lib/hooks'
import { linkedText } from '../lib/format'
import { normalizeSearch } from '../lib/search'
import { matchServices, queryTokens, serviceTitle, type ServiceMatch } from '../lib/serviceMatch'
import { billerCategoryLabel, serviceCategoryLabel, serviceCategoryPath, type ServicePrice } from '../lib/types'
import type { SearchPage } from './PageSearch'
import Modal from './Modal'
import TransactionForm from './TransactionForm'

interface Message {
  id: number
  role: 'user' | 'bot'
  text: string
  results?: ServiceMatch[]
  pages?: SearchPage[]
}

const SUGGESTIONS = ['السعودية للطاقة', 'المفوتر 021', 'تجديد الإقامة', 'تأشيرة']

const WELCOME: Message = {
  id: 0,
  role: 'bot',
  text: 'أهلاً! اكتب اسم الخدمة أو الجهة أو رقم المفوتر، وسأعرض لك الكود والخطوات فوراً.',
}

/** Floating quick-help chat: finds services (code, type, steps) and pages from a free-text question. */
export default function AssistantPanel({ pages }: { pages: SearchPage[] }) {
  const [open, setOpen] = useState(false)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('.modal-backdrop, .palette-backdrop')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className={`assistant-fab${open ? ' is-open' : ''}`}
        onClick={() => {
          setStarted(true)
          setOpen((current) => !current)
        }}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={open ? 'إغلاق المساعد' : 'فتح المساعد'}
        title="المساعد"
      >
        {open ? <X size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
        {!open && <span className="assistant-fab-label">المساعد</span>}
      </button>

      {/* Mounted on first open and kept, so the conversation survives closing the panel. */}
      {started && <AssistantBody open={open} pages={pages} onClose={() => setOpen(false)} />}
    </>
  )
}

function AssistantBody({ open, pages, onClose }: { open: boolean; pages: SearchPage[]; onClose: () => void }) {
  const { services, loading, error } = useServicePrices()
  // Service pages are admin-only, so only admins get clickable cards.
  const { isAdmin } = useAuth()
  const [adding, setAdding] = useState<ServicePrice | null>(null)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [draft, setDraft] = useState('')
  const nextId = useRef(1)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function ask(question: string) {
    const text = question.trim()
    if (!text) return
    const results = matchServices(services, text)
    const tokens = queryTokens(text)
    const pageHits = tokens.length
      ? pages.filter((page) => tokens.every((token) => normalizeSearch(page.label).includes(token))).slice(0, 4)
      : []
    const reply = results.length
      ? results.length === 1
        ? 'وجدت هذه الخدمة:'
        : `وجدت ${results.length} نتائج قريبة:`
      : pageHits.length
        ? 'لم أجد خدمة بهذا الاسم، لكن هذه صفحات قريبة:'
        : 'لم أجد خدمة بهذا الاسم. جرّب كلمة أخرى من اسم الجهة، أو اكتب رقم المفوتر.'
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: 'user', text },
      { id: nextId.current++, role: 'bot', text: reply, results, pages: pageHits },
    ])
    setDraft('')
  }

  return (
    <section
      id="assistant-panel"
      className="assistant-panel"
      role="dialog"
      aria-label="المساعد السريع"
      hidden={!open}
    >
      <header className="assistant-head">
        <span className="assistant-head-icon" aria-hidden="true">
          <Sparkles size={18} />
        </span>
        <div className="assistant-head-text">
          <h2>المساعد السريع</h2>
          <p>ابحث عن خدمة، كود مفوتر أو خطوات</p>
        </div>
        <button type="button" className="assistant-close" onClick={onClose} aria-label="إغلاق المساعد">
          <X size={16} />
        </button>
      </header>

      <div className="assistant-messages" ref={listRef} aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`assistant-msg ${message.role}`}>
            <p className="assistant-bubble">{message.text}</p>
            {message.id === 0 && (
              <div className="assistant-chips">
                {SUGGESTIONS.map((item) => (
                  <button key={item} type="button" className="assistant-chip" onClick={() => ask(item)}>
                    {item}
                  </button>
                ))}
              </div>
            )}
            {message.results?.map((match) => (
              <ResultCard
                key={match.service.id}
                match={match}
                canOpen={isAdmin}
                onOpen={onClose}
                onAdd={() => setAdding(match.service)}
              />
            ))}
            {message.pages && message.pages.length > 0 && (
              <div className="assistant-chips">
                {message.pages.map((page) => (
                  <Link key={page.to} to={page.to} className="assistant-chip assistant-page" onClick={onClose}>
                    {page.label}
                    <ArrowUpLeft size={13} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="assistant-hint">جارٍ تحميل الخدمات…</p>}
        {error && <p className="assistant-hint is-error">تعذر تحميل الخدمات: {error}</p>}
      </div>

      <form
        className="assistant-input"
        onSubmit={(event) => {
          event.preventDefault()
          ask(draft)
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="مثال: وزارة الطاقة أو 002"
          aria-label="اكتب سؤالك"
          autoComplete="off"
          disabled={loading}
        />
        <button type="submit" disabled={!draft.trim() || loading} aria-label="إرسال">
          <SendHorizontal size={18} aria-hidden="true" style={{ transform: 'scaleX(-1)' }} />
        </button>
      </form>

      <Modal
        title="إضافة معاملة"
        subtitle={adding ? serviceTitle(adding.name) : undefined}
        open={Boolean(adding)}
        onClose={() => setAdding(null)}
      >
        {adding && (
          <TransactionForm
            key={adding.id}
            initialService={adding}
            onCancel={() => setAdding(null)}
            onSaved={() => {
              const name = serviceTitle(adding.name)
              setAdding(null)
              setMessages((current) => [
                ...current,
                { id: nextId.current++, role: 'bot', text: `✓ تمت إضافة معاملة «${name}» بنجاح.` },
              ])
            }}
          />
        )}
      </Modal>
    </section>
  )
}

/** Page that lists this service, with ?service= so the page scrolls to and highlights it. */
function servicePageUrl(service: ServicePrice): string {
  const base =
    service.category === 'fawateer'
      ? `${serviceCategoryPath.fawateer}/${service.biller_category ?? 'communications'}`
      : serviceCategoryPath[service.category]
  return `${base}?service=${encodeURIComponent(service.id)}`
}

function ResultCard({
  match,
  canOpen,
  onOpen,
  onAdd,
}: {
  match: ServiceMatch
  canOpen: boolean
  onOpen: () => void
  onAdd: () => void
}) {
  const { service, code } = match
  const [copied, setCopied] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const steps = service.steps?.trim()
  const url = servicePageUrl(service)

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the code is still visible to copy by hand.
    }
  }

  return (
    <article className="assistant-card">
      <h3>{serviceTitle(service.name)}</h3>
      <div className="assistant-meta">
        {code && (
          <button type="button" className="assistant-code" onClick={() => void copyCode()} title="نسخ الكود">
            <span>الكود</span>
            <strong dir="ltr">{code}</strong>
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          </button>
        )}
        <span className="assistant-tag">{serviceCategoryLabel[service.category]}</span>
        {service.biller_category && <span className="assistant-tag">{billerCategoryLabel[service.biller_category]}</span>}
      </div>
      {steps ? (
        <>
          <button
            type="button"
            className="assistant-steps-toggle"
            onClick={() => setShowSteps((current) => !current)}
            aria-expanded={showSteps}
          >
            <ListChecks size={15} aria-hidden="true" />
            {showSteps ? 'إخفاء الخطوات' : 'عرض الخطوات'}
          </button>
          {showSteps && <p className="assistant-steps">{linkedText(steps)}</p>}
        </>
      ) : (
        <p className="assistant-nosteps">لا توجد خطوات مسجلة لهذه الخدمة بعد.</p>
      )}
      <div className="assistant-actions">
        <button type="button" className="assistant-add" onClick={onAdd}>
          <Plus size={15} aria-hidden="true" />
          إضافة معاملة
        </button>
        {canOpen && (
          <Link to={url} className="assistant-open" onClick={onOpen}>
            فتح صفحة الخدمة
            <ArrowUpLeft size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  )
}
