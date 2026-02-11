import { useState } from 'react'
import { useChatStore } from '../../store/chatStore'
import type { Message } from '../../types/chat'

interface AiAssistMessageBubbleProps {
  message: Message
}

export const AiAssistMessageBubble = ({ message }: AiAssistMessageBubbleProps) => {
  const isUser = message.role === 'user'
  const isError = message.isError
  const { codeEditor, setEditorCode, setEditorSelection } = useChatStore()
  const [lastAppliedCode, setLastAppliedCode] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

  const sanitizeText = (text: string) => {
    return text
      .split('\n')
      .map((line) => line.replace(/^#{1,6}\s+/, ''))
      .filter((line) => !/^\s*([\-*_=])\1{2,}\s*$/.test(line))
      .join('\n')
  }

  const extractEditPayload = (content: string) => {
    const editBlockRegex = /```edit\s*([\s\S]*?)```/gi
    let payload: { scope?: 'selection' | 'file'; target?: string; replacement?: string } | null = null
    let cleaned = content

    cleaned = cleaned.replace(editBlockRegex, (match, jsonBlock) => {
      if (!payload) {
        try {
          const parsed = JSON.parse(jsonBlock.trim())
          if (parsed && typeof parsed === 'object') {
            payload = {
              scope: parsed.scope,
              target: parsed.target,
              replacement: parsed.replacement,
            }
          }
        } catch (err) {
          payload = null
        }
      }
      return ''
    })

    return { cleaned: cleaned.trim(), payload }
  }

  const { cleaned, payload } = isUser
    ? { cleaned: message.content, payload: null }
    : extractEditPayload(message.content)

  const formattedContent = isUser
    ? cleaned
    : sanitizeText(cleaned)
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .trim()

  const renderContent = (content: string) => {
    const segments: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = []
    const codeBlockRegex = /```([\s\S]*?)```/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: content.slice(lastIndex, match.index) })
      }

      const block = match[1] || ''
      const [firstLine, ...rest] = block.split('\n')
      const hasLanguage = firstLine.trim().length > 0 && rest.length > 0
      const lang = hasLanguage ? firstLine.trim() : undefined
      const code = hasLanguage ? rest.join('\n') : block

      segments.push({ type: 'code', content: code.trimEnd(), lang })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      segments.push({ type: 'text', content: content.slice(lastIndex) })
    }

    return segments.map((segment, index) => {
      if (segment.type === 'code') {
        return (
          <pre
            key={`code-${index}`}
            className="mt-2 rounded-md bg-gray-900/90 px-3 py-2 text-[12px] leading-relaxed text-gray-100 whitespace-pre-wrap break-words"
          >
            <code>{segment.content}</code>
          </pre>
        )
      }

      return (
        <span key={`text-${index}`} className="whitespace-pre-wrap">
          {segment.content}
        </span>
      )
    })
  }

  const applyEdit = () => {
    if (!payload || !payload.replacement) {
      setApplyError('Missing replacement text.')
      return
    }

    const currentCode = codeEditor.code
    let nextCode = currentCode
    let applied = false

    if (payload.target) {
      const index = currentCode.indexOf(payload.target)
      if (index !== -1) {
        nextCode =
          currentCode.slice(0, index) +
          payload.replacement +
          currentCode.slice(index + payload.target.length)
        applied = true
      }
    }

    if (!applied && payload.scope === 'selection' && codeEditor.selection) {
      const selection = codeEditor.selection
      const index = currentCode.indexOf(selection)
      if (index !== -1) {
        nextCode =
          currentCode.slice(0, index) +
          payload.replacement +
          currentCode.slice(index + selection.length)
        applied = true
      }
    }

    if (!applied && payload.scope === 'file') {
      nextCode = payload.replacement
      applied = true
    }

    if (!applied) {
      setApplyError('Could not apply edit. Target not found.')
      return
    }

    setLastAppliedCode(currentCode)
    setEditorCode(nextCode)
    setEditorSelection(null)
    setApplyError(null)
  }

  const undoEdit = () => {
    if (!lastAppliedCode) return
    setEditorCode(lastAppliedCode)
    setLastAppliedCode(null)
    setApplyError(null)
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed border bg-primary-50 text-gray-800 border-primary-100'
            : `w-full max-w-full rounded-lg pl-3 pr-2 py-2 text-[13px] leading-snug break-words ${
                isError ? 'bg-amber-50 text-amber-900' : 'bg-white text-gray-800'
              }`
        }
      >
        {renderContent(formattedContent)}
        {payload && !isUser && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
            <button
              type="button"
              onClick={applyEdit}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50"
            >
              Apply
            </button>
            {lastAppliedCode && (
              <button
                type="button"
                onClick={undoEdit}
                className="rounded border border-gray-200 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50"
              >
                Undo
              </button>
            )}
            {applyError && <span className="text-amber-600">{applyError}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
