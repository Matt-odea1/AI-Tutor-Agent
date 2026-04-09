import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function InviteLanding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No invite token found. Please check your link.');
      return;
    }

    const exchange = async () => {
      try {
        const resp = await axios.post(`${API_BASE_URL}/api/auth/student/exchange`, {
          invite_token: token,
        });
        const { access_token, student_id, assessment_id } = resp.data;

        // Store session
        sessionStorage.setItem('studentToken', access_token);
        sessionStorage.setItem('authToken', access_token);
        sessionStorage.setItem('studentId', student_id);
        sessionStorage.setItem('assessmentId', assessment_id);

        // Redirect to assessment
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
      }
    };

    exchange();
  }, [token, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
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

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <LoadingSpinner size="lg" message="Verifying your invite..." />
    </div>
  );
}
