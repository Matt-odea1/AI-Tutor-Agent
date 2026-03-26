import { Link } from 'react-router-dom';

interface SetupStepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  assessmentId: string;
}

const STEPS = [
  { label: 'Create', path: (_id: string) => `/assessments` },
  { label: 'Upload Students', path: (id: string) => `/assessments/${id}/upload` },
  { label: 'Generate Questions', path: (id: string) => `/assessments/${id}/generate` },
  { label: 'Monitor', path: (id: string) => `/assessments/${id}/monitor` },
];

export default function SetupStepIndicator({ currentStep, assessmentId }: SetupStepIndicatorProps) {
  return (
    <div className="bg-slate-800 border-b border-slate-700 px-4 sm:px-6 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto">
        <ol className="flex items-center space-x-2 text-sm">
          {STEPS.map((step, i) => {
            const stepNum = (i + 1) as 1 | 2 | 3 | 4;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;
            const isFuture = stepNum > currentStep;

            const label = (
              <span className={`font-medium ${isCurrent ? 'text-primary-400' : isCompleted ? 'text-green-400' : 'text-slate-500'}`}>
                {isCompleted && (
                  <svg className="inline w-4 h-4 mr-1 -mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {isCurrent && <span className="inline-block w-2 h-2 bg-primary-400 rounded-full mr-1.5 -mb-0.5" />}
                {step.label}
              </span>
            );

            return (
              <li key={stepNum} className="flex items-center">
                {isCompleted ? (
                  <Link to={step.path(assessmentId)} className="hover:underline">
                    {label}
                  </Link>
                ) : (
                  label
                )}
                {i < STEPS.length - 1 && (
                  <svg className="w-4 h-4 text-slate-600 mx-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
