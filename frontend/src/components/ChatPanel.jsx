import { useState, useRef, useEffect, useCallback } from 'react'
import { useAnalysisContext } from '../context/AnalysisContext'
import { chatMessage } from '../utils/api'

const STARTER_QUESTIONS = [
  "What's the main entry point?",
  "Why was this architecture chosen?",
  "What would break if I removed the auth module?",
  "Explain the data flow",
]

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-fossil-400 dark:bg-fossil-500 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-fossil-400 dark:bg-fossil-500 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-fossil-400 dark:bg-fossil-500 animate-bounce [animation-delay:300ms]" />
      </div>
      <span className="text-[11px] text-fossil-400 dark:text-fossil-500 ml-1">Thinking...</span>
    </div>
  )
}

function MessageBubble({ message, onFileClick }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <div
        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
          isUser
            ? 'bg-accent text-white rounded-br-sm'
            : 'bg-fossil-100 dark:bg-fossil-700 text-fossil-800 dark:text-fossil-200 rounded-bl-sm'
        }`}
      >
        {/* Render message content with basic formatting */}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {/* Referenced files (assistant messages only) */}
        {!isUser && message.referenced_files && message.referenced_files.length > 0 && (
          <div className="mt-2 pt-2 border-t border-fossil-200 dark:border-fossil-600 flex flex-wrap gap-1">
            {message.referenced_files.map((file) => (
              <button
                key={file}
                onClick={() => onFileClick(file)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-mono hover:bg-accent/20 transition-colors"
                title={`Highlight ${file} in graph`}
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {file.split('/').pop()}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const { state, dispatch } = useAnalysisContext()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleFileClick = useCallback(
    (fileId) => {
      // Find the node in the graph and select it
      const graph = state.analysisResult?.dependency_graph
      if (!graph) return
      const node = graph.nodes.find(
        (n) => n.id === fileId || n.id.endsWith(fileId) || fileId.endsWith(n.id)
      )
      if (node) {
        dispatch({ type: 'SELECT_NODE', payload: { id: node.id, data: node } })
      }
    },
    [state.analysisResult, dispatch]
  )

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading || !state.repoUrl) return

      const userMessage = { role: 'user', content: trimmed }
      setMessages((prev) => [...prev, userMessage])
      setInput('')
      setIsLoading(true)

      try {
        // Build history from existing messages (for Gemini context)
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const response = await chatMessage(state.repoUrl, trimmed, history)

        const assistantMessage = {
          role: 'assistant',
          content: response.reply,
          referenced_files: response.referenced_files || [],
        }
        setMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        const errorContent =
          err?.response?.data?.detail || 'Failed to get a response. Please try again.'
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: errorContent, referenced_files: [] },
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, state.repoUrl, messages]
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleClear = () => {
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with clear button */}
      {!isEmpty && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-fossil-200 dark:border-fossil-700 flex-shrink-0">
          <span className="text-[11px] font-medium text-fossil-500 dark:text-fossil-400">
            {messages.filter((m) => m.role === 'user').length} message{messages.filter((m) => m.role === 'user').length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleClear}
            className="text-[10px] px-2 py-1 rounded bg-fossil-100 dark:bg-fossil-700 text-fossil-500 dark:text-fossil-400 hover:text-fossil-700 dark:hover:text-fossil-300 hover:bg-fossil-200 dark:hover:bg-fossil-600 transition-colors"
          >
            Clear chat
          </button>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto fossil-scrollbar px-3 py-3 space-y-3">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4 animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-fossil-700 dark:text-fossil-300">
                Ask about this codebase
              </p>
              <p className="text-[11px] text-fossil-400 dark:text-fossil-500 max-w-[200px]">
                I have the full analysis loaded. Ask me anything about the architecture, files, or decisions.
              </p>
            </div>

            {/* Starter questions */}
            <div className="space-y-1.5 w-full max-w-[260px]">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={isLoading}
                  className="w-full text-left px-3 py-2 rounded-lg border border-fossil-200 dark:border-fossil-600 bg-white dark:bg-fossil-800 text-[11px] text-fossil-600 dark:text-fossil-400 hover:border-accent hover:text-accent dark:hover:text-accent transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} onFileClick={handleFileClick} />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="flex-shrink-0 border-t border-fossil-200 dark:border-fossil-700 p-2"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this codebase..."
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-lg border border-fossil-200 dark:border-fossil-600 bg-white dark:bg-fossil-800 px-3 py-2 text-xs text-fossil-800 dark:text-fossil-200 placeholder:text-fossil-400 dark:placeholder:text-fossil-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50 fossil-scrollbar"
            style={{ maxHeight: '80px' }}
            onInput={(e) => {
              // Auto-resize textarea
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}
