'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent, extractText } from '@/lib/aiAgent'
import { cn, generateUUID } from '@/lib/utils'
import { useLyzrAgentEvents } from '@/lib/lyzrAgentEvents'
import { AgentActivityPanel } from '@/components/AgentActivityPanel'
import { FiSend, FiRefreshCw, FiMessageCircle, FiUser, FiAlertCircle, FiWifi, FiActivity } from 'react-icons/fi'
import { HiOutlineSupport } from 'react-icons/hi'
import { RiRobot2Line } from 'react-icons/ri'
import { BiChevronDown } from 'react-icons/bi'

// ---- Constants ----
const AGENT_ID = '69789df351dd406198f85a00'
const COMCAST_LOGO = 'https://tse2.mm.bing.net/th/id/OIP.cGqaSkIuq1YMi9hUcInKUwHaFn?rs=1&pid=ImgDetMain&o=7&rm=3'
const FIRSTSOURCE_LOGO = 'https://tse4.mm.bing.net/th/id/OIP.xl5QghPA-wF_6wUJAgYQqgHaDq?rs=1&pid=ImgDetMain&o=7&rm=3'

// ---- Types ----
interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: string
  status: 'sending' | 'sent' | 'error'
  errorMessage?: string
}

// ---- Markdown Renderer ----
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">{part}</strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm leading-relaxed">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>
      })}
    </div>
  )
}

// ---- Audio Notification ----
function playNotificationChime() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc1 = audioCtx.createOscillator()
    const osc2 = audioCtx.createOscillator()
    const gain = audioCtx.createGain()

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(783.99, audioCtx.currentTime)

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(audioCtx.destination)

    osc1.start(audioCtx.currentTime)
    osc2.start(audioCtx.currentTime + 0.08)
    osc1.stop(audioCtx.currentTime + 0.4)
    osc2.stop(audioCtx.currentTime + 0.48)

    setTimeout(() => audioCtx.close(), 600)
  } catch {
    // Silently fail if audio context not available
  }
}

// ---- Typing Indicator Component ----
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5 max-w-[85%]">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
        <RiRobot2Line className="w-4 h-4 text-white" />
      </div>
      <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-white/75 backdrop-blur-md border border-white/20 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// ---- Welcome Card ----
function WelcomeCard() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/25">
        <HiOutlineSupport className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2" style={{ letterSpacing: '-0.01em' }}>Welcome to Xfinity Support</h2>
      <p className="text-sm text-muted-foreground text-center max-w-sm" style={{ lineHeight: '1.55' }}>
        Thank you for contacting Xfinity, you are connected with an expert. How may I assist you?
      </p>
      <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
        <FiWifi className="w-3.5 h-3.5 text-green-500" />
        <span>Agent Online</span>
      </div>
    </div>
  )
}

