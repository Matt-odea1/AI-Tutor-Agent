import SEO from '../shared/SEO'

/**
 * Data Usage Information Page
 */
const DataUsage = () => {
  return (
    <>
      {/* SEO Meta Tags */}
      <SEO
        title="Data Usage & Privacy"
        description="Learn how your data is collected, used, and protected in the AI Tutor research study. Information about privacy, data storage, and your rights."
        keywords="data usage, privacy policy, research study, COMP9021, data protection"
        noIndex={true}
      />

      <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="py-12 px-4">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-8">
        <div className="mb-6">
          <a 
            href="/" 
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            ← Back to Chat
          </a>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">How Is My Data Used?</h1>
        
        <div className="space-y-6 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">About This Research Study</h2>
            <p>
              This AI tutor is part of a research project studying how course-specific AI assistants 
              support student learning in COMP9021. Participation is voluntary and you can choose to 
              use the tool without participating in the research study.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">What Data Is Collected</h2>
            <p className="mb-2">
              Throughout the teaching weeks, the system collects anonymised usage data from 
              consenting students, including:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your chat conversations with the AI tutor (questions and responses)</li>
              <li>Code submissions and debugging requests</li>
              <li>How often the tutor is used and session information</li>
              <li>Types of questions asked (e.g., practice questions, debugging help, content recap)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">How Your Data Is Used</h2>
            <p className="mb-2">Your data serves two purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Learning Support:</strong> To provide you with personalized responses, 
                maintain conversation history across sessions, and generate relevant educational 
                content tailored to your needs
              </li>
              <li>
                <strong>Research Analysis:</strong> To understand how students interact with a 
                course-specific AI assistant and evaluate the effectiveness of AI tutoring tools 
                in programming education
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Privacy & Security</h2>
            <p className="mb-2">
              We take your privacy seriously:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>All research data is <strong>de-identified and anonymised</strong></li>
              <li>Data is stored securely in encrypted databases with access controls</li>
              <li>Session data includes Time-To-Live (TTL) mechanisms to automatically remove old sessions</li>
              <li>Data is kept only for the period required by UNSW research policy</li>
              <li>Your data is not shared with third parties for marketing purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Your Rights & Consent</h2>
            <p className="mb-2">
              At the beginning of term, you can choose whether to participate in the research study. 
              Only consenting students' data is included in research analysis. You have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the AI tutor without participating in the research</li>
              <li>Withdraw your consent for research participation at any time</li>
              <li>Delete individual chat sessions through the interface</li>
              <li>Request complete data removal by contacting the research team</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Research Methodology</h2>
            <p>
              This study uses a mixed-methods research design, combining quantitative data (usage logs, 
              interaction patterns) with qualitative data (survey responses about your experience). 
              This approach helps us understand both <em>what</em> happens when students use AI tutors 
              and <em>why</em> it happens, giving a more complete picture of how these tools affect 
              learning, confidence, and academic integrity.
            </p>
          </section>

          <section className="bg-blue-50 p-4 rounded-lg">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Questions or Concerns?</h2>
            <p>
              If you have questions about the research study, data usage, or your rights as a 
              participant, please contact the COMP9021 course convenor or refer to the participant 
              information sheet provided at the beginning of term.
            </p>
          </section>
        </div>
        </div>
      </div>
    </div>
    </>
  )
}

export default DataUsage
