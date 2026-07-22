import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { 
  getPlatformStats, 
  listAllProfiles, 
  decideProfile, 
  setCompanyStatus, 
  listAuditLogs, 
  adminListUsers, 
  adminCreateUser, 
  adminUpdateUser, 
  adminDeleteUser, 
  adminSetPassword, 
  adminGetUserActivity,
  listPasswordResetRequests,
  approvePasswordResetRequest,
  rejectPasswordResetRequest
} from '../lib/server-fns';
import { 
  Users, 
  AlertTriangle, 
  Package, 
  Warehouse,
  Plus, 
  Check, 
  X, 
  Eye, 
  ShieldAlert,
  ArrowRight,
  UserCheck,
  UserX,
  Lock,
  Edit2,
  Trash2,
  Search,
  Settings,
  Activity as ActivityIcon,
  Globe
} from 'lucide-react';

type AdminTab = 'overview' | 'approvals' | 'resets' | 'users' | 'activity';

export const Dashboard: React.FC = () => {
  const { profile, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // User Stats
  const [suppliersCount, setSuppliersCount] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [factoriesCount, setFactoriesCount] = useState(0);
  const [watchedSuppliers, setWatchedSuppliers] = useState<any[]>([]);

  // Admin Dashboard States
  const [adminTab, setAdminTab] = useState<AdminTab>('overview');
  const [adminStats, setAdminStats] = useState({ companies: 0, approved: 0, suppliers: 0, alerts: 0 });
  const [profiles, setProfiles] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [resetsList, setResetsList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Users Tab Filters & Modals
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'operator'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Activity log drilldown state
  const [drilldownUser, setDrilldownUser] = useState<any>(null);
  const [userActivity, setUserActivity] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Form Field States for Create/Edit User
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formLegalName, setFormLegalName] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formHqCountry, setFormHqCountry] = useState('');
  const [formIndustry, setFormIndustry] = useState('');
  const [formTierRole, setFormTierRole] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'operator'>('operator');
  const [formApprove, setFormApprove] = useState(true);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    if (!user) return;
    setLoading(true);
    setFetchErr(null);

    try {
      if (isAdmin) {
        // Fetch Admin Console dataset via Vercel Edge Server Functions
        const [statsData, profilesData, usersData, resetsData] = await Promise.all([
          getPlatformStats().catch(async (err) => {
            console.warn('getPlatformStats failed, falling back to direct db select:', err);
            try {
              const [{ count: companiesCount }, { count: approvedCount }, { count: suppliersCount }] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_approved', true),
                supabase.from('suppliers').select('*', { count: 'exact', head: true }),
              ]);
              const { count: alertsCount } = await supabase.from('alerts').select('*', { count: 'exact', head: true });
              return {
                companies: companiesCount || 0,
                approved: approvedCount || 0,
                suppliers: suppliersCount || 0,
                alerts: alertsCount || 0
              };
            } catch (dbErr: any) {
              console.error('Stats fallback failed:', dbErr);
              setFetchErr((p) => (p ? p + '\n' : '') + 'Stats direct select failed: ' + dbErr.message);
              return { companies: 0, approved: 0, suppliers: 0, alerts: 0 };
            }
          }),
          listAllProfiles().catch(async (err) => {
            console.warn('listAllProfiles failed, falling back to direct db select:', err);
            try {
              const { data: profiles, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });
              if (error) throw error;
              return profiles || [];
            } catch (dbErr: any) {
              console.error('Profiles fallback failed:', dbErr);
              setFetchErr((p) => (p ? p + '\n' : '') + 'Profiles direct select failed: ' + dbErr.message);
              return [];
            }
          }),
          adminListUsers().catch(async (err) => {
            console.warn('adminListUsers failed, falling back to direct db select:', err);
            try {
              const [{ data: profiles }, { data: roles }] = await Promise.all([
                supabase.from('profiles').select('*').order('created_at', { ascending: false }),
                supabase.from('user_roles').select('user_id, role')
              ]);
              const roleMap = new Map<string, string[]>();
              (roles || []).forEach((r: any) => {
                const arr = roleMap.get(r.user_id) || [];
                arr.push(r.role);
                roleMap.set(r.user_id, arr);
              });
              return (profiles || []).map((p: any) => ({
                ...p,
                roles: roleMap.get(p.id) || [],
                is_admin: (roleMap.get(p.id) || []).includes('admin')
              }));
            } catch (dbErr: any) {
              console.error('Users fallback failed:', dbErr);
              setFetchErr((p) => (p ? p + '\n' : '') + 'Users direct select failed: ' + dbErr.message);
              return [];
            }
          }),
          listPasswordResetRequests().catch(async (err) => {
            console.warn('listPasswordResetRequests failed, falling back to direct db select:', err);
            try {
              const { data, error } = await supabase
                .from('password_reset_requests' as any)
                .select('*')
                .order('created_at', { ascending: false });
              if (error) throw error;
              return data || [];
            } catch (dbErr: any) {
              console.error('Resets fallback failed:', dbErr);
              return [];
            }
          }),
        ]);

        setAdminStats(statsData || { companies: 0, approved: 0, suppliers: 0, alerts: 0 });
        setProfiles(Array.isArray(profilesData) ? profilesData : []);
        setUsersList(Array.isArray(usersData) ? usersData : []);
        setResetsList(Array.isArray(resetsData) ? resetsData : []);
      } else {
        // Fetch User Dashboard Info
        const [
          { count: supCount },
          { count: alertsCount },
          { data: invData },
          { count: facCount },
          { data: watchData }
        ] = await Promise.all([
          supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
          supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null),
          supabase.from('inventory_items').select('id, current_stock, safety_stock, reorder_level').eq('owner_id', user.id),
          supabase.from('factories').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
          supabase.from('supplier_watches')
            .select('supplier_id, suppliers(id, criticality, organizations(display_name, country))')
            .eq('user_id', user.id)
        ]);

        setSuppliersCount(supCount || 0);
        setUnreadAlerts(alertsCount || 0);
        setFactoriesCount(facCount || 0);

        const lowStock = (invData ?? []).filter((i: any) => i.current_stock <= i.reorder_level).length;
        setLowStockCount(lowStock);

        const formattedWatches = (watchData ?? []).map((w: any) => ({
          id: w.suppliers?.id,
          name: w.suppliers?.organizations?.display_name || 'Unknown',
          country: w.suppliers?.organizations?.country || 'N/A',
          criticality: w.suppliers?.criticality || 'medium'
        }));
        setWatchedSuppliers(formattedWatches);
      }
    } catch (e) {
      console.error('Error fetching dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user, isAdmin]);

  // Admin: Decide profile request (Approve/Reject)
  const handleDecision = async (targetId: string, approve: boolean) => {
    let reason = '';
    if (!approve) {
      const r = prompt('Reason for rejection (optional):');
      if (r === null) return; // user cancelled prompt
      reason = r;
    }

    setBusyId(targetId);
    try {
      await decideProfile({
        userId: targetId,
        decision: approve ? 'approve' : 'reject',
        reason
      });
      fetchDashboardData();
    } catch (e: any) {
      alert(e.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  // Admin: Toggle Suspend status
  const handleToggleStatus = async (u: any) => {
    setBusyId(u.id);
    try {
      const nextStatus = u.status === 'suspended' ? 'active' : 'suspended';
      await setCompanyStatus({ userId: u.id, status: nextStatus });
      fetchDashboardData();
    } catch (e: any) {
      alert(e.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  // Admin: Toggle Role (make admin / revoke admin)
  const handleToggleRole = async (u: any) => {
    setBusyId(u.id);
    try {
      const nextRole = u.is_admin ? 'operator' : 'admin';
      await adminUpdateUser({ userId: u.id, role: nextRole });
      fetchDashboardData();
    } catch (e: any) {
      alert(e.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  // Admin: Delete User
  const handleDeleteUser = async (u: any) => {
    if (!confirm(`Permanently delete account ${u.work_email}?`)) return;
    setBusyId(u.id);
    try {
      await adminDeleteUser({ userId: u.id });
      fetchDashboardData();
    } catch (e: any) {
      alert(e.message || 'Failed to delete user.');
    } finally {
      setBusyId(null);
    }
  };

  // Form Resets
  const resetForm = () => {
    setFormEmail('');
    setFormPassword('');
    setFormFullName('');
    setFormLegalName('');
    setFormJobTitle('');
    setFormHqCountry('');
    setFormIndustry('');
    setFormTierRole('');
    setFormRole('operator');
    setFormApprove(true);
    setFormErr(null);
    setSelectedUser(null);
  };

  // Admin: Create User Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setFormBusy(true);

    try {
      await adminCreateUser({
        email: formEmail,
        password: formPassword,
        fullName: formFullName,
        legalName: formLegalName,
        jobTitle: formJobTitle,
        hqCountry: formHqCountry,
        industry: formIndustry,
        tierRole: formTierRole,
        role: formRole,
        approve: formApprove,
      });

      setShowCreateModal(false);
      resetForm();
      fetchDashboardData();
    } catch (err: any) {
      setFormErr(err.message || 'Failed to create user account.');
    } finally {
      setFormBusy(false);
    }
  };

  // Admin: Edit User Open
  const openEditUser = (u: any) => {
    setSelectedUser(u);
    setFormFullName(u.full_name || '');
    setFormLegalName(u.legal_name || '');
    setFormJobTitle(u.job_title || '');
    setFormHqCountry(u.hq_country || '');
    setFormIndustry(u.industry || '');
    setFormTierRole(u.tier_role || '');
    setFormRole(u.is_admin ? 'admin' : 'operator');
    setShowEditModal(true);
  };

  // Admin: Edit User Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormErr(null);
    setFormBusy(true);

    try {
      await adminUpdateUser({
        userId: selectedUser.id,
        fullName: formFullName,
        legalName: formLegalName,
        jobTitle: formJobTitle,
        hqCountry: formHqCountry,
        industry: formIndustry,
        tierRole: formTierRole,
        role: formRole,
      });

      setShowEditModal(false);
      resetForm();
      fetchDashboardData();
    } catch (err: any) {
      setFormErr(err.message || 'Failed to update user account.');
    } finally {
      setFormBusy(false);
    }
  };

  // Admin: Set Password Submit
  const handlePwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !formPassword) return;
    setFormErr(null);
    setFormBusy(true);

    try {
      await adminSetPassword({
        userId: selectedUser.id,
        password: formPassword
      });

      setShowPwModal(false);
      resetForm();
    } catch (err: any) {
      setFormErr(err.message || 'Failed to update password.');
    } finally {
      setFormBusy(false);
    }
  };

  // Admin: Fetch user activity
  const selectDrilldownActivity = async (u: any) => {
    setDrilldownUser(u);
    setUserActivity([]);
    setLoadingActivity(true);
    try {
      const logs = await adminGetUserActivity({ userId: u.id }).catch(async (err) => {
        console.warn('adminGetUserActivity failed, falling back to direct db select:', err);
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('actor_id', u.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      });
      setUserActivity(logs || []);
    } catch (e) {
      console.error('Error fetching activity logs:', e);
    } finally {
      setLoadingActivity(false);
    }
  };

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (roleFilter === 'admin' && !u.is_admin) return false;
      if (roleFilter === 'operator' && u.is_admin) return false;
      if (!userSearch) return true;
      const q = userSearch.toLowerCase();
      return (u.work_email || '').toLowerCase().includes(q) ||
             (u.full_name || '').toLowerCase().includes(q) ||
             (u.legal_name || '').toLowerCase().includes(q);
    });
  }, [usersList, userSearch, roleFilter]);

  // Profiles count metrics
  const pendingCount = profiles.filter((p) => !p.is_approved && !p.reviewed_at).length;
  const approvedCount = profiles.filter((p) => p.is_approved).length;
  const rejectedCount = profiles.filter((p) => !p.is_approved && p.reviewed_at).length;

  const topCountries = useMemo(() => {
    const m = new Map<string, number>();
    profiles.forEach((p) => {
      const c = (p.hq_country || 'Unknown').trim() || 'Unknown';
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [profiles]);

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-2 text-[12px] text-muted-foreground">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 animate-rise space-y-6">
      {/* Welcome info header */}
      <div>
        <span className="mono-label">§ Operational Node</span>
        <h2 className="mt-1 font-display text-2xl font-semibold text-foreground">
          Welcome, {profile?.full_name || 'Operator'}
        </h2>
        <p className="text-[12.5px] text-muted-foreground mt-0.5 font-mono">
          Namespace: {profile?.legal_name || 'System Catalog'}
        </p>
      </div>

      {fetchErr && (
        <div className="border border-destructive bg-destructive/5 text-destructive p-3.5 rounded text-[12px] font-mono whitespace-pre-wrap leading-relaxed">
          <strong>Backend Fetch Error:</strong> {fetchErr}
        </div>
      )}

      {isAdmin ? (
        /* ==================== ADMIN DASHBOARD LAYOUT ==================== */
        <div className="space-y-5">
          {/* Admin Tabs */}
          <div className="flex border border-border rounded-md p-1 bg-surface">
            {([
              { id: 'overview', label: 'Overview', badge: undefined },
              { id: 'approvals', label: 'Queue', badge: pendingCount || undefined },
              { id: 'resets', label: 'Resets', badge: resetsList.filter(r => r.status === 'pending').length || undefined },
              { id: 'users', label: 'Users', badge: undefined },
              { id: 'activity', label: 'Audit Log', badge: undefined }
            ] as Array<{ id: AdminTab; label: string; badge?: number }>).map((t) => (
              <button
                key={t.id}
                onClick={() => setAdminTab(t.id)}
                className={`flex-1 text-center py-2 rounded text-[11px] font-semibold transition-colors relative ${
                  adminTab === t.id 
                    ? 'bg-background text-foreground border border-border shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                {t.badge && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>

          {/* 1. OVERVIEW TAB */}
          {adminTab === 'overview' && (
            <div className="space-y-4">
              {/* Mini Stats Grid */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="border border-border bg-card p-3 rounded-md">
                  <span className="text-[9px] mono-label block">Organizations</span>
                  <span className="text-[18px] font-semibold block mt-0.5">{adminStats.companies}</span>
                </div>
                <div className="border border-border bg-card p-3 rounded-md">
                  <span className="text-[9px] mono-label block">Approved</span>
                  <span className="text-[18px] font-semibold block mt-0.5">{approvedCount}</span>
                </div>
                <div className="border border-border bg-card p-3 rounded-md">
                  <span className="text-[9px] mono-label block">Queue Pending</span>
                  <span className="text-[18px] font-semibold text-primary block mt-0.5">{pendingCount}</span>
                </div>
                <div className="border border-border bg-card p-3 rounded-md">
                  <span className="text-[9px] mono-label block">Suppliers Indexed</span>
                  <span className="text-[18px] font-semibold block mt-0.5">{adminStats.suppliers}</span>
                </div>
              </div>

              {/* Recent Operator Registrations */}
              <div className="border border-border bg-card rounded-md p-4 space-y-3">
                <h4 className="text-[13px] font-medium text-foreground">Recent Registrations</h4>
                {profiles.slice(0, 5).length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No signups found.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {profiles.slice(0, 5).map((p) => (
                      <div key={p.id} className="py-2.5 flex justify-between items-center text-[12.5px]">
                        <div>
                          <div className="font-medium">{p.legal_name || 'Individual'}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{p.work_email} · {p.hq_country}</div>
                        </div>
                        <span className={`text-[10px] font-mono border px-1.5 py-0.5 rounded uppercase ${
                          p.is_approved ? 'border-primary/20 bg-primary/5 text-primary' :
                          p.reviewed_at ? 'border-destructive/20 bg-destructive/5 text-destructive' :
                          'border-border text-muted-foreground'
                        }`}>
                          {p.is_approved ? 'Approved' : p.reviewed_at ? 'Rejected' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top countries list */}
              <div className="border border-border bg-card rounded-md p-4 space-y-3">
                <h4 className="text-[13px] font-medium text-foreground">Top HQ Countries</h4>
                {topCountries.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No country breakdown data.</p>
                ) : (
                  <ul className="space-y-2 text-[12px]">
                    {topCountries.map(([c, count]) => (
                      <li key={c} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{c}</span>
                          <span className="text-muted-foreground font-mono">{count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-surface border border-border rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${(count / Math.max(1, ...topCountries.map(([, n]) => n))) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* 2. APPROVALS TAB */}
          {adminTab === 'approvals' && (
            <div className="space-y-3">
              <h3 className="mono-label">§ Pending Operator Enrolment Requests</h3>
              {pendingCount === 0 ? (
                <div className="border border-dashed border-border rounded-md p-8 text-center text-[12.5px] text-muted-foreground">
                  Queue is clear. New signups requiring trust desk vetting will appear here.
                </div>
              ) : (
                <div className="space-y-3">
                  {profiles.filter((p) => !p.is_approved && !p.reviewed_at).map((p) => (
                    <div key={p.id} className="border border-border bg-card rounded-md p-4 space-y-3">
                      <div>
                        <div className="text-[14px] font-medium">{p.full_name}</div>
                        <div className="text-[12px] text-muted-foreground mt-0.5">{p.job_title} · {p.work_email}</div>
                      </div>
                      <div className="border-t border-border pt-3 text-[12.5px] space-y-1">
                        <p className="text-muted-foreground">Company: <span className="text-foreground font-medium">{p.legal_name}</span></p>
                        <p className="text-muted-foreground">HQ: <span className="text-foreground">{p.hq_country}</span> · Industry: <span className="text-foreground">{p.industry}</span></p>
                        {p.note && <p className="text-[12px] italic text-muted-foreground mt-1 bg-surface p-2 rounded">"{p.note}"</p>}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleDecision(p.id, false)}
                          disabled={busyId === p.id}
                          className="flex-1 border border-destructive/20 text-destructive py-2 rounded text-[12px] font-semibold hover:bg-destructive/5 disabled:opacity-40"
                        >
                          Decline Request
                        </button>
                        <button
                          onClick={() => handleDecision(p.id, true)}
                          disabled={busyId === p.id}
                          className="flex-1 bg-foreground text-background py-2 rounded text-[12px] font-semibold hover:opacity-90 disabled:opacity-40"
                        >
                          Approve operator
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PASSWORD RESETS TAB */}
          {adminTab === 'resets' && (
            <div className="space-y-3">
              <h3 className="mono-label">§ Password Reset Requests</h3>
              {resetsList.length === 0 ? (
                <div className="border border-dashed border-border rounded-md p-8 text-center text-[12.5px] text-muted-foreground">
                  No password reset requests found.
                </div>
              ) : (
                <div className="space-y-3">
                  {resetsList.map((r) => (
                    <div key={r.id} className="border border-border bg-card rounded-md p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-[13.5px] font-medium text-foreground">{r.email}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Requested: {new Date(r.created_at).toLocaleString()}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-mono border px-1.5 py-0.5 rounded uppercase ${
                            r.status === 'approved'
                              ? 'border-green-500/20 bg-green-500/5 text-green-500'
                              : r.status === 'rejected'
                                ? 'border-destructive/20 bg-destructive/5 text-destructive'
                                : 'border-yellow-500/20 bg-yellow-500/5 text-yellow-500'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>

                      {r.temp_password && (
                        <div className="bg-surface p-2 rounded text-[12px] font-mono border border-border">
                          <span className="text-muted-foreground">Temp Pass:</span> <strong className="text-foreground">{r.temp_password}</strong>
                        </div>
                      )}

                      {r.status === 'pending' && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={async () => {
                              if (!window.confirm("Reject this password reset request?")) return;
                              setBusyId(r.id);
                              try {
                                await rejectPasswordResetRequest({ requestId: r.id });
                                fetchDashboardData();
                              } catch (e: any) {
                                window.alert(e.message || "Failed to reject request");
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            disabled={busyId === r.id}
                            className="flex-1 border border-destructive/20 text-destructive py-2 rounded text-[12px] font-semibold hover:bg-destructive/5 disabled:opacity-40"
                          >
                            Reject
                          </button>
                          <button
                            onClick={async () => {
                              const tempPassword = window.prompt("Enter a temporary password for this user (min 6 characters):");
                              if (!tempPassword) return;
                              if (tempPassword.trim().length < 6) {
                                window.alert("Password must be at least 6 characters.");
                                return;
                              }
                              setBusyId(r.id);
                              try {
                                await approvePasswordResetRequest({ requestId: r.id, tempPassword: tempPassword.trim() });
                                window.alert(`Approved! User can now log in using temporary password: ${tempPassword}`);
                                fetchDashboardData();
                              } catch (e: any) {
                                window.alert(e.message || "Failed to approve request");
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            disabled={busyId === r.id}
                            className="flex-1 bg-foreground text-background py-2 rounded text-[12px] font-semibold hover:opacity-90 disabled:opacity-40"
                          >
                            Approve
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. USERS TAB */}
          {adminTab === 'users' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="mono-label">Platform Accounts ({filteredUsers.length})</span>
                <button
                  onClick={() => { resetForm(); setShowCreateModal(true); }}
                  className="bg-foreground text-background px-3 py-1.5 rounded text-[12px] font-medium flex items-center gap-1"
                >
                  Create User <Plus size={14} />
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-2 relative">
                <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
                <input
                  type="text"
                  placeholder="Search user, company..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="flex-1 pl-9 pr-3 py-2 border border-border rounded-md bg-card text-[13px] outline-none"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  className="border border-border rounded bg-card text-[12px] px-2"
                >
                  <option value="all">All</option>
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                </select>
              </div>

              {/* Users list */}
              {filteredUsers.length === 0 ? (
                <div className="border border-dashed border-border rounded-md p-8 text-center text-[12.5px] text-muted-foreground">
                  No accounts match search filters.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.map((u) => {
                    const isBusy = busyId === u.id;
                    const status = !u.is_approved
                      ? u.reviewed_at ? 'Rejected' : 'Pending'
                      : u.status === 'suspended' ? 'Suspended' : 'Active';

                    return (
                      <div key={u.id} className="border border-border bg-card rounded-md p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-[14px] font-medium text-foreground">{u.full_name || 'No Display Name'}</h4>
                            <span className="text-[11px] text-muted-foreground block mt-0.5">{u.work_email}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase border ${
                              u.is_admin ? 'border-primary/20 bg-primary/5 text-primary' : 'border-border text-muted-foreground'
                            }`}>
                              {u.is_admin ? 'Admin' : 'Operator'}
                            </span>
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase border ${
                              status === 'Active' ? 'border-primary/20 bg-primary/5 text-primary' :
                              status === 'Suspended' ? 'border-destructive/20 bg-destructive/5 text-destructive' :
                              'border-border text-muted-foreground'
                            }`}>
                              {status}
                            </span>
                          </div>
                        </div>

                        <div className="text-[12.5px] bg-surface rounded-md border border-border p-2.5 font-mono space-y-0.5 text-muted-foreground">
                          <div>Org: <span className="text-foreground">{u.legal_name || 'N/A'}</span></div>
                          <div>Job: <span className="text-foreground">{u.job_title || 'N/A'}</span></div>
                          {u.hq_country && <div>HQ: <span className="text-foreground">{u.hq_country}</span></div>}
                          {u.tier_role && <div>Tier: <span className="text-foreground capitalize">{u.tier_role}</span></div>}
                        </div>

                        {/* User Action Buttons Row */}
                        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                          <button
                            onClick={() => openEditUser(u)}
                            disabled={isBusy}
                            className="px-2 py-1 text-[11px] font-medium border border-border hover:bg-surface rounded text-foreground flex items-center gap-0.5"
                          >
                            <Edit2 size={11} /> Edit
                          </button>
                          <button
                            onClick={() => { setSelectedUser(u); setFormPassword(''); setShowPwModal(true); }}
                            disabled={isBusy}
                            className="px-2 py-1 text-[11px] font-medium border border-border hover:bg-surface rounded text-foreground flex items-center gap-0.5"
                          >
                            <Lock size={11} /> Pw
                          </button>
                          <button
                            onClick={() => handleToggleRole(u)}
                            disabled={isBusy}
                            className="px-2 py-1 text-[11px] font-medium border border-border hover:bg-surface rounded text-foreground"
                          >
                            {u.is_admin ? 'Make User' : 'Make Admin'}
                          </button>
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={isBusy}
                            className={`px-2 py-1 text-[11px] font-medium border rounded ${
                              u.status === 'suspended' 
                                ? 'border-primary/20 text-primary hover:bg-primary/5' 
                                : 'border-destructive/20 text-destructive hover:bg-destructive/5'
                            }`}
                          >
                            {u.status === 'suspended' ? 'Activate' : 'Suspend'}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={isBusy}
                            className="px-2 py-1 text-[11px] font-medium border border-destructive/20 text-destructive hover:bg-destructive/5 rounded ml-auto flex items-center gap-0.5"
                          >
                            <Trash2 size={11} /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. ACTIVITY AUDIT LOG TAB */}
          {adminTab === 'activity' && (
            <div className="space-y-4">
              <span className="mono-label">Audit Log & User Activity</span>

              {drilldownUser ? (
                /* Audit Log user activity drills */
                <div className="border border-border bg-card rounded-md p-4 space-y-3 animate-fade">
                  <div className="flex justify-between items-center pb-2 border-b border-border">
                    <div>
                      <h4 className="text-[13px] font-semibold text-foreground">{drilldownUser.full_name || drilldownUser.work_email}</h4>
                      <span className="text-[10px] text-muted-foreground block font-mono mt-0.5">{drilldownUser.work_email}</span>
                    </div>
                    <button 
                      onClick={() => setDrilldownUser(null)}
                      className="text-[11px] font-medium border border-border px-2.5 py-1 rounded bg-surface hover:bg-background"
                    >
                      Back to list
                    </button>
                  </div>

                  {loadingActivity ? (
                    <div className="p-6 text-center text-[12px] text-muted-foreground flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div> Fetching logs...
                    </div>
                  ) : userActivity.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground text-center py-6">No activity records logged for this user.</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {userActivity.map((log: any) => {
                        const date = new Date(log.created_at);
                        const meta = log.meta || {};
                        return (
                          <div key={log.id} className="border border-border bg-surface p-2.5 rounded text-[12.5px] space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-mono text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded uppercase">
                                {log.action || 'system'}
                              </span>
                              <span className="text-[9.5px] text-muted-foreground font-mono">
                                {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="text-[11.5px] text-muted-foreground">
                              {meta.device && `Device: ${meta.device} (${meta.platform || 'N/A'})`}
                              {meta.reason && ` · Reason: ${meta.reason}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Operators directory for activity log selection */
                <div className="space-y-3">
                  <p className="text-[12.5px] text-muted-foreground">Select an operator to audit their security activity logs:</p>
                  <div className="divide-y divide-border border border-border bg-card rounded-md overflow-hidden">
                    {usersList.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => selectDrilldownActivity(u)}
                        className="w-full text-left p-4 flex items-center justify-between hover:bg-surface transition-colors"
                      >
                        <div>
                          <div className="text-[13px] font-medium text-foreground">{u.full_name || u.work_email}</div>
                          <span className="text-[11px] text-muted-foreground font-mono block mt-0.5">{u.legal_name || 'Operator representative'}</span>
                        </div>
                        <ActivityIcon size={15} className="text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ==================== OPERATOR DASHBOARD LAYOUT ==================== */
        <div className="space-y-6">
          {/* Key KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => navigate('/suppliers')}
              className="border border-border bg-card p-4 rounded-md text-left flex flex-col justify-between hover:border-foreground transition-colors"
            >
              <div className="flex items-center justify-between text-muted-foreground w-full">
                <Users size={18} />
                <ArrowRight size={14} />
              </div>
              <div className="mt-4">
                <span className="text-[20px] font-display font-semibold block leading-none">{suppliersCount}</span>
                <span className="text-[10px] mono-label mt-1 block">Suppliers</span>
              </div>
            </button>

            <button 
              onClick={() => navigate('/alerts')}
              className={`border p-4 rounded-md text-left flex flex-col justify-between hover:opacity-90 transition-colors ${
                unreadAlerts > 0 
                  ? 'border-destructive/30 bg-destructive/5 text-destructive' 
                  : 'border-border bg-card text-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <AlertTriangle size={18} />
                <ArrowRight size={14} />
              </div>
              <div className="mt-4">
                <span className="text-[20px] font-display font-semibold block leading-none">{unreadAlerts}</span>
                <span className="text-[10px] mono-label mt-1 block">Active Alerts</span>
              </div>
            </button>

            <button 
              onClick={() => navigate('/inventory')}
              className="border border-border bg-card p-4 rounded-md text-left flex flex-col justify-between hover:border-foreground transition-colors"
            >
              <div className="flex items-center justify-between text-muted-foreground w-full">
                <Package size={18} />
                <ArrowRight size={14} />
              </div>
              <div className="mt-4">
                <span className="text-[20px] font-display font-semibold block leading-none">{lowStockCount}</span>
                <span className="text-[10px] mono-label mt-1 block">Low Stock SKUs</span>
              </div>
            </button>

            <button 
              onClick={() => navigate('/factories')}
              className="border border-border bg-card p-4 rounded-md text-left flex flex-col justify-between hover:border-foreground transition-colors"
            >
              <div className="flex items-center justify-between text-muted-foreground w-full">
                <Warehouse size={18} />
                <ArrowRight size={14} />
              </div>
              <div className="mt-4">
                <span className="text-[20px] font-display font-semibold block leading-none">{factoriesCount}</span>
                <span className="text-[10px] mono-label mt-1 block">Facilities</span>
              </div>
            </button>
          </div>

          {/* Quick Shortcuts */}
          <div className="border border-border bg-surface rounded-md p-3 grid grid-cols-2 gap-2 text-center text-[12.5px] font-medium">
            <button onClick={() => navigate('/warehouses')} className="bg-background py-2 px-3 rounded border border-border hover:bg-surface">
              Warehouses
            </button>
            <button onClick={() => navigate('/simulation')} className="bg-background py-2 px-3 rounded border border-border hover:bg-surface">
              Run Scenarios
            </button>
          </div>

          {/* Watched Suppliers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="mono-label">§ Pinned Suppliers Watchlist</h3>
              <button 
                onClick={() => navigate('/suppliers')}
                className="text-[11px] font-medium text-primary flex items-center gap-0.5"
              >
                Manage <Plus size={12} />
              </button>
            </div>

            {watchedSuppliers.length === 0 ? (
              <div className="border border-dashed border-border rounded-md p-6 text-center text-[12.5px] text-muted-foreground">
                No pinned suppliers. Add and watch critical suppliers to sync alerts here.
              </div>
            ) : (
              <div className="space-y-2">
                {watchedSuppliers.slice(0, 4).map((w) => (
                  <div key={w.id} className="border border-border bg-card rounded-md p-3 flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-medium">{w.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{w.country}</div>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase ${
                      w.criticality === 'critical' ? 'border-destructive/30 bg-destructive/5 text-destructive' :
                      w.criticality === 'high' ? 'border-warn/30 bg-warn/5 text-warn' :
                      'border-border text-muted-foreground'
                    }`}>
                      {w.criticality}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== CREATE USER MODAL ==================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">New User Account</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <div className="mono-label mb-1">Work Email</div>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="operator@company.com"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Temporary Password</div>
                <input
                  type="password"
                  required
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Min 8 chars"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Full Name</div>
                <input
                  type="text"
                  required
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Job Title</div>
                <input
                  type="text"
                  required
                  value={formJobTitle}
                  onChange={(e) => setFormJobTitle(e.target.value)}
                  placeholder="Supply Chain Analyst"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Company (Legal Name)</div>
                <input
                  type="text"
                  required
                  value={formLegalName}
                  onChange={(e) => setFormLegalName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">HQ Country</div>
                  <input
                    type="text"
                    required
                    value={formHqCountry}
                    onChange={(e) => setFormHqCountry(e.target.value)}
                    placeholder="Germany"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Industry</div>
                  <input
                    type="text"
                    required
                    value={formIndustry}
                    onChange={(e) => setFormIndustry(e.target.value)}
                    placeholder="Aerospace"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              <div>
                <div className="mono-label mb-1">Tier / Supply Role</div>
                <input
                  type="text"
                  value={formTierRole}
                  onChange={(e) => setFormTierRole(e.target.value)}
                  placeholder="e.g. buyer, supplier"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">Admin Privilege</div>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full border border-border bg-background rounded px-2 py-1.5 text-[13px]"
                  >
                    <option value="operator">Operator (User)</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <label className="flex items-center gap-1.5 text-[12px] pt-4 select-none">
                  <input
                    type="checkbox"
                    checked={formApprove}
                    onChange={(e) => setFormApprove(e.target.checked)}
                  />
                  Auto-Approve
                </label>
              </div>

              {formErr && <div className="text-[12px] text-destructive">{formErr}</div>}

              <button
                type="submit"
                disabled={formBusy}
                className="w-full bg-foreground text-background py-2.5 rounded text-[13px] font-medium hover:opacity-90 disabled:opacity-60"
              >
                {formBusy ? 'Creating account...' : 'Create Account Node'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== EDIT USER MODAL ==================== */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">Edit Account: {selectedUser?.work_email}</h3>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5">
              <div>
                <div className="mono-label mb-1">Full Name</div>
                <input
                  type="text"
                  required
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Job Title</div>
                <input
                  type="text"
                  required
                  value={formJobTitle}
                  onChange={(e) => setFormJobTitle(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Company (Legal Name)</div>
                <input
                  type="text"
                  required
                  value={formLegalName}
                  onChange={(e) => setFormLegalName(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">HQ Country</div>
                  <input
                    type="text"
                    required
                    value={formHqCountry}
                    onChange={(e) => setFormHqCountry(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Industry</div>
                  <input
                    type="text"
                    required
                    value={formIndustry}
                    onChange={(e) => setFormIndustry(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              <div>
                <div className="mono-label mb-1">Tier / Supply Role</div>
                <input
                  type="text"
                  value={formTierRole}
                  onChange={(e) => setFormTierRole(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Admin Privilege</div>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full border border-border bg-background rounded px-2 py-1.5 text-[13px]"
                >
                  <option value="operator">Operator (User)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {formErr && <div className="text-[12px] text-destructive">{formErr}</div>}

              <button
                type="submit"
                disabled={formBusy}
                className="w-full bg-foreground text-background py-2.5 rounded text-[13px] font-medium hover:opacity-90 disabled:opacity-60"
              >
                {formBusy ? 'Saving...' : 'Save Account Settings'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== RESET PASSWORD MODAL ==================== */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">Reset User Password</h3>
              <button onClick={() => setShowPwModal(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePwSubmit} className="space-y-3.5">
              <div>
                <div className="mono-label mb-1">Operator: {selectedUser?.work_email}</div>
                <input
                  type="password"
                  required
                  placeholder="Enter new password (min 8 characters)"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                />
              </div>

              {formErr && <div className="text-[12px] text-destructive">{formErr}</div>}

              <button
                type="submit"
                disabled={formBusy || formPassword.length < 8}
                className="w-full bg-foreground text-background py-2.5 rounded text-[13px] font-medium hover:opacity-90 disabled:opacity-60"
              >
                {formBusy ? 'Updating password...' : 'Set Password Key'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
