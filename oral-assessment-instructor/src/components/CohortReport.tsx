import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { useToastStore } from '../store/toastStore';
import type { AssessmentReport } from '../../../shared/types/assessment';

interface CohortReportProps {
  assessmentId: string;
}

const GRADE_BANDS = ['Excellent', 'Competent', 'Developing', 'Needs Improvement'] as const;

function Stat({ label, value, suffix = '' }: { label: string; value: number | null | undefined; suffix?: string }) {
  return (
    <div>
      <p className="text-xs text-slate">{label}</p>
      <p className="text-lg font-medium text-ink tabular-nums">
        {value == null ? '—' : `${value}${suffix}`}
      </p>
    </div>
  );
}

export default function CohortReport({ assessmentId }: CohortReportProps) {
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isDownloading, setIsDownloading] = useState<'pdf' | 'html' | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiService.getAssessmentReport(assessmentId);
        if (!cancelled) setReport(r);
      } catch {
        /* non-critical — the dashboard below still works without a report */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const download = async (format: 'pdf' | 'html') => {
    setIsDownloading(format);
    try {
      const blob = await apiService.downloadAssessmentReport(assessmentId, format);
      const url = URL.createObjectURL(blob);
      if (format === 'html') {
        window.open(url, '_blank', 'noopener');
        // Revoke late — revoking immediately can race the new tab's load.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cohort-summary.pdf';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : `Failed to open the ${format.toUpperCase()}`, 'error');
    } finally {
      setIsDownloading(null);
    }
  };

  const regenerate = async () => {
    setIsRegenerating(true);
    try {
      setReport(await apiService.generateAssessmentReport(assessmentId));
      addToast('Report regenerated', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to generate report', 'error');
    } finally {
      setIsRegenerating(false);
    }
  };

  if (isLoading) return null;

  if (!report) {
    return (
      <div className="bg-paper border border-hairline rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink">No cohort report yet</p>
          <p className="text-xs text-slate mt-0.5">
            One is generated automatically once 10 students have submitted, then at each further 10.
          </p>
        </div>
        <button
          onClick={regenerate}
          disabled={isRegenerating}
          className="shrink-0 rounded-xl border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50 transition-colors"
        >
          {isRegenerating ? 'Generating…' : 'Generate now'}
        </button>
      </div>
    );
  }

  const { counts, scores, dimensions, histogram } = report;
  const maxBucket = Math.max(1, ...histogram.map((b) => b.count));

  return (
    <div className="bg-paper border border-hairline rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink">Cohort report</p>
          <p className="text-xs text-slate mt-0.5">
            {counts.evaluated} of {counts.submitted} submissions evaluated
            {report.triggeredBy === 'auto_threshold' && report.milestone
              ? ` · auto-generated at ${report.milestone * 10} submissions`
              : ' · generated manually'}
            {' · '}
            {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => download('html')}
            disabled={isDownloading !== null}
            className="rounded-xl border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50 transition-colors"
          >
            {isDownloading === 'html' ? 'Opening…' : 'One-pager'}
          </button>
          <button
            onClick={() => download('pdf')}
            disabled={isDownloading !== null}
            className="rounded-xl border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50 transition-colors"
          >
            {isDownloading === 'pdf' ? 'Preparing…' : 'PDF'}
          </button>
          <button
            onClick={regenerate}
            disabled={isRegenerating}
            className="rounded-xl border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50 transition-colors"
          >
            {isRegenerating ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {report.narrative && (
        <div className="rounded-lg bg-ink/5 p-3">
          <p className="text-sm text-ink whitespace-pre-line">{report.narrative}</p>
          <p className="text-[11px] text-slate mt-2">
            AI-written summary of the figures below. The statistics are computed directly, not by the model.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Stat label="Average" value={scores.average} suffix="%" />
        <Stat label="Median" value={scores.median} suffix="%" />
        <Stat label="Lowest" value={scores.min} suffix="%" />
        <Stat label="Highest" value={scores.max} suffix="%" />
        <Stat label="Std dev" value={scores.stdDev} />
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-slate hover:text-ink transition-colors"
      >
        {expanded ? 'Hide' : 'Show'} distribution
      </button>

      {expanded && (
        <div className="space-y-4 pt-1">
          <div>
            <p className="text-xs text-slate mb-2">Score distribution</p>
            <div className="space-y-1">
              {histogram.map((b) => (
                <div key={b.bucket} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-[11px] text-slate tabular-nums">{b.bucket}%</span>
                  <div className="flex-1 bg-ink/5 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-accent"
                      style={{ width: `${(b.count / maxBucket) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-[11px] text-slate tabular-nums text-right">{b.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate mb-2">Grades</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate">
              {GRADE_BANDS.map((band) => (
                <span key={band}>
                  {band}:{' '}
                  <span className="font-medium text-ink tabular-nums">
                    {(report.gradeDistribution[band] as number) ?? 0}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate mb-2">Marks per answer ({dimensions.answersEvaluated} answers)</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate">
              <span>
                Correctness:{' '}
                <span className="font-medium text-ink tabular-nums">
                  {dimensions.averageCorrectness ?? '—'}
                </span>
              </span>
              <span>
                Understanding:{' '}
                <span className="font-medium text-ink tabular-nums">
                  {dimensions.averageUnderstanding ?? '—'}
                </span>
              </span>
              <span>
                Flagged for review:{' '}
                <span className="font-medium text-ink tabular-nums">{dimensions.needsReviewCount}</span>
              </span>
            </div>
          </div>

          {counts.notEvaluated > 0 && (
            <p className="text-xs text-slate">
              {counts.notEvaluated} enrolled {counts.notEvaluated === 1 ? 'student is' : 'students are'} not yet
              evaluated and {counts.notEvaluated === 1 ? 'is' : 'are'} excluded from these averages.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
