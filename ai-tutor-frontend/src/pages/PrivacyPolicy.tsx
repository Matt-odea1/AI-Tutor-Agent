import SEO from '../shared/SEO'

const PrivacyPolicy = () => {
  return (
    <>
      <SEO
        title="Privacy Policy"
        description="Privacy Policy for Chat9021 AI Tutor, including data collection, Google sign-in information, data retention, and user rights."
        keywords="privacy policy, Chat9021, Google OAuth, data protection, AI tutor"
        url="https://app.chat9021.org/privacypolicy"
      />

      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-8">
          <div className="mb-6">
            <a href="/" className="text-primary-600 hover:text-primary-700 font-medium">
              ← Back to App
            </a>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: March 5, 2026</p>

          <div className="space-y-6 text-gray-700">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Overview</h2>
              <p>
                Chat9021 ("we", "our", "us") provides an AI tutoring assistant for programming learning.
                This policy explains what information we collect, how we use it, and your choices.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Information We Collect</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Account information such as email address and basic profile details.</li>
                <li>Chat and assistant interaction content you submit in the app.</li>
                <li>Code snippets, execution output, and error messages you choose to run.</li>
                <li>Session and usage metadata (timestamps, feature usage, and device/browser basics).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Google Sign-In Data</h2>
              <p className="mb-2">
                If you sign in with Google, we access only the minimum data required for authentication and account management,
                such as your Google account email and basic profile identifier.
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>We do not sell your Google user data.</li>
                <li>We do not use Google user data for advertising.</li>
                <li>We use Google user data only to provide and secure the app experience.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">How We Use Information</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Provide AI tutoring responses and maintain conversation context.</li>
                <li>Support code editing, execution, and learning workflows.</li>
                <li>Improve reliability, safety, and educational quality of the service.</li>
                <li>Detect abuse, prevent fraud, and enforce platform security.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Sharing</h2>
              <p className="mb-2">We may share data only with trusted service providers that help operate the platform (for example, hosting, storage, and authentication providers), under contractual confidentiality and security obligations.</p>
              <p>We do not sell personal information to third parties.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Retention and Security</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>We retain data only as long as needed for service delivery, security, and legitimate academic/research operations.</li>
                <li>We use access controls and standard security practices to protect stored data.</li>
                <li>You may request deletion of your account data, subject to legal or institutional obligations.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Your Choices</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>You can sign out at any time.</li>
                <li>You can delete chat/program history items from the interface when available.</li>
                <li>You can contact us to request access, correction, or deletion of your data.</li>
              </ul>
            </section>

            <section className="bg-blue-50 p-4 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
              <p>
                For privacy-related requests, contact the Chat9021 team via your course support channel on Ed,
                or use the contact details provided in the app onboarding and course communications.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Policy Updates</h2>
              <p>
                We may update this Privacy Policy from time to time. Any changes will be posted on this page
                with an updated "Last updated" date.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  )
}

export default PrivacyPolicy
