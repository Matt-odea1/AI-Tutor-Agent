import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import HelpButton from '../components/HelpButton';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Persistent top-right Help affordance for the invite screen. Pre-exchange we have
 * NO per-assessment contact data, so it renders with no contact props and the
 * generic fallback copy. Shown across the no-token, error and ready states so a
 * student who can't even exchange their link always has somewhere to turn.
 */
function InviteHelp() {
  return (
    <div className="absolute top-4 right-4">
      <HelpButton />
    </div>
  );
}

export default function InviteLanding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="relative min-h-screen bg-white flex items-center justify-center p-4">
        <InviteHelp />
        <div className="max-w-md w-full text-center">
          <svg className="mx-auto h-12 w-12 text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Invalid Invite Link</h2>
          <p className="text-sm text-gray-600">No invite token found. Please check your link.</p>
        </div>
      </div>
    );
  }

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.post(`${API_BASE_URL}/api/auth/student/exchange`, {
        invite_token: token,
      });
      const { access_token, student_id, assessment_id } = resp.data;

      sessionStorage.setItem('studentToken', access_token);
      sessionStorage.setItem('authToken', access_token);
      sessionStorage.setItem('studentId', student_id);
      sessionStorage.setItem('assessmentId', assessment_id);

      navigate(`/${student_id}/${assessment_id}`, { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err) && (err.response?.status === 400 || err.response?.status === 401)) {
        const detail = err.response?.data?.error?.message || err.response?.data?.detail || '';
        if (detail.toLowerCase().includes('expired')) {
          setError('This invite link has expired. Please contact your instructor for a new link.');
        } else if (detail.toLowerCase().includes('already been used')) {
          setError('This invite link has already been used. Please contact your instructor for a new link.');
        } else {
          setError('This invite link is invalid or has expired. Please contact your instructor for a new link.');
        }
      } else {
        setError('Failed to verify your invite link. Please try again or contact your instructor.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="relative min-h-screen bg-white flex items-center justify-center p-4">
        <InviteHelp />
        <div className="max-w-md w-full text-center">
          <svg className="mx-auto h-12 w-12 text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Invalid Invite Link</h2>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <LoadingSpinner size="lg" message="Verifying your invite..." />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-white flex items-center justify-center p-4">
      <InviteHelp />
      <div className="max-w-lg w-full">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-indigo-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Assessment Invitation</h2>
          <p className="text-sm text-gray-600 mb-6">Before you begin, here's what to expect.</p>
        </div>

        {/* "Before you begin" pre-flight panel. This is static (no per-assessment
            data — we have NONE until the single-use token is exchanged) so the
            student can read it and back out BEFORE spending their link. */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 text-left">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Before you begin</h3>
          <ul className="text-sm text-gray-700 space-y-2.5">
            <li className="flex items-start space-x-2">
              <span className="text-indigo-500 mt-0.5" aria-hidden="true">•</span>
              <span>
                This is a <span className="font-medium">proctored oral assessment</span> — your webcam and
                microphone will be recorded throughout.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-indigo-500 mt-0.5" aria-hidden="true">•</span>
              <span>
                You'll answer questions <span className="font-medium">one at a time, in order</span> — you can't go back.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-indigo-500 mt-0.5" aria-hidden="true">•</span>
              <span>
                Make sure you have a working microphone, camera, and a stable internet connection, and use a
                modern browser (Chrome, Firefox, or Safari).
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-indigo-500 mt-0.5" aria-hidden="true">•</span>
              <span>
                Set aside <span className="font-medium">uninterrupted time</span> — once you start, a timer may
                run per question.
              </span>
            </li>
          </ul>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-800">Starting uses your invite link.</span> You can safely
              refresh or briefly lose connection and resume the same session, but the link can't be used to start a
              brand-new session twice.
            </p>
          </div>
        </div>

        <button
          onClick={handleStart}
          className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Start Assessment
        </button>
      </div>
    </div>
  );
}
