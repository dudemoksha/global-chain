import React, { useEffect, useState } from 'react';
import { getLiveEvents } from '../lib/server-fns';
import { ShieldAlert, RefreshCw, Search, ExternalLink, Globe } from 'lucide-react';

export const Signals: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchSignals = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);

    try {
      const data = await getLiveEvents();
      setEvents(data || []);
    } catch (e) {
      console.error('Error fetching live signals:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSignals();
    // Poll signals every 30 seconds
    const interval = setInterval(() => {
      fetchSignals(false);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredEvents = events.filter((e) => {
    const q = search.toLowerCase();
    return (e.headline || '').toLowerCase().includes(q) ||
           (e.country || '').toLowerCase().includes(q) ||
           (e.kind || '').toLowerCase().includes(q);
  });

  return (
    <div className="px-4 py-5 animate-rise space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="mono-label">§ Live Feed</span>
          <h2 className="text-xl font-display font-semibold">Global Risk Signals</h2>
        </div>
        <button
          onClick={() => fetchSignals(false)}
          disabled={refreshing || loading}
          className="bg-foreground text-background p-1.5 rounded-md text-[12px] font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
        <input
          type="text"
          placeholder="Filter GDELT/USGS by country, severity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-card text-[13.5px] outline-none focus:border-foreground"
        />
      </div>

      {/* Signals Cards List */}
      {loading ? (
        <div className="p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-10 text-center text-[13px] text-muted-foreground">
          No live signals found. Try adjusting filters or refresh.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((e) => (
            <div key={e.id} className="border border-border bg-card rounded-md p-4 space-y-3">
              {/* Kind & Country */}
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-1.5">
                  <Globe size={14} className="text-muted-foreground" />
                  <span className="mono-label text-[10px]">
                    {e.source?.toUpperCase()} · {e.country} · {e.region || 'Unknown Region'}
                  </span>
                </div>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
                  e.severity === 'critical' ? 'border-destructive/20 bg-destructive/10 text-destructive' :
                  e.severity === 'high' ? 'border-warn/20 bg-warn/10 text-warn' :
                  'border-border text-muted-foreground'
                }`}>
                  {e.severity}
                </span>
              </div>

              {/* Headline */}
              <h4 className="text-[13.5px] font-medium text-foreground leading-snug">{e.headline}</h4>

              {/* Detail */}
              {e.detail && (
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {e.detail}
                </p>
              )}

              {/* Source Link & Hours Ago */}
              <div className="flex items-center justify-between border-t border-border mt-3 pt-3">
                <span className="text-[10px] text-muted-foreground">
                  {e.hoursAgo === 0 ? 'Just now' : `${e.hoursAgo}h ago`}
                </span>
                
                {e.sourceUrl && (
                  <a
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-primary flex items-center gap-0.5"
                  >
                    Open Source <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
