import React from 'react';
import edLogo from '../../assets/edLogo.png';
import logo9021 from '../../assets/9021logo.png';
import type { AppMode } from '../../types/appMode';

interface SidebarHeaderProps {
  setAppMode: (mode: AppMode | null) => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ setAppMode }) => (
  <div className="p-4 border-b border-gray-800">
    <div className="flex items-center justify-between gap-2">
      {/* Logo */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
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
              className="h-10 pt-1 w-auto object-contain"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
);
