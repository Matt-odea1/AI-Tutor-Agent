import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

interface AuthGateProps {
  children: ReactNode;
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload.exp !== 'number') return false; // no exp claim — treat as valid
    return payload.exp * 1000 < Date.now();
  } catch {
    return true; // malformed token — treat as expired
  }
}

export default function AuthGate({ children }: AuthGateProps) {
  const location = useLocation();
  const token = localStorage.getItem('authToken');

  if (!token || isTokenExpired(token)) {
    if (token) localStorage.removeItem('authToken');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
