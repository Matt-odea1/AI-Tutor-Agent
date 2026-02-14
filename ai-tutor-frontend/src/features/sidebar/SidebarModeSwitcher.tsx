import React from 'react';
import chatIcon from '../../assets/person.png';
import ideIcon from '../../assets/code.png';
import questionIcon from '../../assets/exam.png';

interface SidebarModeSwitcherProps {
  appMode: 'chat' | 'ide' | 'questions';
  handleModeChange: (mode: 'chat' | 'ide' | 'questions') => void;
  createNewChatSession: () => void;
}

export const SidebarModeSwitcher: React.FC<SidebarModeSwitcherProps> = ({ appMode, handleModeChange, createNewChatSession }) => (
  <div className="px-3 py-3 border-b border-gray-800 space-y-2">
    <button
      onClick={() => handleModeChange('chat')}
      className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
        appMode === 'chat'
          ? 'bg-gray-800 text-white border-gray-700'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <img src={chatIcon} alt="General Chat" className="w-4 h-4" />
        <span>General Chat</span>
      </div>
    </button>
    {/* New Chat button for General Chat mode (expanded sidebar) */}
    {appMode === 'chat' && (
      <button
        onClick={createNewChatSession}
        className="w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors border border-dashed border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white mt-1 mb-2 flex items-center gap-2"
        title="Start a new chat"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
        <span>New Chat</span>
      </button>
    )}
    <button
      onClick={() => handleModeChange('ide')}
      className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
        appMode === 'ide'
          ? 'bg-gray-800 text-white border-gray-700'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <img src={ideIcon} alt="AI-First IDE" className="w-4 h-4" />
        <span>Code with AI</span>
      </div>
    </button>
    <button
      onClick={() => handleModeChange('questions')}
      className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
        appMode === 'questions'
          ? 'bg-gray-800 text-white border-gray-700'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <img src={questionIcon} alt="Question Generation" className="w-4 h-4 opacity-70" />
        <span>Question Gen</span>
      </div>
    </button>
  </div>
);
