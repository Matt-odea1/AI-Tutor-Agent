/**
 * Chat input component - Premium design with mode selector
 */
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useChatStore } from '../../store/chatStore'
import { PEDAGOGY_MODES, type PedagogyMode } from '../../types'
import { trackMessageSent, trackCodeEditorToggled, trackModeChanged } from '../../utils/analytics'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export const ChatInput = ({
  onSend,
  disabled = false,
  placeholder = 'Ask me anything...',
}: ChatInputProps) => {
  const [input, setInput] = useState('')
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false)
  const { pedagogyMode, setPedagogyMode, codeEditor, setEditorOpen, appMode } = useChatStore()
  const modeDropdownRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const selectedMode = PEDAGOGY_MODES.find(mode => mode.id === pedagogyMode)

  // Auto-resize textarea whenever input changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px'
      const newHeight = Math.min(textareaRef.current.scrollHeight, 300)
      textareaRef.current.style.height = `${newHeight}px`
    }
  }, [input])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
        setIsModeDropdownOpen(false)
      }
    }

    if (isModeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isModeDropdownOpen])

  const handleSelectMode = (mode: PedagogyMode) => {
    const previousMode = pedagogyMode
    setPedagogyMode(mode)
    setIsModeDropdownOpen(false)
    trackModeChanged(previousMode, mode)
  }

  const handleSend = () => {
    if (!input.trim() || disabled) return
    onSend(input)
    setInput('')
    trackMessageSent(pedagogyMode)
  }
  
  const toggleCodeEditor = () => {
    const newState = !codeEditor.isOpen
    setEditorOpen(newState)
    trackCodeEditorToggled(newState)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-2 pt-5 pb-5 relative">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end space-x-2 h-[40px]">
          {appMode !== 'chat' && (
            <>
              {/* Code Editor Toggle */}
              <button
                onClick={toggleCodeEditor}
                className={`rounded-lg border px-3 py-[7px] font-medium text-sm transition-all flex items-center space-x-1.5 flex-shrink-0 h-[40px] ${
                  codeEditor.isOpen
                    ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                title={codeEditor.isOpen ? 'Close Code Editor' : 'Open Code Editor'}
                aria-label={codeEditor.isOpen ? 'Close Code Editor' : 'Open Code Editor'}
                aria-pressed={codeEditor.isOpen}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span className="hidden sm:inline">{codeEditor.isOpen ? 'Editor' : 'Code'}</span>
              </button>
              
              {/* Mode Selector - Custom Dropdown */}
              <div className="relative flex-shrink-0" ref={modeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                  className="flex items-center space-x-1.5 rounded-lg border border-gray-300 bg-white px-3 pr-8 py-[7px] text-sm font-medium text-gray-900 hover:bg-gray-50 focus:outline-none transition-all cursor-pointer h-[40px]"
                  aria-label={`Change pedagogy mode. Current: ${selectedMode?.name}`}
                  aria-haspopup="listbox"
                  aria-expanded={isModeDropdownOpen}
                >
                  <span className="text-base">{selectedMode?.icon}</span>
                  <span className="hidden sm:inline">{selectedMode?.name}</span>
                </button>
                
                {/* Dropdown Icon */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg 
                    className={`w-4 h-4 text-gray-400 transition-transform ${isModeDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Dropdown Menu */}
                {isModeDropdownOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 animate-fade-in">
                    {PEDAGOGY_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleSelectMode(mode.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                          mode.id === pedagogyMode ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <span className="text-2xl">{mode.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-gray-900 text-sm">
                                {mode.name}
                              </span>
                              {mode.id === pedagogyMode && (
                                <svg className="w-4 h-4 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                              {mode.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          
          <div className="flex-1 relative flex flex-col justify-end">
            {/* User guide above textarea (absolute positioning) */}
            <div className="absolute bottom-full left-0 mb-0.5 px-1 pointer-events-none">
              {!disabled && !input ? (
                <p className="text-[10px] text-gray-400 leading-tight whitespace-nowrap">
                  <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-medium">Enter</kbd> send • 
                  <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-medium ml-0.5">Shift+Enter</kbd> new line
                </p>
              ) : disabled ? (
                <div className="flex items-center space-x-1.5">
                  <div className="w-1 h-1 bg-primary-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-medium text-primary-600">AI is thinking...</span>
                </div>
              ) : null}
            </div>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              rows={1}
              aria-label="Message input"
              aria-multiline="true"
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-[7px] focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-600 placeholder-gray-400 leading-tight transition-colors scrollbar-hide"
              style={{
                minHeight: '40px',
                maxHeight: '300px',
                overflowY: 'auto',
                height: '40px',
              }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={disabled || !input.trim()}
            className="rounded-lg bg-primary-600 px-6 py-[7px] font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-1.5 flex-shrink-0 h-[40px]"
            aria-label="Send message"
          >
            <span>{disabled ? 'Sending...' : 'Send'}</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
