/**
 * Sidebar component for session management - ChatGPT style
 */
import { useChatStore } from '../store/chatStore';
import { useState, useEffect, useRef } from 'react';
import { useSessions } from '../hooks/useSessions';
import { usePrograms } from '../hooks/usePrograms';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SidebarHeader } from './Sidebar/SidebarHeader';
import { SidebarModeSwitcher } from './Sidebar/SidebarModeSwitcher';
import { SidebarSessionList } from './Sidebar/SidebarSessionList';
import { SidebarProgramList } from './Sidebar/SidebarProgramList';
import { SidebarUserMenu } from './Sidebar/SidebarUserMenu';
import { getUserSession } from '../utils/userSession';
import type { AppMode } from '../types/appMode';

export const Sidebar = () => {
  const { sessionId, appMode, setAppMode } = useChatStore()
  const {
    sessions,
    isLoadingSessions,
    fetchSessions,
    loadSessionHistory,
    handleDeleteSession,
    createNewChatSession
  } = useSessions()
  
  const {
    programs,
    activeProgramId,
    isLoadingPrograms,
    fetchPrograms,
    loadProgram,
    removeProgram,
  } = usePrograms()

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    kind: 'session' | 'program'
    id: string
    title: string
  } | null>(null)
  
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)
  const [loadingProgramId, setLoadingProgramId] = useState<string | null>(null)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userSession = getUserSession();
  const userEmail = userSession?.email || 'User';
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || 'U';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isUserMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isUserMenuOpen]);

    const handleLoadSession = async (sid: string) => {
      if (sid === sessionId) return;
      setLoadingSessionId(sid);
      try {
        await loadSessionHistory(sid);
        window.scrollTo(0, 0);
      } catch (error) {
        console.error('Error loading session:', error);
      } finally {
        setLoadingSessionId(null);
      }
    };

    const handleDeleteClick = (sid: string, title: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleteConfirm({ kind: 'session', id: sid, title });
    };

    const handleDeleteProgramClick = (programId: string, title: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleteConfirm({ kind: 'program', id: programId, title });
    };

    const executeDelete = async () => {
      if (!deleteConfirm) return;
      try {
        if (deleteConfirm.kind === 'session') {
          await handleDeleteSession(deleteConfirm.id);
          fetchSessions();
        } else {
          await removeProgram(deleteConfirm.id);
          fetchPrograms();
        }
      } catch (error) {
        console.error('Error deleting:', error);
      } finally {
        setDeleteConfirm(null);
      }
    };

    const handleLoadProgram = async (programId: string) => {
      if (programId === activeProgramId) return;
      setLoadingProgramId(programId);
      try {
        await loadProgram(programId);
        window.scrollTo(0, 0);
      } catch (error) {
        console.error('Error loading program:', error);
      } finally {
        setLoadingProgramId(null);
      }
    };

    if (isCollapsed) {
      return (
        <aside className="w-16 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-4">
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors mb-4"
            title="Expand sidebar"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {appMode === 'chat' && (
            <button
              onClick={createNewChatSession}
              className="p-2 text-gray-400 hover:bg-gray-800 hover:text-white rounded-md border border-dashed border-gray-700"
              title="New Chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          <SidebarUserMenu
            userEmail={userEmail}
            userInitial={userInitial}
            isUserMenuOpen={isUserMenuOpen}
            setIsUserMenuOpen={setIsUserMenuOpen}
            userMenuRef={userMenuRef}
          />
        </aside>
      );
    }

    return (
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
        <SidebarHeader setAppMode={setAppMode as (mode: AppMode | null) => void} />
        {appMode !== null && (
          <SidebarModeSwitcher
            appMode={appMode as 'chat' | 'ide' | 'questions'}
            handleModeChange={setAppMode as (mode: 'chat' | 'ide' | 'questions') => void}
            createNewChatSession={createNewChatSession}
          />
        )}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-2">
          {appMode === 'ide' ? (
            <SidebarProgramList
              programs={programs}
              isLoadingPrograms={isLoadingPrograms}
              activeProgramId={activeProgramId}
              loadingProgramId={loadingProgramId}
              handleLoadProgram={handleLoadProgram}
              handleDeleteProgramClick={handleDeleteProgramClick}
            />
          ) : (
            <SidebarSessionList
              sessions={sessions}
              isLoadingSessions={isLoadingSessions}
              sessionId={sessionId}
              loadingSessionId={loadingSessionId}
              handleLoadSession={handleLoadSession}
              handleDeleteClick={handleDeleteClick}
            />
          )}
        </div>
        <SidebarUserMenu
          userEmail={userEmail}
          userInitial={userInitial}
          isUserMenuOpen={isUserMenuOpen}
          setIsUserMenuOpen={setIsUserMenuOpen}
          userMenuRef={userMenuRef}
        />
        {deleteConfirm && (
          <DeleteConfirmModal
            isOpen={!!deleteConfirm}
            onCancel={() => setDeleteConfirm(null)}
            onConfirm={executeDelete}
            sessionTitle={deleteConfirm.title}
            entityLabel={deleteConfirm.kind === 'session' ? 'Session' : 'Program'}
          />
        )}
      </aside>
    );
}