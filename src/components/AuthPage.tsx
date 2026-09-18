import React, { useState } from 'react';

interface AuthPageProps {
  onSignIn: () => Promise<void>;
  onNavigate: (view: string) => void;
}

export default function AuthPage({ onSignIn, onNavigate }: AuthPageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Animated aurora background layers */}
      <div className="auth-aurora" />
      <div className="auth-aurora auth-aurora-2" />
      <div className="auth-aurora auth-aurora-3" />
      <div className="auth-grid-overlay" />

      {/* Centered immersive content */}
      <div className="auth-center">
        {/* Animated orb */}
        <div className="auth-orb-wrapper">
          <div className="auth-orb-ring" />
          <div className="auth-orb-ring auth-orb-ring-2" />
          <div className="auth-orb">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c0 1 4 3 6 3s6-2 6-3v-5" />
            </svg>
          </div>
        </div>

        {/* Headline */}
        <h1 className="auth-headline">
          Your AI <span className="auth-gradient-text">Study Companion</span>
        </h1>
        <p className="auth-tagline">
          Upload documents. Generate summaries, quizzes, and flashcards — instantly.
        </p>

        {/* Feature pills */}
        <div className="auth-pills">
          <span className="auth-pill">📑 Summaries</span>
          <span className="auth-pill">📝 Quizzes</span>
          <span className="auth-pill">🗂️ Flashcards</span>
          <span className="auth-pill">💬 AI Chat</span>
        </div>

        {/* Sign-in card */}
        <div className="auth-glass-card">
          {error && (
            <div className="auth-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            id="google-signin-button"
            className="google-signin-btn"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {loading ? (
              <div className="auth-spinner" />
            ) : (
              <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.78 1.18 5.07l3.66-2.98z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            <span>{loading ? 'Signing in…' : 'Continue with Google'}</span>
          </button>

        </div>

        {/* Legal */}
        <div className="auth-legal">
          By continuing, you agree to our{' '}
          <button className="auth-link" onClick={() => onNavigate('terms')}>Terms</button>
          {' '}and{' '}
          <button className="auth-link" onClick={() => onNavigate('privacy')}>Privacy Policy</button>.
        </div>
      </div>
    </div>
  );
}
