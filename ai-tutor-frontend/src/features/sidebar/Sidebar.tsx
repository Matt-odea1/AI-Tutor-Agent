/**
 * Sidebar component for session management - ChatGPT style
 */
import { useChatStore } from '../../store/chatStore';
import { useState, useEffect, useRef } from 'react';
import { useSessions } from '../../hooks/useSessions';
import { usePrograms } from '../../hooks/usePrograms';
import { DeleteConfirmModal } from '../../shared/DeleteConfirmModal';
import { SidebarHeader } from './SidebarHeader';
import { SidebarModeSwitcher } from './SidebarModeSwitcher';
import { SidebarSessionList } from './SidebarSessionList';
import { SidebarProgramList } from './SidebarProgramList';
import { SidebarUserMenu } from './SidebarUserMenu';
import { getUserSession } from '../../utils/userSession';
import type { AppMode } from '../../types';

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

  useEffect(() => {
    if (appMode === 'ide') {
      fetchPrograms();
      return;
    }
    if (appMode) {
      fetchSessions();
    }
  }, [appMode, fetchPrograms, fetchSessions]);

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

    const handleDeleteClick = (sid: string, title: string, e: React.SyntheticEvent<HTMLElement>) => {
      e.stopPropagation();
      setDeleteConfirm({ kind: 'session', id: sid, title });
    };

    const handleDeleteProgramClick = (programId: string, title: string, e: React.SyntheticEvent<HTMLElement>) => {
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

    return (
      <aside
        className={`bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-hidden transition-[width] duration-300 ease-in-out ${
          isCollapsed ? 'w-16 items-center pl-2' : 'w-64 pl-2'
        }`}
      >
        <SidebarHeader
          setAppMode={setAppMode as (mode: AppMode | null) => void}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        />
        {appMode !== null && (
          <SidebarModeSwitcher
            appMode={appMode as 'chat' | 'ide' | 'questions'}
            handleModeChange={setAppMode as (mode: 'chat' | 'ide' | 'questions') => void}
            createNewChatSession={createNewChatSession}
            compact={isCollapsed}
          />
        )}
        <div
          className={`flex-1 overflow-y-auto py-4 px-3 space-y-2 ${
            isCollapsed ? 'opacity-0 pointer-events-none' : ''
          }`}
          aria-hidden={isCollapsed}
        >
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
        <div className={`mt-auto pb-4 ${isCollapsed ? 'w-full px-0 flex justify-center' : 'px-3'}`}>
          <SidebarUserMenu
            userEmail={userEmail}
            userInitial={userInitial}
            isUserMenuOpen={isUserMenuOpen}
            setIsUserMenuOpen={setIsUserMenuOpen}
            userMenuRef={userMenuRef}
            showDetails={!isCollapsed}
          />
        </div>
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