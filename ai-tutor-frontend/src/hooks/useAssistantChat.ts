import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import {
  createWorkspace,
  createCodeMemory,
  createAssistantThread,
  createEditProposal,
  postAssistantMessage,
  updateCodeMemory,
  getAssistantHistory,
  listAssistantThreads,
} from '../api/historyV2'
import type { Message } from '../types/chat'
import { hashString } from '../utils/hash'

const detectEditIntent = (query: string) => {
  if (!query) return false
  const lowered = query.toLowerCase()
  const keywords = [
    'edit ',
    'change ',
    'update ',
    'modify ',
    'refactor ',
    'fix ',
    'implement ',
    'write ',
    'create ',
    'generate ',
    'build ',
    'add ',
    'remove ',
    'rewrite ',
    'replace ',
    'optimize ',
    'rename ',
  ]
  return keywords.some((token) => lowered.includes(token))
}

export const useAssistantChat = () => {
  const {
    assistantMessages,
    assistantThreadId,
    workspaceId,
    codeMemoryId,
    codeEditor,
    addAssistantMessage,
    setAssistantMessages,
    setAssistantThreadId,
    setWorkspaceId,
    setCodeMemoryId,
    setLoading,
    setError,
    isLoading,
  } = useChatStore()

  const ensureWorkspaceAndMemory = useCallback(async () => {
    let currentWorkspaceId = workspaceId
    if (!currentWorkspaceId) {
      const workspace = await createWorkspace('AI Assistant')
      currentWorkspaceId = workspace.workspace_id
      setWorkspaceId(currentWorkspaceId)
    }

    let currentCodeMemoryId = codeMemoryId
    if (!currentCodeMemoryId) {
      const memory = await createCodeMemory(currentWorkspaceId, codeEditor.code, 'python')
      currentCodeMemoryId = memory.code_memory_id
      setCodeMemoryId(currentCodeMemoryId)
    }

    return { workspaceId: currentWorkspaceId, codeMemoryId: currentCodeMemoryId }
  }, [workspaceId, codeMemoryId, codeEditor.code, setWorkspaceId, setCodeMemoryId])

  const loadHistory = useCallback(async (threadId?: string) => {
    const activeThreadId = threadId || assistantThreadId
    if (!activeThreadId) return
    const history = await getAssistantHistory(activeThreadId)
    const messages: Message[] = history.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      tokens: msg.tokens,
      context_ids: msg.context_ids,
    }))
    setAssistantMessages(messages)
  }, [assistantThreadId, setAssistantMessages])

  const loadThreads = useCallback(async () => {
    if (!codeMemoryId) return []
    const result = await listAssistantThreads(codeMemoryId)
    return result.threads
  }, [codeMemoryId])

  const createNewThread = useCallback(async () => {
    const { codeMemoryId: resolvedCodeMemoryId } = await ensureWorkspaceAndMemory()
    await updateCodeMemory(
      resolvedCodeMemoryId,
      codeEditor.code,
      codeEditor.lastOutput,
      codeEditor.lastError
    )
    const thread = await createAssistantThread(resolvedCodeMemoryId, 'New Thread')
    setAssistantThreadId(thread.thread_id)
    setAssistantMessages([])
    return thread.thread_id
  }, [codeEditor.code, codeEditor.lastError, codeEditor.lastOutput, ensureWorkspaceAndMemory, setAssistantMessages, setAssistantThreadId])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return

      const userMessage: Message = {
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      }
      addAssistantMessage(userMessage)
      setError(null)
      setLoading(true)

      try {
        const { codeMemoryId: resolvedCodeMemoryId } = await ensureWorkspaceAndMemory()
        let threadId = assistantThreadId
        if (!threadId) {
          const trimmed = content.trim()
          const firstLine = trimmed.split('\n')[0]?.trim() || 'Assistant Thread'
          const title = firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine
          const thread = await createAssistantThread(resolvedCodeMemoryId, title)
          threadId = thread.thread_id
          setAssistantThreadId(threadId)
        }

        await updateCodeMemory(
          resolvedCodeMemoryId,
          codeEditor.code,
          codeEditor.lastOutput,
          codeEditor.lastError
        )

        if (detectEditIntent(content)) {
          const bufferHash = await hashString(codeEditor.code || '')
          const response = await createEditProposal({
            query: content.trim(),
            thread_id: threadId,
            include_history: true,
            pedagogy_mode: 'concise',
            editor_code: codeEditor.code,
            editor_selection: codeEditor.selection,
            last_stdout: codeEditor.lastOutput,
            last_error: codeEditor.lastError,
            language: 'python',
            buffer_hash: bufferHash,
          })

          const hasEditBlock = response.answer.includes('```edit')
          const editBlockPayload = response.edit_block
            ? {
                version: '1',
                ...response.edit_block,
                buffer_hash: response.buffer_hash || bufferHash,
              }
            : null
          const editBlockText = editBlockPayload
            ? `\n\n\`\`\`edit\n${JSON.stringify(editBlockPayload)}\n\`\`\``
            : ''
          const assistantMessage: Message = {
            role: 'assistant',
            content: hasEditBlock ? response.answer : `${response.answer}${editBlockText}`,
            timestamp: new Date().toISOString(),
          }
          addAssistantMessage(assistantMessage)
        } else {
          const response = await postAssistantMessage(threadId, {
            query: content.trim(),
            include_history: true,
            pedagogy_mode: 'concise',
            top_k: 5,
            editor_code: codeEditor.code,
            editor_selection: codeEditor.selection,
            last_stdout: codeEditor.lastOutput,
            last_error: codeEditor.lastError,
            language: 'python',
          })

          const assistantMessage: Message = {
            role: 'assistant',
            content: response.answer,
            timestamp: new Date().toISOString(),
            tokens: response.tokens_output || undefined,
            context_ids: response.context_ids,
          }
          addAssistantMessage(assistantMessage)
        }
      } catch (err) {
        setError("I'm having trouble saving this assistant message right now.")
      } finally {
        setLoading(false)
      }
    },
    [addAssistantMessage, assistantThreadId, codeEditor, ensureWorkspaceAndMemory, isLoading, setAssistantThreadId, setError, setLoading]
  )

  return {
    messages: assistantMessages,
    isLoading,
    sendMessage,
    loadHistory,
    loadThreads,
    createNewThread,
  }
}
