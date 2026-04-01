import { Link } from 'react-router-dom';
import CreateAssessmentForm from '../components/CreateAssessmentForm';

export default function CreateAssessment() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/assessments" className="text-gray-500 hover:text-gray-600">
              ← Back
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              Create New Assessment
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8">
          <CreateAssessmentForm />
        </div>
      </main>
    </div>
  );
}
