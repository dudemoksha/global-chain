import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { LogOut, User, Key, Save, AlertCircle } from 'lucide-react';

export const Profile: React.FC = () => {
  const { profile, signOut } = useAuth();
  
  // Profile Form States
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [jobTitle, setJobTitle] = useState(profile?.job_title || '');
  const [hqCountry, setHqCountry] = useState(profile?.hq_country || '');
  const [industry, setIndustry] = useState(profile?.industry || '');
  
  // Password Form States
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isErr: boolean } | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setMsg(null);
    setBusy(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          job_title: jobTitle,
          hq_country: hqCountry,
          industry,
        })
        .eq('id', profile.id);

      if (error) throw error;
      setMsg({ text: 'Profile updated successfully!', isErr: false });
    } catch (e: any) {
      setMsg({ text: e.message || 'Failed to update profile.', isErr: true });
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (password.length < 8) {
      setMsg({ text: 'Password must be at least 8 characters.', isErr: true });
      return;
    }
    if (password !== confirmPassword) {
      setMsg({ text: 'Passwords do not match.', isErr: true });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg({ text: 'Password updated successfully!', isErr: false });
      setPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      setMsg({ text: e.message || 'Failed to update password.', isErr: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-5 animate-rise space-y-6">
      {/* User Card */}
      <div className="border border-border bg-card rounded-md p-4 flex items-center gap-3">
        <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center text-primary font-display font-bold text-lg shrink-0">
          {(profile?.full_name || 'O')[0].toUpperCase()}
        </div>
        <div>
          <h3 className="text-[15px] font-medium text-foreground">{profile?.full_name || 'Operator'}</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">{profile?.job_title} · {profile?.work_email}</p>
        </div>
      </div>

      {msg && (
        <div className={`rounded-md border p-3 text-[12.5px] flex items-center gap-1.5 ${
          msg.isErr 
            ? 'border-destructive/40 bg-destructive/5 text-destructive' 
            : 'border-primary/40 bg-primary/5 text-primary'
        }`}>
          <AlertCircle size={15} />
          {msg.text}
        </div>
      )}

      {/* Edit Profile Form */}
      <div className="border border-border bg-card rounded-md p-4 space-y-4">
        <div className="flex items-center gap-1.5 border-b border-border pb-2">
          <User size={16} className="text-muted-foreground" />
          <h4 className="text-[14px] font-display font-medium">Edit Profile</h4>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-3">
          <div>
            <div className="mono-label mb-1">Full Name</div>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
            />
          </div>

          <div>
            <div className="mono-label mb-1">Job Title</div>
            <input
              type="text"
              required
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mono-label mb-1">HQ Country</div>
              <input
                type="text"
                required
                value={hqCountry}
                onChange={(e) => setHqCountry(e.target.value)}
                className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
              />
            </div>
            <div>
              <div className="mono-label mb-1">Industry</div>
              <input
                type="text"
                required
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
              />
            </div>
          </div>

          <div>
            <div className="mono-label mb-1">Organisation (Read Only)</div>
            <input
              type="text"
              disabled
              value={profile?.legal_name || ''}
              className="w-full border border-border bg-surface text-muted-foreground rounded px-2.5 py-1.5 text-[13px]"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-foreground text-background py-2.5 rounded text-[13px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Save size={14} /> Save Profile Settings
          </button>
        </form>
      </div>

      {/* Change Password Form */}
      <div className="border border-border bg-card rounded-md p-4 space-y-4">
        <div className="flex items-center gap-1.5 border-b border-border pb-2">
          <Key size={16} className="text-muted-foreground" />
          <h4 className="text-[14px] font-display font-medium">Change Password</h4>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <div className="mono-label mb-1">New Password</div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
            />
          </div>

          <div>
            <div className="mono-label mb-1">Confirm New Password</div>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !password}
            className="w-full bg-foreground text-background py-2.5 rounded text-[13px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Key size={14} /> Update Security Key
          </button>
        </form>
      </div>

      {/* Sign Out Button */}
      <button
        onClick={signOut}
        className="w-full border border-destructive/20 text-destructive py-3 rounded-md text-[13px] font-medium flex items-center justify-center gap-1.5 bg-card hover:bg-destructive/5 transition-colors"
      >
        <LogOut size={16} /> Sign Out Session
      </button>
    </div>
  );
};
