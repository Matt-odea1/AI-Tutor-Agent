import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { apiService } from '../services/api';
import { useAssessmentStore } from '../store/assessmentStore';
import type { UploadedStudent } from '../../../shared/types/assessment';

interface ParsedStudent {
  name: string;
  email: string;
  studentId: string;
  code: string;
  assignmentFile?: string;
}

interface BulkUploadCSVProps {
  assessmentId: string;
  onUploadSuccess?: () => void;
}

export default function BulkUploadCSV({ assessmentId, onUploadSuccess }: BulkUploadCSVProps) {
  const navigate = useNavigate();
  const { setLoading, setError } = useAssessmentStore();

  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const handleDownloadTemplate = () => {
    const csv = [
      'name,email,studentId,code',
      'Jane Smith,jane@university.edu,s12345,"def factorial(n): return 1 if n <= 1 else n * factorial(n-1)"',
      'John Doe,john@university.edu,s12346,"def factorial(n):\\n    if n <= 1:\\n        return 1\\n    return n * factorial(n-1)"',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (csvText: string): Promise<ParsedStudent[]> => {
    return new Promise<ParsedStudent[]>((resolve, reject) => {
      Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            if (results.errors.length > 0) {
              reject(new Error(`CSV parse errors: ${results.errors.map(e => e.message).join(', ')}`));
              return;
            }

            if (results.data.length === 0) {
              reject(new Error('CSV file is empty'));
              return;
            }

            // Normalize headers: lowercase and strip underscores/hyphens/spaces
            const normalizedData = results.data.map(row => {
              const normalizedRow: Record<string, string> = {};
              Object.keys(row).forEach(key => {
                normalizedRow[key.toLowerCase().trim().replace(/[_\- ]/g, '')] = row[key];
              });
              return normalizedRow;
            });

            // Validate required headers
            const requiredHeaders = ['name', 'email', 'studentid', 'code'];
            const firstRow = normalizedData[0];
            const headers = Object.keys(firstRow);
            const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

            if (missingHeaders.length > 0) {
              reject(new Error(`Missing required columns: ${missingHeaders.join(', ')}`));
              return;
            }

            // Map to ParsedStudent[] with validation
            const seenIds = new Set<string>();
            const students: ParsedStudent[] = [];
            const validationErrors: string[] = [];

            for (let index = 0; index < normalizedData.length; index++) {
              const row = normalizedData[index];

              const name = row.name?.trim() || '';
              const email = row.email?.trim() || '';
              const studentId = row.studentid?.trim() || '';

              if (!studentId) {
                validationErrors.push(`Row ${index + 2}: Missing studentId`);
              }
              if (!name) {
                validationErrors.push(`Row ${index + 2}: Missing name`);
              }
              if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
                validationErrors.push(`Row ${index + 2}: Invalid email address "${email}"`);
              }
              if (studentId && seenIds.has(studentId)) {
                validationErrors.push(`Row ${index + 2}: Duplicate studentId "${studentId}"`);
              }
              if (studentId) seenIds.add(studentId);

              if (validationErrors.length === 0) {
                students.push({
                  name,
                  email,
                  studentId,
                  code: row.code || '',
                  assignmentFile: row.assignmentfile?.trim(),
                });
              }
            }

            if (validationErrors.length > 0) {
              reject(new Error(validationErrors.join('\n')));
              return;
            }

            resolve(students);
          } catch (err) {
            reject(err);
          }
        },
        error: (error: Error) => {
          reject(new Error(`Failed to parse CSV: ${error.message}`));
        },
      });
    });
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setParseError(null);

    if (acceptedFiles.length === 0) return;

    if (acceptedFiles.length > 1) {
      setParseError('Multiple files detected. Only the first file will be used.');
    }

    const file = acceptedFiles[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const csvText = e.target?.result as string;
        const students = await parseCSV(csvText);
        setParsedStudents(students);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse CSV file');
      }
    };

    reader.onerror = () => {
      setParseError('Failed to read file');
    };

    reader.readAsText(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    multiple: false,
  });

  const handleUpload = async () => {
    if (!assessmentId || parsedStudents.length === 0) return;

    try {
      setIsUploading(true);
      setLoading(true);
      setError(null);

      const uploadData: UploadedStudent[] = parsedStudents.map((s) => ({
        name: s.name,
        email: s.email,
        studentId: s.studentId,
        code: s.code,
        assignmentFile: s.assignmentFile,
      }));

      await apiService.uploadStudents({ assessmentId, students: uploadData });

      // Notify parent and navigate to question generation
      onUploadSuccess?.();
      navigate(`/assessments/${assessmentId}/generate`, { state: { uploaded: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload students');
    } finally {
      setIsUploading(false);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* CSV Format Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">CSV Format Requirements</h3>
        <p className="text-gray-600 mb-4">
          Your CSV file must include the following columns (case-insensitive):
        </p>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start">
            <span className="text-primary-400 mr-2">•</span>
            <span><strong>name</strong> - Student's full name</span>
          </li>
          <li className="flex items-start">
            <span className="text-primary-400 mr-2">•</span>
            <span><strong>email</strong> - Student's email address</span>
          </li>
          <li className="flex items-start">
            <span className="text-primary-400 mr-2">•</span>
            <span><strong>studentId</strong> - Unique student identifier</span>
          </li>
          <li className="flex items-start">
            <span className="text-primary-400 mr-2">•</span>
            <span><strong>code</strong> - Student's submitted code (single line or escaped)</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-400 mr-2">•</span>
            <span className="text-gray-500"><strong>assignmentFile</strong> - (Optional) Path to assignment file</span>
          </li>
        </ul>
        
        <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
          <p className="text-xs text-gray-500 font-mono mb-2">Example CSV:</p>
          <pre className="text-xs text-gray-600 font-mono overflow-x-auto">
{`name,email,studentId,code
John Doe,john@example.com,12345,"def factorial(n): return 1 if n <= 1 else n * factorial(n-1)"
Jane Smith,jane@example.com,12346,"def factorial(n):\\n    if n <= 1:\\n        return 1\\n    return n * factorial(n-1)"`}
          </pre>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="mt-4 text-sm text-primary-400 hover:text-primary-300 underline transition-colors"
        >
          Download template CSV
        </button>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary-500 bg-primary-500/10'
            : 'border-gray-300 bg-white hover:border-primary-500 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        <svg
          className="mx-auto h-12 w-12 text-gray-500 mb-4"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {isDragActive ? (
          <p className="text-gray-700 font-medium">Drop the CSV file here</p>
        ) : (
          <>
            <p className="text-gray-700 font-medium mb-1">
              Drag and drop CSV file here, or click to browse
            </p>
            <p className="text-sm text-gray-500">Only .csv files are accepted</p>
          </>
        )}
      </div>

      {/* Parse Error */}
      {parseError && (
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
          <div className="flex items-start">
            <svg
              className="h-5 w-5 text-red-400 mr-3 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-red-300 mb-1">CSV Parse Error</h4>
              {parseError.includes('\n') ? (
                <ul className="text-sm text-red-200 list-disc list-inside space-y-1">
                  {parseError.split('\n').map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-red-200">{parseError}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Table */}
      {parsedStudents.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Preview ({parsedStudents.length} students)
            </h3>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Student ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Code
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {parsedStudents.map((student, index) => (
                  <>
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{student.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{student.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{student.studentId}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <span>{student.code.length} chars</span>
                          <button
                            onClick={() => setExpandedRow(expandedRow === index ? null : index)}
                            className="text-xs text-primary-400 hover:text-primary-300 underline"
                          >
                            {expandedRow === index ? 'hide' : 'view'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRow === index && (
                      <tr key={`${index}-expand`}>
                        <td colSpan={4} className="px-4 py-2 bg-gray-50">
                          <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{student.code}</pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {parsedStudents.length > 0 && (
        <div className="flex items-center gap-4">
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Uploading...' : `Upload ${parsedStudents.length} Students`}
          </button>
          <button
            onClick={() => setParsedStudents([])}
            disabled={isUploading}
            className="bg-gray-100 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
