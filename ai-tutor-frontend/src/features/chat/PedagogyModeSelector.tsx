/**
 * Pedagogy mode selector component - Custom dropdown with descriptions
 */
import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../../store/chatStore'
import { PEDAGOGY_MODES } from '../../types/pedagogy'
import type { PedagogyMode } from '../../types/pedagogy'

export const PedagogyModeSelector = () => {
  const { pedagogyMode, setPedagogyMode } = useChatStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedMode = PEDAGOGY_MODES.find(mode => mode.id === pedagogyMode)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelectMode = (mode: PedagogyMode) => {
    setPedagogyMode(mode)
    setIsOpen(false)
  }

  return (
    <div className="px-4 py-2 border-b border-gray-200 bg-white">
      <div className="max-w-4xl mx-auto flex items-center space-x-3">
        <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
          Mode:
        </label>
        
        <div className="relative" ref={dropdownRef}>
          {/* Trigger Button */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 pr-8 text-sm font-medium text-gray-900 hover:border-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all cursor-pointer"
          >
            <span className="text-base">{selectedMode?.icon}</span>
            <span>{selectedMode?.name}</span>
          </button>

          {/* Dropdown Icon */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg 
              className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-fade-in">
              {PEDAGOGY_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleSelectMode(mode.id)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors ${
                    mode.id === pedagogyMode ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <span className="text-xl mt-0.5">{mode.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900 text-sm">
                          {mode.name}
                        </span>
                        {mode.id === pedagogyMode && (
                          <svg className="w-4 h-4 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        {mode.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