// ---- Message Bubble ----
function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage
  onRetry: (id: string) => void
}) {
  const isUser = message.role === 'user'
  const isError = message.status === 'error'
  const isSending = message.status === 'sending'

  return (
    <div className={cn('flex items-end gap-2.5 max-w-[85%]', isUser ? 'ml-auto flex-row-reverse' : '')}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
          <RiRobot2Line className="w-4 h-4 text-white" />
        </div>
      )}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-md">
          <FiUser className="w-4 h-4 text-white" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 shadow-sm transition-opacity duration-200',
            isUser
              ? 'rounded-br-md bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/15'
              : 'rounded-bl-md bg-white/75 backdrop-blur-md border border-white/20',
            isSending && 'opacity-60',
            isError && !isUser && 'border-red-200 bg-red-50/80'
          )}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap" style={{ lineHeight: '1.55' }}>{message.content}</p>
          ) : (
            <div className="text-foreground">{renderMarkdown(message.content)}</div>
          )}
        </div>
        <div className={cn('flex items-center gap-2 px-1', isUser ? 'justify-end' : 'justify-start')}>
          <span className="text-[10px] text-muted-foreground">{message.timestamp}</span>
          {isError && (
            <div className="flex items-center gap-1.5">
              <FiAlertCircle className="w-3 h-3 text-destructive" />
              <span className="text-[10px] text-destructive">{message.errorMessage || 'Failed to send'}</span>
              <button
                onClick={() => onRetry(message.id)}
                className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 transition-colors"
              >
                <FiRefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Scroll-to-bottom FAB ----
function ScrollToBottomButton({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  if (!visible) return null
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-border shadow-lg text-xs text-muted-foreground hover:text-foreground transition-all duration-200 hover:shadow-xl"
    >
      <BiChevronDown className="w-4 h-4" />
      <span>New messages</span>
    </button>
  )
}

// ---- Main Page Component ----
export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showBackendPanel, setShowBackendPanel] = useState(false)
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  const [userAutoScrollPaused, setUserAutoScrollPaused] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  const userIdRef = useRef('')
  const sessionIdRef = useRef('')
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastAgentMsgCountRef = useRef(0)

  // Agent activity monitoring
  const agentActivity = useLyzrAgentEvents(sessionIdRef.current || null)

  // Initialize user_id and session_id on mount
  useEffect(() => {
    userIdRef.current = generateUUID()
    sessionIdRef.current = generateUUID()
  }, [])

  // Format time helper
  const formatTime = useCallback(() => {
    const now = new Date()
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }, [])

  // Auto-scroll logic
  useEffect(() => {
    if (!userAutoScrollPaused && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, isLoading, userAutoScrollPaused])

  // Detect user scroll
  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setUserAutoScrollPaused(!isAtBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
      setUserAutoScrollPaused(false)
    }
  }, [])

  // Play chime when new agent message arrives
  useEffect(() => {
    const agentMsgCount = messages.filter((m) => m.role === 'agent').length
    if (agentMsgCount > lastAgentMsgCountRef.current) {
      playNotificationChime()
    }
    lastAgentMsgCountRef.current = agentMsgCount
  }, [messages])

  // Auto-resize textarea
  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [])

  // Send message
  const sendMessage = useCallback(
    async (overrideContent?: string) => {
      const content = overrideContent || inputValue.trim()
      if (!content || isLoading) return

      const userMsgId = generateUUID()
      const time = formatTime()

      const userMessage: ChatMessage = {
        id: userMsgId,
        role: 'user',
        content,
        timestamp: time,
        status: 'sent',
      }

      setMessages((prev) => [...prev, userMessage])
      if (!overrideContent) setInputValue('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      setIsLoading(true)
      setActiveAgentId(AGENT_ID)
      agentActivity.setProcessing(true)
      setUserAutoScrollPaused(false)

      try {
        const result = await callAIAgent(content, AGENT_ID, {
          user_id: userIdRef.current,
          session_id: sessionIdRef.current,
        })

        if (result.success) {
          let responseText = extractText(result.response)
          if (!responseText && result.response?.result) {
            const r = result.response.result
            responseText = r.text || r.message || r.response || r.answer || r.answer_text || r.summary || r.content || ''
            if (!responseText && typeof r === 'string') responseText = r
          }
          if (!responseText) {
            responseText = result.response?.message || result.raw_response || 'No response received.'
          }

          const agentMessage: ChatMessage = {
            id: generateUUID(),
            role: 'agent',
            content: responseText,
            timestamp: formatTime(),
            status: 'sent',
          }
          setMessages((prev) => [...prev, agentMessage])
        } else {
          const errorMsg = result.error || result.response?.message || 'Unable to connect. Please try again.'

          const agentErrorMessage: ChatMessage = {
            id: generateUUID(),
            role: 'agent',
            content: 'Sorry, I was unable to process your request.',
            timestamp: formatTime(),
            status: 'error',
            errorMessage: errorMsg,
          }
          setMessages((prev) => [...prev, agentErrorMessage])
        }
      } catch {
        const agentErrorMessage: ChatMessage = {
          id: generateUUID(),
          role: 'agent',
          content: 'Sorry, an unexpected error occurred.',
          timestamp: formatTime(),
          status: 'error',
          errorMessage: 'Network error. Please check your connection.',
        }
        setMessages((prev) => [...prev, agentErrorMessage])
      } finally {
        setIsLoading(false)
        setActiveAgentId(null)
        agentActivity.setProcessing(false)
      }
    },
    [inputValue, isLoading, formatTime, agentActivity]
  )

  // Retry failed message
  const handleRetry = useCallback(
    (errorMsgId: string) => {
      const errorIndex = messages.findIndex((m) => m.id === errorMsgId)
      if (errorIndex < 0) return

      let userContent = ''
      for (let i = errorIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userContent = messages[i].content
          break
        }
      }
      if (!userContent) return

      setMessages((prev) => prev.filter((m) => m.id !== errorMsgId))
      sendMessage(userContent)
    },
    [messages, sendMessage]
  )

  // New chat
  const handleNewChat = useCallback(() => {
    setMessages([])
    sessionIdRef.current = generateUUID()
    setInputValue('')
    setShowNewChatConfirm(false)
    setUserAutoScrollPaused(false)
    setActiveAgentId(null)
    agentActivity.reset()
    lastAgentMsgCountRef.current = 0
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [agentActivity])

  // Handle key press
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage]
  )

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(230, 50%, 95%) 0%, hsl(260, 45%, 94%) 40%, hsl(220, 50%, 95%) 70%, hsl(200, 45%, 94%) 100%)' }}>
      {/* ========== HEADER ========== */}
      <header className="flex-shrink-0 w-full z-30 border-b border-white/20" style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div className="w-full px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <img src={COMCAST_LOGO} alt="Comcast" className="h-8 w-auto object-contain rounded" />
              <div className="w-px h-6 bg-border" />
              <img src={FIRSTSOURCE_LOGO} alt="Firstsource Solutions" className="h-7 w-auto object-contain rounded" />
            </div>
            <div className="w-px h-6 bg-border hidden sm:block" />
            <span className="text-sm font-semibold text-foreground hidden sm:inline" style={{ letterSpacing: '-0.01em' }}>Xfinity Support</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Backend Logic Toggle */}
            <button
              onClick={() => setShowBackendPanel(!showBackendPanel)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                showBackendPanel
                  ? 'bg-blue-500/10 text-blue-600 border border-blue-200'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              )}
              title="Toggle Backend Logic Panel"
            >
              <FiActivity className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Backend Logic</span>
              {agentActivity.isConnected && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              )}
            </button>

            {/* New Chat */}
            <div className="relative">
              <button
                onClick={() => setShowNewChatConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all duration-200"
                title="New Chat"
              >
                <FiRefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Chat</span>
              </button>
              {showNewChatConfirm && (
                <div className="absolute top-full right-0 mt-2 w-56 rounded-xl p-3 border border-border shadow-xl z-50" style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)' }}>
                  <p className="text-xs text-foreground font-medium mb-2">Clear this conversation?</p>
                  <p className="text-[11px] text-muted-foreground mb-3">This will start a new session. Current messages will be lost.</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowNewChatConfirm(false)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleNewChat}
                      className="flex-1 px-2.5 py-1.5 rounded-lg text-xs text-white bg-destructive hover:bg-destructive/90 transition-colors font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Overlay to close new chat confirm */}
      {showNewChatConfirm && (
        <div className="fixed inset-0 z-20" onClick={() => setShowNewChatConfirm(false)} />
      )}

      {/* ========== MAIN CONTENT: CHAT + SIDE PANEL ========== */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ---- Chat Column ---- */}
        <div className={cn('flex flex-col transition-all duration-300 ease-in-out', showBackendPanel ? 'w-[60%]' : 'w-full')}>
          {/* Chat Messages */}
          <div className="flex-1 min-h-0 flex justify-center">
            <div className={cn('w-full flex flex-col relative', !showBackendPanel && 'max-w-3xl')}>
              <div
                ref={chatContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-4"
              >
                {messages.length === 0 ? (
                  <WelcomeCard />
                ) : (
                  <div className="space-y-4 pb-2">
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} onRetry={handleRetry} />
                    ))}
                    {isLoading && <TypingIndicator />}
                  </div>
                )}
              </div>

              <ScrollToBottomButton onClick={scrollToBottom} visible={userAutoScrollPaused && messages.length > 0} />
            </div>
          </div>

          {/* Input Bar */}
          <div className="flex-shrink-0 w-full border-t border-white/20 z-30" style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
            <div className={cn('mx-auto px-4 py-3', !showBackendPanel && 'max-w-3xl')}>
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-white/80 backdrop-blur-md shadow-sm px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all duration-200">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value)
                    handleTextareaInput()
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground max-h-[120px] py-1"
                  style={{ letterSpacing: '-0.01em', lineHeight: '1.55' }}
                  disabled={isLoading}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!inputValue.trim() || isLoading}
                  className={cn(
                    'flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200',
                    inputValue.trim() && !isLoading
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-105 active:scale-95'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  )}
                >
                  {isLoading ? (
                    <FiRefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FiSend className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">Press Enter to send, Shift+Enter for a new line</p>
            </div>
          </div>

          {/* Agent Info Footer */}
          <div className="flex-shrink-0 border-t border-white/10 px-4 py-2" style={{ background: 'rgba(255,255,255,0.5)' }}>
            <div className={cn('mx-auto flex items-center justify-between', !showBackendPanel && 'max-w-3xl')}>
              <div className="flex items-center gap-2">
                <FiMessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Powered by</span>
                <span className="text-[11px] font-medium text-foreground">Master Orchestrator</span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">| Xfinity Customer Support Agent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={cn('w-1.5 h-1.5 rounded-full', activeAgentId ? 'bg-amber-400 animate-pulse' : 'bg-green-500')} />
                <span className="text-[11px] text-muted-foreground">{activeAgentId ? 'Processing' : 'Ready'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Backend Logic Side Panel ---- */}
        <div className={cn(
          'flex-shrink-0 border-l border-white/20 transition-all duration-300 ease-in-out overflow-hidden',
          showBackendPanel ? 'w-[40%] opacity-100' : 'w-0 opacity-0'
        )} style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)' }}>
          {showBackendPanel && (
            <AgentActivityPanel
              isConnected={agentActivity.isConnected}
              events={agentActivity.events}
              thinkingEvents={agentActivity.thinkingEvents}
              lastThinkingMessage={agentActivity.lastThinkingMessage}
              activeAgentId={agentActivity.activeAgentId}
              activeAgentName={agentActivity.activeAgentName}
              isProcessing={agentActivity.isProcessing}
              showPanel={true}
            />
          )}
        </div>
      </div>
    </div>
  )
}
