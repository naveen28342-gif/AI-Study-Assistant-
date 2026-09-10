import React from 'react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  return (
    <div className="legal-page">
      <div className="legal-header">
        <button className="legal-back-btn" onClick={onBack}>
          ← Back
        </button>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: September 2026</p>
      </div>

      <div className="legal-content">
        <section className="legal-section">
          <h2>1. Introduction</h2>
          <p>
            Welcome to AI Study Assistant ("we," "our," or "us"). We respect your privacy and are
            committed to protecting your personal data. This Privacy Policy explains how we collect,
            use, store, and protect your information when you use our application.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Information We Collect</h2>
          <h3>Account Information</h3>
          <p>
            When you sign in with Google, we receive your name, email address, and profile picture
            from your Google account. This information is used to create and maintain your account.
          </p>
          <h3>Study Data</h3>
          <p>
            We store the following data that you create while using the app:
          </p>
          <ul>
            <li>Names of documents and photos you upload (the files themselves are not stored on our database servers)</li>
            <li>Conversation messages between you and the AI assistant</li>
            <li>Generated summaries, quiz questions, and flashcards</li>
            <li>Quiz scores and learning progress</li>
          </ul>
          <h3>Usage Data</h3>
          <p>
            We may collect basic usage information such as timestamps and session activity to improve
            the service.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Provide and maintain the AI Study Assistant service</li>
            <li>Sync your study data across devices</li>
            <li>Authenticate your identity and secure your account</li>
            <li>Improve and optimize the application</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Data Storage & Security</h2>
          <p>
            Your data is stored securely using <strong>Supabase</strong>, a hosted PostgreSQL database
            with encryption at rest and in transit. We implement Row Level Security (RLS) policies to
            ensure that each user can only access their own data.
          </p>
          <p>
            Documents and photos are processed in your browser and sent directly to Google's Gemini API for
            analysis. We do not store or retain your raw files on our database servers.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Third-Party Services</h2>
          <p>We use the following third-party services:</p>
          <ul>
            <li>
              <strong>Google OAuth</strong> — for authentication. Google's privacy policy applies to
              the sign-in process.
            </li>
            <li>
              <strong>Google Gemini API</strong> — for AI-powered content generation. Your uploaded document
              and photo content is sent to Google's servers for processing. Please refer to Google's AI terms of service.
            </li>
            <li>
              <strong>Supabase</strong> — for database hosting and authentication infrastructure.
            </li>
            <li>
              <strong>Vercel</strong> — for application hosting.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Data Retention & Deletion</h2>
          <p>
            You can delete your study sessions and conversations at any time from within the app.
            Deleted data is permanently removed from our database.
          </p>
          <p>
            If you wish to delete your entire account and all associated data, please contact us
            and we will process your request within 30 days.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Export your data in a portable format</li>
            <li>Withdraw consent at any time by signing out and deleting your account</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>8. Children's Privacy</h2>
          <p>
            Our service is not directed to children under 13. We do not knowingly collect personal
            information from children under 13.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes by
            posting the new Privacy Policy on this page and updating the "Last updated" date.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please reach out through our
            application's support channels.
          </p>
        </section>
      </div>
    </div>
  );
}
