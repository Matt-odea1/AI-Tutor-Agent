import { useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'
import { useChatStore } from '../../store/chatStore'
import type { Message } from '../../types/chat'
import { hashString } from '../../utils/hash'

interface AiAssistMessageBubbleProps {
  message: Message
}

export const AiAssistMessageBubble = ({ message }: AiAssistMessageBubbleProps) => {
  const isUser = message.role === 'user'
  const isError = message.isError
  const { codeEditor, setEditorCode, setEditorSelection, setEditorDecorations, clearEditorDecorations, setEditorDeletionZones, clearEditorDeletionZones } = useChatStore()
  const [pendingEdit, setPendingEdit] = useState<{ before: string; after: string } | null>(null)
  const [autoApplied, setAutoApplied] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const sanitizeText = (text: string) => {
    return text
      .split('\n')
      .map((line) => line.replace(/^#{1,6}\s+/, ''))
      .filter((line) => !/^\s*([\-*_=])\1{2,}\s*$/.test(line))
      .join('\n')
  }

  type EditPayload = {
    version?: string
    scope?: 'selection' | 'file'
    file?: string
    target?: string
    replacement?: string
    strategy?: string
    context_before?: string
    context_after?: string
    buffer_hash?: string
  }

  const extractEditPayload = (content: string) => {
    const editBlockRegex = /```edit\s*([\s\S]*?)```/gi
    let payload: EditPayload | null = null
    let cleaned = content

    cleaned = cleaned.replace(editBlockRegex, (_match, jsonBlock) => {
      if (!payload) {
        try {
          const parsed = JSON.parse(jsonBlock.trim())
          if (parsed && typeof parsed === 'object') {
            payload = {
              version: parsed.version,
              scope: parsed.scope,
              file: parsed.file,
              target: parsed.target,
              replacement: parsed.replacement,
              strategy: parsed.strategy,
              context_before: parsed.context_before,
              context_after: parsed.context_after,
              buffer_hash: parsed.buffer_hash,
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

  const extracted = isUser
    ? { cleaned: message.content, payload: null }
    : extractEditPayload(message.content)

  const cleaned = extracted.cleaned
  const payload = extracted.payload as EditPayload | null

  const diffParts = useMemo(() => {
    if (!pendingEdit) return []
    return diffLines(pendingEdit.before, pendingEdit.after)
  }, [pendingEdit])

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

  const buildDecorations = (before: string, after: string) => {
    const parts = diffLines(before, after)
    const decorations: { startLine: number; endLine: number; className: string }[] = []

    const countLines = (value: string) => {
      if (!value) return 0
      const lines = value.split('\n')
      return value.endsWith('\n') ? lines.length - 1 : lines.length
    }

    let line = 1
    const totalLines = Math.max(1, after.split('\n').length)

    parts.forEach((part: any) => {
      const lineCount = countLines(part.value)
      if (part.added) {
        if (lineCount > 0) {
          decorations.push({
            startLine: line,
            endLine: Math.min(totalLines, line + lineCount - 1),
            className: 'editor-addition',
          })
        }
        line += lineCount
        return
      }

      if (part.removed) {
        if (lineCount > 0) {
          const markerLine = Math.min(totalLines, Math.max(1, line))
          decorations.push({
            startLine: markerLine,
            endLine: markerLine,
            className: 'editor-deletion',
          })
        }
        return
      }

      line += lineCount
    })

    return decorations
  }

  const buildDeletionZones = (before: string, after: string) => {
    const parts = diffLines(before, after)
    const zones: { line: number; content: string }[] = []

    const countLines = (value: string) => {
      if (!value) return 0
      const lines = value.split('\n')
      return value.endsWith('\n') ? lines.length - 1 : lines.length
    }

    let line = 1
    const totalLines = Math.max(1, after.split('\n').length)

    parts.forEach((part: any) => {
      const lineCount = countLines(part.value)
      if (part.added) {
        line += lineCount
        return
      }

      if (part.removed) {
        if (lineCount > 0) {
          const markerLine = Math.min(totalLines, Math.max(1, line))
          zones.push({ line: markerLine, content: part.value })
        }
        return
      }

      line += lineCount
    })

    return zones
  }

  const applyEdit = async () => {
    if (!payload || payload.replacement === undefined || payload.replacement === null) {
      setApplyError('Missing replacement text.')
      return
    }

    if (payload.version && payload.version !== '1') {
      setApplyError('Unsupported edit block version.')
      console.warn('Edit block version mismatch', payload.version)
      return
    }

    if (payload.buffer_hash) {
      const currentHash = await hashString(codeEditor.code || '')
      if (currentHash !== payload.buffer_hash) {
        setApplyError('Editor content changed since the edit was generated.')
        console.warn('Edit buffer hash mismatch', { expected: payload.buffer_hash, actual: currentHash })
        return
      }
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
      if (payload.context_before && payload.context_after) {
        const beforeIndex = currentCode.indexOf(payload.context_before)
        if (beforeIndex !== -1) {
          const afterStart = beforeIndex + payload.context_before.length
          const afterIndex = currentCode.indexOf(payload.context_after, afterStart)
          if (afterIndex !== -1) {
            nextCode =
              currentCode.slice(0, afterStart) +
              payload.replacement +
              currentCode.slice(afterIndex)
            applied = true
          }
        }
      }

      if (!applied && payload.strategy === 'replace') {
        nextCode = payload.replacement
        applied = true
      }

      if (!applied && !payload.target && !payload.context_before && !payload.context_after) {
        nextCode = payload.replacement
        applied = true
      }
    }

    if (!applied) {
      setApplyError('Could not apply edit. Target not found.')
      console.warn('Edit apply failed', payload)
      return
    }

    setPendingEdit({ before: currentCode, after: nextCode })
    setEditorCode(nextCode)
    setEditorSelection(null)
    setEditorDecorations(buildDecorations(currentCode, nextCode))
    setEditorDeletionZones(buildDeletionZones(currentCode, nextCode))
    setApplyError(null)
  }

  const acceptEdit = () => {
    setPendingEdit(null)
    clearEditorDecorations()
    clearEditorDeletionZones()
    setApplyError(null)
  }

  const revertEdit = () => {
    if (!pendingEdit) return
    setEditorCode(pendingEdit.before)
    setPendingEdit(null)
    clearEditorDecorations()
    clearEditorDeletionZones()
    setApplyError(null)
  }

  useEffect(() => {
    if (isUser || !payload || pendingEdit || autoApplied) return
    applyEdit()
    setAutoApplied(true)
  }, [autoApplied, isUser, payload, pendingEdit])

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
          <div className="mt-2 text-[11px] text-gray-500">
            {applyError && <span className="text-amber-600">{applyError}</span>}
            {pendingEdit && diffParts.length > 0 && (
              <div className="mt-2 rounded-md border border-gray-200 bg-white">
                <pre className="max-h-44 overflow-auto px-2 py-2 text-[11px] leading-relaxed">
                  {diffParts.map((part: any, index: number) => {
                    const className = part.added
                      ? 'bg-emerald-50 text-emerald-800'
                      : part.removed
                        ? 'bg-rose-50 text-rose-800'
                        : 'text-gray-500'
                    return (
                      <div key={`diff-${index}`} className={className}>
                        {part.value}
                      </div>
                    )
                  })}
                </pre>
                <div className="flex items-center gap-2 border-t border-gray-200 px-2 py-2">
                  <button
                    type="button"
                    onClick={acceptEdit}
                    className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 hover:bg-emerald-100"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={revertEdit}
                    className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700 hover:bg-rose-100"
                  >
                    Revert
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
