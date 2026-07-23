import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { User, Key, Save, AlertCircle, LogOut } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile · Global-Chain" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    return null;
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = me;

  // Profile Form States
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [jobTitle, setJobTitle] = useState(profile?.job_title || "");
  const [hqCountry, setHqCountry] = useState(profile?.hq_country || "");
  const [industry, setIndustry] = useState(profile?.industry || "");

  // Password Form States
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isErr: boolean } | null>(null);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setMsg(null);
    setBusy(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          job_title: jobTitle.trim(),
          hq_country: hqCountry.trim(),
          industry: industry.trim(),
        })
        .eq("id", profile.id);

      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["me"] });
      setMsg({ text: "Profile updated successfully!", isErr: false });
    } catch (e: any) {
      setMsg({ text: e.message || "Failed to update profile.", isErr: true });
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (password.length < 8) {
      setMsg({ text: "Password must be at least 8 characters.", isErr: true });
      return;
    }
    if (password !== confirmPassword) {
      setMsg({ text: "Passwords do not match.", isErr: true });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg({ text: "Password updated successfully!", isErr: false });
      setPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      setMsg({ text: e.message || "Failed to update password.", isErr: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell isAdmin={me.isAdmin} email={profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[640px] px-6 pb-16 pt-10">
        {/* Header */}
        <div className="mb-8">
          <div className="mono-label">§ Settings</div>
          <h1 className="mt-2 font-display text-[30px] font-medium tracking-tight">Account Profile</h1>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            Manage your personal profile details, organization metadata, and credentials.
          </p>
        </div>

        {/* User Card */}
        <div className="border border-border bg-card rounded-md p-5 flex items-center gap-4 mb-6">
          <div className="h-14 w-14 bg-primary/10 rounded-full flex items-center justify-center text-primary font-display font-bold text-xl shrink-0">
            {(profile?.full_name || "O")[0].toUpperCase()}
          </div>
          <div>
            <h3 className="text-[16px] font-medium text-foreground">{profile?.full_name || "Operator"}</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {profile?.job_title || "No Title"} · {profile?.work_email}
            </p>
          </div>
        </div>

        {msg && (
          <div
            className={`rounded-md border p-4 mb-6 text-[13px] flex items-center gap-2 ${
              msg.isErr
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-primary/40 bg-primary/5 text-primary"
            }`}
          >
            <AlertCircle size={16} />
            {msg.text}
          </div>
        )}

        {/* Edit Profile Form */}
        <div className="border border-border bg-card rounded-md p-6 space-y-6 mb-6">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <User size={18} className="text-muted-foreground" />
            <h4 className="text-[15px] font-display font-medium">Edit Profile Settings</h4>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <div className="mono-label mb-1.5">Full Name</div>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="fld"
              />
            </div>

            <div>
              <div className="mono-label mb-1.5">Job Title</div>
              <input
                type="text"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="fld"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mono-label mb-1.5">HQ Country</div>
                <input
                  type="text"
                  required
                  value={hqCountry}
                  onChange={(e) => setHqCountry(e.target.value)}
                  className="fld"
                />
              </div>
              <div>
                <div className="mono-label mb-1.5">Industry</div>
                <input
                  type="text"
                  required
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="fld"
                />
              </div>
            </div>

            <div>
              <div className="mono-label mb-1.5">Organisation (Read Only)</div>
              <input
                type="text"
                disabled
                value={profile?.legal_name || ""}
                className="fld bg-surface text-muted-foreground opacity-60 cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-foreground text-background py-2.5 rounded-md text-[13px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-60 hover:opacity-90 transition-opacity"
            >
              <Save size={15} /> Save Settings
            </button>
          </form>
        </div>

        {/* Change Password Form */}
        <div className="border border-border bg-card rounded-md p-6 space-y-6 mb-6">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Key size={18} className="text-muted-foreground" />
            <h4 className="text-[15px] font-display font-medium">Change Password</h4>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <div className="mono-label mb-1.5">New Password</div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="fld"
              />
            </div>

            <div>
              <div className="mono-label mb-1.5">Confirm New Password</div>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="fld"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !password}
              className="w-full bg-foreground text-background py-2.5 rounded-md text-[13px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-60 hover:opacity-90 transition-opacity"
            >
              <Key size={15} /> Update Password
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
      <style>{`.fld{width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:13.5px;background:transparent}.fld:focus{outline:none;border-color:var(--border-strong)}`}</style>
    </AppShell>
  );
}
