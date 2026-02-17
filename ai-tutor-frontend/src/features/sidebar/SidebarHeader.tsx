import React from 'react';
import edLogo from '../../assets/edLogo.png';
import logo9021 from '../../assets/9021logo.png';
import type { AppMode } from '../../types';

interface SidebarHeaderProps {
  setAppMode: (mode: AppMode | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  setAppMode,
  isCollapsed = false,
  onToggleCollapse,
}) => (
  <div className={`border-b border-gray-800 ${isCollapsed ? 'py-4 px-0' : 'p-4'}`}>
    <div
      className={`flex items-center gap-2 w-full ${
        isCollapsed ? 'justify-center' : 'justify-between'
      }`}
    >
      {/* Logo */}
      <div
        className={`flex items-center gap-2 min-w-0 ${
          isCollapsed ? 'opacity-0 pointer-events-none w-0 flex-none' : 'flex-1'
        }`}
      >
        <a
          href="https://edstem.org/au/courses/28065/discussion"
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 rounded-lg overflow-hidden shadow-lg flex-shrink-0"
          title="Open Ed discussion"
        >
          <div className="w-full h-full rounded-lg bg-gradient-to-br from-primary-600 to-primary-500 p-[2px]">
            <div className="w-full h-full rounded-md bg-white flex items-center justify-center">
              <img
                src={edLogo}
                alt="Ed discussion"
                className="w-full h-full object-contain scale-110"
              />
            </div>
          </div>
        </a>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setAppMode(null)}
            className="w-full h-8 rounded-lg flex items-center justify-center"
            title="Home"
            aria-label="Go to home"
          >
            <img
              src={logo9021}
              alt="9021"
              className="h-8 w-auto object-contain"
            />
          </button>
        </div>
      </div>
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className={`transition-colors ${
            isCollapsed
              ? 'mx-auto w-8 h-8 flex items-center justify-center p-0 rounded-full hover:bg-gray-800/70 active:bg-gray-700/70'
              : 'p-2 hover:bg-gray-800 rounded-lg'
          }`}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          )}
        </button>
      )}
    </div>
  </div>
);
