import type { Toast as ToastType } from '../hooks/useToast';

interface ToastProps {
  toast: ToastType;
  onDismiss: () => void;
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  const base = 'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm';
  const style =
    toast.type === 'success'
      ? 'bg-green-700 text-white border border-green-600'
      : 'bg-red-700 text-white border border-red-600';

  return (
    <div className={`${base} ${style}`} role="status">
      <span className="flex-1">{toast.message}</span>
      <button onClick={onDismiss} className="text-white/70 hover:text-white transition-colors ml-2">
        ✕
      </button>
    </div>
  );
}
