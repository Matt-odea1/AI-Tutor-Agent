import { useParams } from 'react-router-dom';

export default function StudentAssessment() {
  const { studentId, assessmentId } = useParams<{
    studentId: string;
    assessmentId: string;
  }>();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Oral Assessment
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Student ID: {studentId} | Assessment ID: {assessmentId}
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Welcome to Your Oral Assessment
          </h2>
          <p className="text-gray-600">
            This is the student assessment interface. Features coming soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
            <li>View questions one at a time</li>
            <li>Record audio responses</li>
            <li>Track progress</li>
            <li>Submit assessment</li>
            <li>View results and feedback</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
