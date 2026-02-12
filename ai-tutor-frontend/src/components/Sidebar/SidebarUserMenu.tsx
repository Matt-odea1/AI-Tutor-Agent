import React from 'react';
import type { RefObject } from 'react';

interface SidebarUserMenuProps {
  isUserMenuOpen: boolean;
  setIsUserMenuOpen: (open: boolean) => void;
  userMenuRef: RefObject<HTMLDivElement>;
  userEmail: string;
  userInitial: string;
}

export const SidebarUserMenu: React.FC<SidebarUserMenuProps> = ({
  isUserMenuOpen,
  setIsUserMenuOpen,
  userMenuRef,
  userEmail,
  userInitial,
}) => (
  <div className="relative" ref={userMenuRef}>
    <button
      className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold"
      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
      aria-label="User menu"
    >
      {userInitial}
    </button>
    {isUserMenuOpen && (
      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-2 z-50">
        <div className="px-4 py-2 text-gray-700 text-sm">{userEmail}</div>
        {/* Add more user menu items here */}
      </div>
    )}
  </div>
);
