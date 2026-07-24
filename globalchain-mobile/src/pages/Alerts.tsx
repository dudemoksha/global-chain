import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { syncAlerts } from '../lib/server-fns'; // uses our REST server function
import { AlertTriangle, Check, RefreshCw, Trash2, Eye } from 'lucide-react';

export const Alerts: React.FC = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchAlerts = async () => {
    if (!user) return;
    if (alerts.length === 0) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setAlerts(data || []);
      setUnread((data || []).filter((r) => !r.read_at).length);
    } catch (e) {
      console.error('Error fetching alerts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchAlerts();

    const channel = supabase
      .channel(`alerts:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: `user_id=eq.${user.id}` }, fetchAlerts)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Sync / Ingest Alerts via Vercel REST endpoint
  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAlerts();
      await fetchAlerts();
    } catch (e: any) {
      alert(e.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkRead = async (alertId: string) => {
    setBusyId(alertId);
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ read_at: new Date().toISOString() })
        .eq('id', alertId)
        .eq('user_id', user!.id);

      if (error) throw error;
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, read_at: new Date().toISOString() } : a))
      );
      setUnread((prev) => Math.max(0, prev - 1));
    } catch (e: any) {
      alert(e.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user!.id)
        .is('read_at', null);

      if (error) throw error;
      setAlerts((prev) => prev.map((a) => ({ ...a, read_at: a.read_at || new Date().toISOString() })));
      setUnread(0);
    } catch (e: any) {
      alert(e.message || 'Action failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDismiss = async (alertId: string) => {
    setBusyId(alertId);
    try {
      const { error } = await supabase
        .from('alerts')
        .delete()
        .eq('id', alertId)
        .eq('user_id', user!.id);

      if (error) throw error;
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      setUnread((prev) => Math.max(0, prev - 1));
    } catch (e: any) {
      alert(e.message || 'Dismiss failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-4 py-5 animate-rise space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="mono-label">§ Threat intelligence</span>
          <h2 className="text-xl font-display font-semibold">Risk Alerts ({unread})</h2>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={syncing}
              className="border border-border text-foreground px-2.5 py-1.5 rounded-md text-[11px] font-medium hover:bg-surface disabled:opacity-40"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-foreground text-background p-1.5 rounded-md text-[12px] font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center"
            title="Ingest live threat signals"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Alerts Cards List */}
      {loading && !syncing ? (
        <div className="p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-10 text-center text-[13px] text-muted-foreground">
          No risk alerts generated. Click refresh to scan your supply chain.
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => {
            const isBusy = busyId === a.id;
            const isUnread = !a.read_at;

            return (
              <div 
                key={a.id} 
                className={`border rounded-md bg-card p-4 transition-all duration-200 ${
                  isUnread ? 'border-primary/40 bg-accent/20' : 'border-border'
                }`}
              >
                {/* Title */}
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle 
                      size={18} 
                      className={`shrink-0 mt-0.5 ${
                        a.severity === 'critical' ? 'text-destructive' :
                        a.severity === 'high' ? 'text-warn' : 'text-muted-foreground'
                      }`} 
                    />
                    <div>
                      <h4 className="text-[13.5px] font-medium text-foreground leading-snug">{a.headline}</h4>
                      <span className="mono-label text-[9px] mt-1 block">
                        {a.kind} · {a.country} · {a.supplier_name || 'Generic Event'}
                      </span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase border shrink-0 ${
                    a.severity === 'critical' ? 'border-destructive/20 bg-destructive/10 text-destructive' :
                    a.severity === 'high' ? 'border-warn/20 bg-warn/10 text-warn' :
                    'border-border text-muted-foreground'
                  }`}>
                    {a.severity}
                  </span>
                </div>

                {/* Details */}
                <p className="text-[12px] text-muted-foreground leading-relaxed mt-2 bg-surface p-2.5 rounded border border-border">
                  {a.detail}
                </p>

                {/* Actions row */}
                <div className="flex items-center justify-between border-t border-border mt-3 pt-3">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()} at {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {isUnread && (
                      <button
                        onClick={() => handleMarkRead(a.id)}
                        disabled={isBusy}
                        className="p-1 border border-border text-muted-foreground hover:text-primary rounded"
                        title="Mark as Read"
                      >
                        <Check size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDismiss(a.id)}
                      disabled={isBusy}
                      className="p-1 border border-border text-muted-foreground hover:text-destructive rounded"
                      title="Dismiss Alert"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
