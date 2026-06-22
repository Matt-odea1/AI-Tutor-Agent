import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import QuestionDisplay from '../components/QuestionDisplay';
import ProgressTracker from '../components/ProgressTracker';
import AudioRecorder from '../components/AudioRecorder';
import TextAnswerInput from '../components/TextAnswerInput';
import QuestionTimer from '../components/QuestionTimer';
import ConsentModal from '../components/ConsentModal';
import PreAssessmentOverview from '../components/PreAssessmentOverview';
import ProctorCamera from '../components/ProctorCamera';
import CameraRevokedOverlay from '../components/CameraRevokedOverlay';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import {
  parseUrlParams,
  checkBrowserSupport,
  declinedConsentKey,
  hasDeclinedConsent,
} from '../utils/helpers';
import { runTimerExpiry } from '../utils/timerExpiry';
import { deferSubmitWhileOffline } from '../utils/offlineDefer';
import { useToastStore } from '../store/toastStore';

/**
 * Parse an optional ISO 8601 timestamp into ms-since-epoch for QuestionTimer's
 * server anchor, or null when absent/unparseable (the timer then falls back to
 * its locally persisted anchor). See the `questionStartedAt` ASSUMED backend
 * contract in types/index.ts.
 */
function parseServerStartedAtMs(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export default function TakeAssessment() {
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isRestoringCamera, setIsRestoringCamera] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [assessmentStarted, setAssessmentStartedRaw] = useState(false);
  // Preparation countdown for oral mode (counts down from preparationTime → 0)
  const [prepSecondsLeft, setPrepSecondsLeft] = useState<number | null>(null);
  const [prepDone, setPrepDone] = useState(false);
  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards the draft-recovery effect to run at most once per mount.
  const rehydrateAttemptedRef = useRef(false);
  // Holds the one-shot `online` listener registered when the per-question timer
  // expires while offline, so it can be removed on unmount or once it fires.
  const deferredSubmitRef = useRef<(() => void) | null>(null);

  // Wrapper to persist assessmentStarted to sessionStorage
  const setAssessmentStarted = (v: boolean) => {
    setAssessmentStartedRaw(v);
    if (v && assessmentId) sessionStorage.setItem(`started_${assessmentId}`, 'true');
  };

  const {
    studentId,
    assessmentId,
    assessment,
    questions,
    currentQuestionIndex,
    progress,
    isLoading,
    isUploading,
    error,
    answerMode,
    preparationTime,
    textAnswer,
    isRecording,
    isPaused,
    recordingStartTime,
    proctorStream,
    isProctoringActive,
    cameraRevoked,
    consentGiven,
    proctoringRequested,
    proctoringDegraded,
    answeredQuestionIds,
    skippedQuestionIds,
    proctoringWarning,
    lastFailedAction,
    setStudentInfo,
    loadQuestions,
    loadProgress,
    submitCurrentAnswer,
    submitCurrentTextAnswer,
    skipCurrentQuestion,
    submitCompleteAssessment,
    setTextAnswer,
    rehydrateDraft,
    recordConsentDecision,
    startProctoring,
    ensureProctoring,
    restoreProctoring,
    setConsentGiven,
    clearError,
    clearProctoringWarning,
    retryLastAction,
  } = useAssessmentStore();

  // True when the student originally DECLINED recording — proctoring is optional,
  // so a later camera-revoked overlay offers a "Continue without recording" escape
  // and the resume re-arm must NOT block them. We track decline separately from
  // consentGiven (which is true for both accept and decline).
  const [proctoringDeclined, setProctoringDeclined] = useState(false);
  // Set when a silent resume re-arm fails (browser rejected getUserMedia without a
  // gesture) — shows a blocking re-grant overlay instead of continuing un-proctored.
  const [resumeRegrantNeeded, setResumeRegrantNeeded] = useState(false);
  // Guards the resume re-arm so it runs at most once despite this effect's deps
  // (currentQuestionIndex / progress) changing during the exam.
  const resumeArmAttemptedRef = useRef(false);

  // Initialize assessment on mount
  useEffect(() => {
    const urlParams = parseUrlParams(window.location.pathname);
    if (urlParams) {
      setStudentInfo(urlParams.studentId, urlParams.assessmentId);
    }
  }, [setStudentInfo]);

  // Restore the "originally declined recording" decision across a mid-exam refresh.
  // proctoringDeclined is React-only state lost on remount; without this, the resume
  // re-arm effect (which skips re-arming when proctoringDeclined is true) would wrongly
  // attempt ensureProctoring() for a student who declined. We persist the decline to
  // sessionStorage in handleConsentDeclined / handleContinueWithoutRecording and
  // restore it here before the resume effect runs.
  useEffect(() => {
    if (!assessmentId) return;
    if (hasDeclinedConsent(assessmentId)) {
      setProctoringDeclined(true);
    }
  }, [assessmentId]);

  // Load questions when student info is set
  useEffect(() => {
    if (studentId && assessmentId && questions.length === 0) {
      loadQuestions();
      loadProgress();
    }
  }, [studentId, assessmentId, questions.length, loadQuestions, loadProgress]);

  // Warn before accidental tab close/refresh mid-assessment. Modern Chromium
  // ignores preventDefault() alone for the native "Leave site?" dialog — it
  // requires a truthy returnValue — so we set BOTH. (The dialog text itself is
  // not customizable in modern browsers; surfacing the native warning is enough,
  // and an in-flight answer is now also persisted via draftStore as a backstop.)
  useEffect(() => {
    if (!assessmentStarted) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [assessmentStarted]);

  // Restore consent/started state from server + sessionStorage on refresh
  useEffect(() => {
    if (questions.length === 0) return; // not loaded yet
    if (!assessmentId) return;

    // Multiple signals that the assessment is already in-progress:
    // 1. Server says we're past Q1 (currentQuestionIndex > 0)
    // 2. We have answered questions tracked locally
    // 3. The progress endpoint reports answered questions
    const serverInProgress = currentQuestionIndex > 0;
    const hasAnswered = answeredQuestionIds.size > 0 || (progress?.answeredQuestions ?? 0) > 0;
    const sessionConsent = sessionStorage.getItem(`consent_${assessmentId}`) === 'true';
    const sessionStarted = sessionStorage.getItem(`started_${assessmentId}`) === 'true';

    if (serverInProgress || hasAnswered) {
      if (!consentGiven) setConsentGiven(true);
      if (!assessmentStarted) setAssessmentStarted(true);
    } else {
      // Q1 but check sessionStorage (consented + started but haven't answered Q1 yet)
      if (sessionConsent && !consentGiven) {
        setConsentGiven(true);
      }
      if (sessionStarted && !assessmentStarted) {
        setAssessmentStartedRaw(true);
      }
    }
  }, [questions.length, currentQuestionIndex, assessmentId, answeredQuestionIds.size, progress]);

  // Resume re-arm: after a mid-exam refresh the live proctoring stream is gone,
  // but a proctored session must NOT silently continue un-proctored. When the
  // assessment is in-progress AND consent was given AND the student did NOT decline
  // recording AND proctoring isn't already live, attempt a SILENT ensureProctoring.
  // If the browser rejects getUserMedia without a fresh gesture, show a blocking
  // re-grant overlay instead. Guarded to run at most once (deps include progress /
  // currentQuestionIndex which change during the exam).
  useEffect(() => {
    if (questions.length === 0 || !assessmentId) return;
    if (resumeArmAttemptedRef.current) return;
    // Read the persisted decline directly too: on a refresh the restore-decline
    // effect and this effect both fire on the same mount, so proctoringDeclined
    // React state may still be its initial `false` here. sessionStorage is settled.
    const declined = proctoringDeclined || hasDeclinedConsent(assessmentId);
    if (!consentGiven || declined) return; // declined → run un-proctored, no block

    const serverInProgress = currentQuestionIndex > 0;
    const hasAnswered =
      answeredQuestionIds.size > 0 || (progress?.answeredQuestions ?? 0) > 0;
    const inProgress = serverInProgress || hasAnswered;
    if (!inProgress) return; // fresh start handled by the consent → startProctoring flow

    // Only oral mode implies a proctoring camera here (written has no recording).
    if (answerMode !== 'oral') return;

    // Already live? nothing to do.
    const hasLiveVideo =
      !!proctorStream && proctorStream.getVideoTracks().some((t) => t.readyState === 'live');
    if (hasLiveVideo) return;

    resumeArmAttemptedRef.current = true;
    (async () => {
      await ensureProctoring();
      // ensureProctoring swallows getUserMedia failures into proctoringWarning and
      // leaves no live stream. If we still have no live stream, the silent re-grant
      // was rejected — block with the re-grant overlay rather than continue un-proctored.
      const s = useAssessmentStore.getState();
      const live =
        !!s.proctorStream && s.proctorStream.getVideoTracks().some((t) => t.readyState === 'live');
      if (!live) setResumeRegrantNeeded(true);
    })();
  }, [
    questions.length,
    assessmentId,
    consentGiven,
    proctoringDeclined,
    currentQuestionIndex,
    answeredQuestionIds.size,
    progress,
    answerMode,
    proctorStream,
    ensureProctoring,
  ]);

  // Release all camera/mic tracks + the proctoring MediaRecorder on unmount and on
  // pagehide (preferred over `unload` for mobile Safari). stopProctoring is guarded
  // against a double-stop, so the happy-path submit (which also calls it) plus this
  // cleanup won't error. Does NOT touch the existing beforeunload warning above.
  useEffect(() => {
    const releaseMedia = () => {
      const s = useAssessmentStore.getState();
      void s.stopProctoring();
      s.audioRecorder?.cleanup();
    };
    const handlePageHide = () => releaseMedia();
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      releaseMedia();
    };
  }, []);

  // Check browser support
  useEffect(() => {
    const { supported, missing } = checkBrowserSupport();
    if (!supported) {
      setBrowserError(
        `Your browser is missing required features: ${missing.join(', ')}. ` +
        'Please use a modern browser like Chrome, Firefox, or Safari.'
      );
    }
  }, []);

  // Block browser back button during assessment
  useEffect(() => {
    if (!assessmentStarted) return;
    // Push a dummy history entry so back button triggers popstate instead of navigating away
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [assessmentStarted]);

  // Reset per-question state whenever the question changes
  useEffect(() => {
    setPrepDone(false);
    setIsSubmittingAnswer(false);
    clearError(); // clear errors from previous question
    // Defensive: clear any leftover written draft so text never leaks from the
    // previous question into this one, regardless of which advance path ran
    // (normal submit, skip, or a server-driven index change on refetch).
    setTextAnswer('');
    if (prepTimerRef.current) {
      clearInterval(prepTimerRef.current);
      prepTimerRef.current = null;
    }

    if (answerMode === 'oral' && preparationTime && preparationTime > 0 && assessmentStarted) {
      setPrepSecondsLeft(preparationTime);
    } else {
      setPrepSecondsLeft(null);
      setPrepDone(true);
    }

    return () => {
      if (prepTimerRef.current) {
        clearInterval(prepTimerRef.current);
        prepTimerRef.current = null;
      }
    };
  }, [currentQuestionIndex, assessmentStarted, answerMode, preparationTime]);

  // Prep countdown tick
  useEffect(() => {
    if (prepSecondsLeft === null || prepDone) return;
    if (prepSecondsLeft <= 0) {
      setPrepDone(true);
      setPrepSecondsLeft(null);
      return;
    }
    prepTimerRef.current = setInterval(() => {
      setPrepSecondsLeft(prev => {
        if (prev === null || prev <= 1) {
          if (prepTimerRef.current) {
            clearInterval(prepTimerRef.current);
            prepTimerRef.current = null;
          }
          setPrepDone(true);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (prepTimerRef.current) {
        clearInterval(prepTimerRef.current);
        prepTimerRef.current = null;
      }
    };
  }, [prepSecondsLeft, prepDone]);

  // Recover a draft answer persisted before a refresh/crash. Runs at most once
  // per mount, and only once the assessment is in-progress (drafts only exist
  // after the student has started recording/typing). Gating on `assessmentStarted`
  // also means this fires AFTER the per-question reset effect's setTextAnswer('')
  // has run for the started-transition, so a recovered text draft isn't wiped.
  // This effect is intentionally declared after that reset effect for the same
  // within-commit ordering reason.
  useEffect(() => {
    if (rehydrateAttemptedRef.current) return;
    if (!assessmentStarted || !assessmentId || questions.length === 0) return;
    rehydrateAttemptedRef.current = true;
    // No cancel-on-cleanup guard: the ref above already ensures rehydrateDraft
    // runs exactly once, and addToast targets a global store (safe to call even
    // if this component has unmounted). A cleanup-set `cancelled` flag would let
    // StrictMode's dev mount→cleanup→mount cycle suppress the toast even though
    // the draft WAS recovered by the first (un-cancelled) async run.
    (async () => {
      const recovered = await rehydrateDraft();
      if (recovered) {
        addToast('Recovered your unsaved answer from before the page reloaded.', 'info');
      }
    })();
  }, [assessmentStarted, assessmentId, questions.length, currentQuestionIndex, rehydrateDraft, addToast]);

  // Tear down any pending deferred-submit listener when the component unmounts.
  useEffect(() => {
    return () => {
      if (deferredSubmitRef.current) {
        window.removeEventListener('online', deferredSubmitRef.current);
        deferredSubmitRef.current = null;
      }
    };
  }, []);

  const handleConsentAccepted = async () => {
    // Record consent (granted) server-side + locally + sessionStorage BEFORE the
    // camera request so a refresh won't re-show the modal. Best-effort: a failed
    // server write only toasts, never blocks.
    setProctoringDeclined(false);
    await recordConsentDecision(true);

    setIsRequestingPermission(true);
    try {
      await startProctoring();
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleConsentDeclined = async () => {
    // Allow assessment without proctoring (consent declined = proceed without
    // camera). granted:false is the instructor's authoritative decline signal.
    // Persist the decline so a mid-exam refresh restores proctoringDeclined and the
    // resume re-arm effect correctly skips re-arming the camera.
    setProctoringDeclined(true);
    if (assessmentId) sessionStorage.setItem(declinedConsentKey(assessmentId), 'true');
    await recordConsentDecision(false);
  };

  // Escape from the camera-revoked overlay when proctoring is optional: record a
  // decline (so the instructor sees the escape was taken), then dismiss the
  // blocking overlay and clear the proctoring-required intent.
  const handleContinueWithoutRecording = async () => {
    setProctoringDeclined(true);
    if (assessmentId) sessionStorage.setItem(declinedConsentKey(assessmentId), 'true');
    await recordConsentDecision(false);
    useAssessmentStore.setState({ cameraRevoked: false, proctoringRequested: false });
    setResumeRegrantNeeded(false);
  };

  const handleRestoreCamera = async () => {
    setIsRestoringCamera(true);
    try {
      await restoreProctoring();
    } finally {
      setIsRestoringCamera(false);
    }
  };

  // Re-grant from the resume overlay: this runs inside a user gesture (button
  // click), so getUserMedia is permitted. On success the overlay self-dismisses
  // (its render condition checks for a live stream); on failure it stays up.
  const handleResumeRegrant = async () => {
    setIsRestoringCamera(true);
    try {
      await startProctoring();
      const s = useAssessmentStore.getState();
      const live =
        !!s.proctorStream && s.proctorStream.getVideoTracks().some((t) => t.readyState === 'live');
      if (live) setResumeRegrantNeeded(false);
    } finally {
      setIsRestoringCamera(false);
    }
  };

  // Register a one-shot deferred submit that fires the right handler once `online`
  // returns. Guarded against double-submit (re-checks in-flight + clears the ref
  // before firing) and cleaned up on unmount via the effect below.
  const registerDeferredSubmit = (run: () => void) => {
    // Replace any prior pending listener so we never stack two.
    if (deferredSubmitRef.current) {
      window.removeEventListener('online', deferredSubmitRef.current);
      deferredSubmitRef.current = null;
    }
    const onReconnect = () => {
      // One-shot: detach immediately so a flapping connection can't double-fire.
      if (deferredSubmitRef.current) {
        window.removeEventListener('online', deferredSubmitRef.current);
        deferredSubmitRef.current = null;
      }
      const store = useAssessmentStore.getState();
      if (store.isUploading || isSubmittingAnswer || store.isStopping) return;
      run();
    };
    deferredSubmitRef.current = onReconnect;
    window.addEventListener('online', onReconnect);
  };

  const handleTimerExpire = async () => {
    const store = useAssessmentStore.getState();

    // Offline: do NOT fire a submit that will instantly fail. The pure
    // deferSubmitWhileOffline helper stops any active recording (blob is kept by
    // the store), warns the student, and registers a one-shot reconnect that
    // re-runs THIS expiry decision once online — so the right path (audio / text
    // / skip) is chosen against fresh state at that moment.
    if (!store.isOnline) {
      await deferSubmitWhileOffline({
        isInFlight: () => {
          const s = useAssessmentStore.getState();
          return s.isUploading || isSubmittingAnswer || s.isStopping;
        },
        isRecording: () => useAssessmentStore.getState().isRecording,
        answerMode: store.answerMode,
        stopRecording: () => useAssessmentStore.getState().stopRecording(),
        notify: (msg) => addToast(msg, 'warning'),
        registerReconnect: registerDeferredSubmit,
        runOnReconnect: () => {
          void handleTimerExpire();
        },
      });
      return;
    }

    // All decision logic lives in runTimerExpiry (pure + unit-tested). We wire it
    // to the live store here, reading recording state LAZILY so the blob captured
    // by stopRecording is seen. isSubmittingAnswer is local component state, so it
    // is folded into the re-entrancy guard alongside the store's isUploading.
    await runTimerExpiry({
      // isStopping guards the manual-Stop-vs-expiry race: if a stop is already in
      // flight, the expiry handler must not independently stop + skip.
      inFlight: store.isUploading || isSubmittingAnswer || store.isStopping,
      answerMode: store.answerMode,
      getIsRecording: () => useAssessmentStore.getState().isRecording,
      getRecordedBlob: () => useAssessmentStore.getState().recordedBlob,
      getTextAnswer: () => useAssessmentStore.getState().textAnswer,
      stopRecording: () => useAssessmentStore.getState().stopRecording(),
      notify: (msg) => addToast(msg, 'warning'),
      submitAudio: handleSubmitAudioAnswer,
      submitText: handleSubmitTextAnswer,
      skip: (mode) => skipCurrentQuestion(mode),
    });
  };

  const handleSubmitAudioAnswer = async () => {
    setIsSubmittingAnswer(true);
    try {
      await submitCurrentAnswer();
      // Store re-fetches questions after submit — server advances the index
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleSubmitTextAnswer = async () => {
    setIsSubmittingAnswer(true);
    try {
      await submitCurrentTextAnswer();
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleNext = async () => {
    // Re-fetch from server in case auto-advance hasn't completed yet
    setIsSubmittingAnswer(true);
    try {
      await loadQuestions();
      await loadProgress();
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleSubmitAssessment = async () => {
    const ok = await submitCompleteAssessment();
    if (ok) {
      setShowSubmitModal(false);
      setSubmitted(true);
    }
    // on failure: modal stays open, error from store shown inside modal
  };

  // Submission success screen
  if (submitted) {
    const title = assessment?.title || 'your assessment';
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Assessment Submitted</h2>
          <p className="text-gray-600 mb-1">
            Your responses for <span className="font-medium">{title}</span> have been submitted for evaluation.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Submitted {new Date().toLocaleString()}
          </p>
          <button
            onClick={() => navigate(`/${studentId}/results/${assessmentId}`)}
            className="w-full bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            Check Results
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading && questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading assessment..." />
      </div>
    );
  }

  // Error state
  if (error && questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <ErrorMessage error={error} onDismiss={clearError} />
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // No questions state
  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No Questions Available
          </h2>
          <p className="text-gray-600">
            This assessment doesn't have any questions yet.
          </p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  // Safety: if currentQuestionIndex is out of bounds, prompt submission
  if (!currentQuestion) {
    const fallbackAnsweredCount = progress?.answeredQuestions || 0;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Ready to Submit</h2>
          <p className="text-gray-600 mb-4">
            You have answered {fallbackAnsweredCount} of {questions.length} questions. Submit your assessment to finish.
          </p>
          <button
            onClick={() => setShowSubmitModal(true)}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700"
          >
            Submit Assessment
          </button>
        </div>
        {showSubmitModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Submit Assessment?</h2>
              <p className="text-gray-600 mb-2">
                You've answered{' '}
                <span className="font-semibold">{fallbackAnsweredCount}</span> out of{' '}
                <span className="font-semibold">{questions.length}</span> questions.
              </p>
              {fallbackAnsweredCount < questions.length && (
                <p className="text-orange-600 text-sm mb-4">
                  Answers are submitted in order and are final. The {questions.length - fallbackAnsweredCount} unanswered question(s) can't be revisited.
                </p>
              )}
              {fallbackAnsweredCount >= questions.length && (
                <p className="text-gray-500 text-sm mb-6">
                  Answers are submitted in order and are final. Once submitted, your assessment will be sent for evaluation.
                </p>
              )}
              {error && (
                <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-lg">
                  {error.message || 'Submission failed. Please try again.'}
                </p>
              )}
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  disabled={isLoading}
                  className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitAssessment}
                  disabled={isLoading || fallbackAnsweredCount < questions.length}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                >
                  {isLoading ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const answeredCount = progress?.answeredQuestions || 0;
  const currentAnswered = currentQuestion ? answeredQuestionIds.has(currentQuestion.id) : false;

  // Derive a minimal assessment object for the overview screen.
  // The store's `assessment` field is only populated if the backend returns metadata;
  // fall back to what we can derive from the loaded questions.
  const assessmentInfo = assessment ?? {
    id: assessmentId ?? '',
    title: 'Oral Assessment',
    course: '',
    description: '',
    dueDate: '',
    totalQuestions: questions.length,
    timeLimit: questions[0]?.timeLimit,
    status: 'open',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Consent modal — only shown once questions have loaded successfully */}
      {!consentGiven && questions.length > 0 && (
        <ConsentModal
          onConsent={handleConsentAccepted}
          onDecline={handleConsentDeclined}
          isRequestingPermission={isRequestingPermission}
        />
      )}

      {/* Pre-assessment overview — shown after consent, before question 1 */}
      {consentGiven && !assessmentStarted && (
        <PreAssessmentOverview
          assessment={assessmentInfo}
          questionCount={questions.length}
          onStart={() => setAssessmentStarted(true)}
        />
      )}

      {/* Main assessment UI — only rendered after the student clicks Start */}
      {assessmentStarted && <div>

      {/* Browser support error banner */}
      {browserError && (
        <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between">
          <span className="text-sm">{browserError}</span>
          <button onClick={() => setBrowserError(null)} className="ml-4 text-red-200 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Proctoring warning banner */}
      {proctoringWarning && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-3 flex items-center justify-between">
          <span className="text-sm">{proctoringWarning}</span>
          <button onClick={clearProctoringWarning} className="ml-4 text-yellow-600 hover:text-yellow-800 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Proctoring degraded banner (non-blocking) — chunk uploads are failing and
          retrying. Styled like the yellow proctoringWarning banner, but distinct
          from the blocking CameraRevokedOverlay. */}
      {proctoringDegraded && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-3 flex items-center justify-between">
          <span className="text-sm">Proctoring degraded — retrying upload. Your answers are unaffected.</span>
        </div>
      )}

      {/* Camera revoked overlay (blocking). When proctoring is optional (the
          student originally declined), offers a logged "Continue without recording"
          escape. */}
      {cameraRevoked && (
        <CameraRevokedOverlay
          onRestore={handleRestoreCamera}
          isRestoring={isRestoringCamera}
          proctoringOptional={proctoringDeclined}
          onContinueWithout={proctoringDeclined ? handleContinueWithoutRecording : undefined}
        />
      )}

      {/* Resume re-grant overlay (blocking) — a mid-exam refresh dropped the
          proctoring stream and a silent re-arm was rejected by the browser. The
          student must re-grant the camera (a fresh gesture) rather than silently
          continue un-proctored. Suppressed once a live stream returns. */}
      {resumeRegrantNeeded && !cameraRevoked && !(proctoringRequested && isProctoringActive) && (
        <CameraRevokedOverlay
          title="Re-grant camera to continue"
          description="Your assessment is proctored. After reloading, we need to restart your camera. Please allow camera and microphone access, then click below to continue."
          onRestore={handleResumeRegrant}
          isRestoring={isRestoringCamera}
          proctoringOptional={proctoringDeclined}
          onContinueWithout={proctoringDeclined ? handleContinueWithoutRecording : undefined}
        />
      )}

      {/* Proctoring PiP */}
      <ProctorCamera stream={proctorStream} isRecording={isProctoringActive} />

      {/* Header */}
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {assessment?.title ?? 'Oral Assessment'}
          </h1>
          <div className="flex items-center justify-between mt-2">
            <div />
            <div className="flex items-center space-x-4">
              <div className="text-sm font-medium text-gray-700">
                Question {currentQuestionIndex + 1} of {questions.length}
              </div>
              {/* Per-question countdown — the SINGLE source of truth for the answer clock.
                  Written: counts from when the question mounts.
                  Oral: anchored to RECORDING START and shown only while actively
                  recording, so a student who reads/thinks before pressing Start still
                  gets the full timeLimit. The AudioRecorder no longer runs its own
                  auto-stop clock — this timer is the only thing that triggers stop+submit
                  on expiry (via handleTimerExpire). */}
              {(answerMode === 'written' || (answerMode === 'oral' && isRecording && recordingStartTime !== null)) && (
                <QuestionTimer
                  timeLimitSeconds={answerMode === 'oral' ? (currentQuestion.timeLimit ?? 300) : currentQuestion.timeLimit}
                  resetKey={answerMode === 'oral' ? `${currentQuestion.id}-rec-${recordingStartTime}` : currentQuestion.id}
                  paused={answerMode === 'oral' && isPaused}
                  /* Refresh-fairness (P4): only the WRITTEN timer persists a start
                     anchor (keyed per assessment + question) so a refresh continues
                     the countdown instead of granting a fresh full clock. The ORAL
                     timer is recording-elapsed (anchored to recording start) and is
                     deliberately NOT persisted — a refresh ends the recording, so its
                     clock restarts by design. The key namespace `qtimer_start_*` is
                     distinct from the `draft_*` keys owned by the durable-drafts task.
                     A server-stamped questionStartedAt (assumed backend contract) wins
                     over the local anchor when present. */
                  persistKey={
                    answerMode === 'written' && assessmentId
                      ? `qtimer_start_${assessmentId}_${currentQuestion.id}`
                      : undefined
                  }
                  serverStartedAtMs={
                    answerMode === 'written' ? parseServerStartedAtMs(currentQuestion.questionStartedAt) : undefined
                  }
                  onExpire={handleTimerExpire}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Error Display */}
          {error && (
            <div className="mb-4">
              <ErrorMessage error={error} onDismiss={clearError} />
              {lastFailedAction && (
                <button
                  onClick={retryLastAction}
                  className="mt-2 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 text-sm"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Submitting indicator */}
          {isSubmittingAnswer && !error && (
            <div className="mb-4 flex items-center space-x-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm text-blue-700 font-medium">Submitting answer and loading next question...</span>
            </div>
          )}

          {/* Progress Tracker — display only, no navigation */}
          <div className="mb-4">
            <ProgressTracker
              currentIndex={currentQuestionIndex}
              totalQuestions={questions.length}
              answeredCount={answeredCount}
              questionIds={questions.map((q) => q.id)}
              answeredQuestionIds={answeredQuestionIds}
              skippedQuestionIds={skippedQuestionIds}
            />
          </div>

          {/* Question Display */}
          <div className="mb-4">
            <QuestionDisplay question={currentQuestion} />
          </div>

          {/* Answer Panel — mode set by instructor */}
          <div className="mb-4">
            {answerMode === 'oral' ? (
              prepDone ? (
                <AudioRecorder
                  onSubmit={handleSubmitAudioAnswer}
                  timeLimit={currentQuestion.timeLimit ?? 300}
                />
              ) : (
                /* Preparation countdown */
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-8 text-center">
                  <p className="text-sm font-medium text-primary-700 mb-2">Preparation Time</p>
                  <div className="text-6xl font-bold text-primary-600 mb-4 tabular-nums">
                    {prepSecondsLeft !== null
                      ? `${Math.floor(prepSecondsLeft / 60)}:${String(prepSecondsLeft % 60).padStart(2, '0')}`
                      : '—'}
                  </div>
                  <p className="text-sm text-primary-600 mb-6">
                    Read the question carefully. Recording will start automatically when the timer ends.
                  </p>
                  <button
                    onClick={() => { setPrepDone(true); setPrepSecondsLeft(null); if (prepTimerRef.current) { clearInterval(prepTimerRef.current); prepTimerRef.current = null; } }}
                    className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                  >
                    I'm Ready
                  </button>
                </div>
              )
            ) : (
              <TextAnswerInput
                value={textAnswer}
                onChange={setTextAnswer}
                onSubmit={handleSubmitTextAnswer}
                isSubmitting={isUploading}
              />
            )}
          </div>

          {/* Navigation — sequential only, no going back */}
          <div className={`flex justify-end items-center ${isProctoringActive ? 'pb-32' : 'pb-6'}`}>
            {isLastQuestion ? (
              <button
                onClick={() => setShowSubmitModal(true)}
                disabled={!currentAnswered || isSubmittingAnswer}
                className="flex items-center space-x-2 bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
              >
                <span>Submit Assessment</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!currentAnswered || isSubmittingAnswer}
                className="flex items-center space-x-2 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmittingAnswer ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Loading next...</span>
                  </>
                ) : (
                  <>
                    <span>Next Question</span>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Submit Assessment?
            </h2>
            <p className="text-gray-600 mb-2">
              You've answered{' '}
              <span className="font-semibold">{answeredCount}</span> out of{' '}
              <span className="font-semibold">{questions.length}</span> questions.
            </p>
            {answeredCount < questions.length && (
              <p className="text-orange-600 text-sm mb-4">
                Answers are submitted in order and are final. The {questions.length - answeredCount} unanswered question(s) can't be revisited.
              </p>
            )}
            {answeredCount >= questions.length && (
              <p className="text-gray-500 text-sm mb-6">
                Answers are submitted in order and are final. Once submitted, your assessment will be sent for evaluation.
              </p>
            )}
            {error && (
              <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-lg">
                {error.message || 'Submission failed. Please try again.'}
              </p>
            )}
            <div className="flex space-x-3">
              <button
                onClick={() => { setShowSubmitModal(false); }}
                disabled={isLoading}
                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAssessment}
                disabled={isLoading || answeredCount < questions.length}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
              >
                {isLoading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>}{/* end assessmentStarted wrapper */}
    </div>
  );
}
