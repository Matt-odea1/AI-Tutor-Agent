import { Link } from 'react-router-dom';
import type { AppShellMaxWidth } from './AppShell';

interface SetupStepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  /**
   * Empty on step 1 — the assessment does not exist yet. Safe: completed-step
   * links are only rendered for steps BELOW the current one, and step 1 has
   * none, so `step.path('')` is never called.
   */
  assessmentId: string;
  /**
   * Must match the `maxWidth` the page mounts AppShell with, or the trail
   * misaligns with the title above it. Defaults to 'narrow', the width of the
   * setup forms.
   */
  maxWidth?: AppShellMaxWidth;
}

/** Mirrors AppShell's MAX_WIDTH_CLASS so the banner shares the shell's column. */
const MAX_WIDTH_CLASS: Record<AppShellMaxWidth, string> = {
  default: 'max-w-7xl',
  medium: 'max-w-5xl',
  narrow: 'max-w-4xl',
};

const STEPS = [
  { label: 'Create', path: () => `/assessments` },
  { label: 'Upload Students', path: (id: string) => `/assessments/${id}/upload` },
  { label: 'Generate Questions', path: (id: string) => `/assessments/${id}/generate` },
  { label: 'Monitor', path: (id: string) => `/assessments/${id}/monitor` },
];

/**
 * SetupStepIndicator — the only wayfinding in the 4-step assessment setup flow.
 *
 * It previously painted the CURRENT step with `text-primary-400` and its dot with
 * `bg-primary-400`; neither shade existed in the old Tailwind config, so the step
 * you were actually on rendered as plain grey text next to an invisible dot — i.e.
 * there was no "you are here" at all. Current is now `text-accent font-semibold`
 * with a real accent dot, completed is `text-success` (and still a Link back), and
 * upcoming is `text-slate`.
 */
export default function SetupStepIndicator({
  currentStep,
  assessmentId,
  maxWidth = 'narrow',
}: SetupStepIndicatorProps) {
  return (
    <nav aria-label="Setup progress" className="bg-paper border-b border-hairline">
      {/*
        Rendered as AppShell's FULL-BLEED `banner`, so this reproduces the shell's
        content column exactly once — padding INSIDE the max-width container, the
        same way AppShell builds its own column — rather than wrapping a centred
        container in a second layer of horizontal padding. The width comes from the
        caller (`maxWidth`, defaulting to narrow) because it MUST match the width
        that page mounts the shell with; hardcoding max-w-4xl misaligned the trail
        on any setup page using a wider column.
      */}
      <ol
        className={`${MAX_WIDTH_CLASS[maxWidth]} mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-y-1 text-sm`}
      >
        {STEPS.map((step, i) => {
          const stepNum = (i + 1) as 1 | 2 | 3 | 4;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          const label = (
            <span
              className={`inline-flex items-center gap-1.5 ${
                isCurrent
                  ? 'font-semibold text-accent'
                  : isCompleted
                  ? 'font-medium text-success'
                  : 'font-medium text-slate'
              }`}
            >
              {isCompleted && (
                <svg
                  aria-hidden="true"
                  className="w-4 h-4 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {isCurrent && (
                <span aria-hidden="true" className="w-2 h-2 flex-shrink-0 rounded-full bg-accent" />
              )}
              {/* The check and the dot are decorative, so state is spelled out for
                  screen readers (aria-current covers the current step only). */}
              {isCompleted && <span className="sr-only">Completed: </span>}
              {step.label}
            </span>
          );

          return (
            <li
              key={stepNum}
              className="flex items-center"
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isCompleted ? (
                <Link to={step.path(assessmentId)} className="rounded hover:underline">
                  {label}
                </Link>
              ) : (
                label
              )}
              {i < STEPS.length - 1 && (
                <svg
                  aria-hidden="true"
                  className="w-4 h-4 mx-2 flex-shrink-0 text-slate/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
