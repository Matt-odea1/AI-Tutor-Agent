import AppShell from '../components/AppShell';
import CreateAssessmentForm from '../components/CreateAssessmentForm';
import SetupStepIndicator from '../components/SetupStepIndicator';

export default function CreateAssessment() {
  return (
    <AppShell
      breadcrumbs={[{ label: 'Assessments', to: '/assessments' }, { label: 'Create Assessment' }]}
      title="Create Assessment"
      subtitle="Define the assessment, then upload students and generate questions."
      maxWidth="narrow"
      /*
        The step trail replaces the "Step 1 of 4" prose that used to be spelled
        into the subtitle. There is no assessment id yet at step 1 — the
        indicator only links steps BELOW the current one, of which there are
        none here, so the empty id is never turned into a path.
      */
      banner={<SetupStepIndicator currentStep={1} assessmentId="" maxWidth="narrow" />}
    >
      <div className="bg-paper border border-hairline rounded-xl p-6 sm:p-8">
        <CreateAssessmentForm />
      </div>
    </AppShell>
  );
}
