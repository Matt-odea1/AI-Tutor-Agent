export default function InstructorDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Oral Assessment - Instructor Dashboard
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Welcome to the Oral Assessment System
          </h2>
          <p className="text-gray-600">
            This is the instructor dashboard. Features coming soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
            <li>Create new assessments</li>
            <li>Bulk upload students and code</li>
            <li>Generate questions automatically</li>
            <li>Monitor student progress</li>
            <li>View and evaluate results</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
