import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="bg-paper border border-hairline rounded-xl p-12 max-w-md text-center">
        <p className="font-serif text-6xl font-semibold text-accent tabular-nums mb-4">404</p>
        <h1 className="font-serif text-2xl font-semibold text-ink mb-4">Page Not Found</h1>
        <p className="text-slate mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <button
          onClick={() => navigate('/assessments')}
          className="inline-block bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
