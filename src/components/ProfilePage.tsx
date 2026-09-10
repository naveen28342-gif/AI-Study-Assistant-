import React, { useEffect, useState } from 'react';
import type { UserProfile } from '../hooks/useAuth';
import { updateProfile, getUserConversationCount } from '../services/database';

interface ProfilePageProps {
  profile: UserProfile | null;
  onBack: () => void;
  onNavigate: (view: string) => void;
  onSignOut: () => Promise<void>;
  onProfileUpdated: () => void;
}

export default function ProfilePage({
  profile,
  onBack,
  onNavigate,
  onSignOut,
  onProfileUpdated
}: ProfilePageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [conversationCount, setConversationCount] = useState(0);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setAvatarUrl(profile.avatar_url || '');
      getUserConversationCount(profile.id).then(setConversationCount);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await updateProfile(profile.id, {
        display_name: displayName.trim(),
        avatar_url: avatarUrl.trim()
      });
      setSaveMessage('Profile updated successfully!');
      setIsEditing(false);
      onProfileUpdated();
    } catch (err) {
      setSaveMessage('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(profile?.display_name || '');
    setAvatarUrl(profile?.avatar_url || '');
    setIsEditing(false);
    setSaveMessage(null);
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'Unknown';

  return (
    <div className="profile-page">
      <div className="profile-header-bar">
        <button className="profile-back-btn" onClick={onBack}>
          ← Back to Chat
        </button>
        <h2>My Profile</h2>
        <div style={{ width: 120 }} />
      </div>

      <div className="profile-content">
        <div className="profile-card">
          <div className="profile-avatar-section">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                className="profile-avatar-img"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="profile-avatar-placeholder">
                {(profile?.display_name || profile?.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            {!isEditing && (
              <button className="profile-edit-btn" onClick={() => setIsEditing(true)}>
                ✏️ Edit Profile
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="profile-edit-form">
              <div className="profile-field">
                <label>Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="profile-input"
                />
              </div>
              <div className="profile-field">
                <label>Avatar URL</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="profile-input"
                />
              </div>
              <div className="profile-field">
                <label>Email</label>
                <input
                  type="email"
                  value={profile?.email || ''}
                  disabled
                  className="profile-input disabled"
                />
                <span className="profile-hint">Email cannot be changed</span>
              </div>
              <div className="profile-edit-actions">
                <button
                  className="profile-save-btn"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  className="profile-cancel-btn"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-info">
              <div className="profile-info-row">
                <span className="profile-info-label">Name</span>
                <span className="profile-info-value">{profile?.display_name || 'Not set'}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Email</span>
                <span className="profile-info-value">{profile?.email || 'Not set'}</span>
              </div>
            </div>
          )}

          {saveMessage && (
            <div className={`profile-toast ${saveMessage.includes('Failed') ? 'error' : 'success'}`}>
              {saveMessage}
            </div>
          )}
        </div>

        <div className="profile-stats-card">
          <h3>Account Stats</h3>
          <div className="profile-stat-grid">
            <div className="profile-stat-item">
              <span className="profile-stat-value">{conversationCount}</span>
              <span className="profile-stat-label">Study Sessions</span>
            </div>
            <div className="profile-stat-item">
              <span className="profile-stat-value">{memberSince}</span>
              <span className="profile-stat-label">Member Since</span>
            </div>
          </div>
        </div>

        <div className="profile-links-card">
          <h3>Legal & Info</h3>
          <button className="profile-link-row" onClick={() => onNavigate('privacy')}>
            <span>🔒</span>
            <span>Privacy Policy</span>
            <span className="profile-link-arrow">→</span>
          </button>
          <button className="profile-link-row" onClick={() => onNavigate('terms')}>
            <span>📋</span>
            <span>Terms & Conditions</span>
            <span className="profile-link-arrow">→</span>
          </button>
        </div>

        <button className="profile-signout-btn" onClick={onSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
