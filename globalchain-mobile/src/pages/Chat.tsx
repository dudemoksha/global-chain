import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Search, MessageSquare, UserPlus, Shield, ChevronRight } from 'lucide-react';

export const Chat: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'chats' | 'directory'>('chats');

  const fetchChatData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Fetch all approved profiles (Directory)
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, job_title, legal_name, hq_country')
        .eq('is_approved', true)
        .neq('id', user.id)
        .order('full_name', { ascending: true });

      if (pErr) throw pErr;
      setContacts(profiles || []);

      // 2. Fetch recent messages to build active conversations
      const { data: messages, error: mErr } = await supabase
        .from('chat_messages')
        .select('id, sender_id, receiver_id, message, created_at')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (mErr) throw mErr;

      // Group messages by conversation partner
      const conversationsMap = new Map<string, any>();
      const partnerIds = new Set<string>();

      (messages || []).forEach((msg) => {
        const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        if (!conversationsMap.has(partnerId)) {
          partnerIds.add(partnerId);
          conversationsMap.set(partnerId, {
            partnerId,
            lastMessage: msg.message,
            timestamp: msg.created_at,
          });
        }
      });

      // Fetch profile details for all conversation partners
      if (partnerIds.size > 0) {
        const { data: partnerProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, job_title, legal_name')
          .in('id', Array.from(partnerIds));

        const partnerProfilesMap = new Map(partnerProfiles?.map((p) => [p.id, p]));

        const formattedConversations = Array.from(conversationsMap.values())
          .map((c) => {
            const p = partnerProfilesMap.get(c.partnerId);
            return {
              ...c,
              name: p?.full_name || 'Operator Representative',
              orgName: p?.legal_name || 'Supply Chain Partner',
              jobTitle: p?.job_title || 'Operator',
            };
          })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setConversations(formattedConversations);
      } else {
        setConversations([]);
      }
    } catch (e) {
      console.error('Error loading chat list:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChatData();
    // Poll active conversations list every 15 seconds to keep unread badges or messages list fresh
    const interval = setInterval(() => {
      fetchChatData();
    }, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const filteredDirectory = contacts.filter((c) => {
    const q = search.toLowerCase();
    return c.full_name.toLowerCase().includes(q) || 
           c.legal_name.toLowerCase().includes(q) || 
           c.job_title.toLowerCase().includes(q);
  });

  const filteredChats = conversations.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || 
           c.orgName.toLowerCase().includes(q) || 
           c.lastMessage.toLowerCase().includes(q);
  });

  return (
    <div className="px-4 py-5 animate-rise space-y-4">
      {/* Header */}
      <div>
        <span className="mono-label">§ Collaboration Channels</span>
        <h2 className="text-xl font-display font-semibold">Operator Messaging</h2>
      </div>

      {/* Tab select */}
      <div className="flex border border-border rounded-md p-1 bg-surface">
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex-1 text-center py-2 rounded text-[12.5px] font-medium transition-colors ${
            activeTab === 'chats' 
              ? 'bg-background text-foreground border border-border shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Conversations ({conversations.length})
        </button>
        <button
          onClick={() => setActiveTab('directory')}
          className={`flex-1 text-center py-2 rounded text-[12.5px] font-medium transition-colors ${
            activeTab === 'directory' 
              ? 'bg-background text-foreground border border-border shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Directory
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
        <input
          type="text"
          placeholder={activeTab === 'chats' ? "Search conversations..." : "Search directories by name, company..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-card text-[13.5px] outline-none focus:border-foreground"
        />
      </div>

      {/* Lists */}
      {loading && activeTab === 'chats' && conversations.length === 0 ? (
        <div className="p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : activeTab === 'chats' ? (
        /* CONVERSATIONS LIST */
        filteredChats.length === 0 ? (
          <div className="border border-dashed border-border rounded-md p-10 text-center text-[12.5px] text-muted-foreground">
            No active conversations. Toggle to "Directory" to start a chat.
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-md bg-card overflow-hidden">
            {filteredChats.map((c) => (
              <button
                key={c.partnerId}
                onClick={() => navigate(`/chat/${c.partnerId}`)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-surface transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {c.name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13.5px] font-medium text-foreground truncate">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate font-mono">{c.orgName}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5 truncate pr-4">
                      {c.lastMessage}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 gap-1.5">
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        /* DIRECTORY LIST */
        filteredDirectory.length === 0 ? (
          <div className="border border-dashed border-border rounded-md p-10 text-center text-[12.5px] text-muted-foreground">
            No operators found.
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-md bg-card overflow-hidden">
            {filteredDirectory.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/chat/${c.id}`)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-surface transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 bg-surface border border-border rounded-full flex items-center justify-center text-foreground font-semibold text-xs shrink-0">
                    {c.full_name[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[13.5px] font-medium text-foreground">{c.full_name}</div>
                    <span className="mono-label text-[9px] mt-0.5 block">
                      {c.job_title} · {c.legal_name}
                    </span>
                  </div>
                </div>
                <MessageSquare size={15} className="text-muted-foreground hover:text-primary transition-colors" />
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
};
