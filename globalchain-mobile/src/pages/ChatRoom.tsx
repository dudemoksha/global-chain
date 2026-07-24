import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Send, User, ChevronLeft } from 'lucide-react';

export const ChatRoom: React.FC = () => {
  const { userId: recipientId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [partner, setPartner] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchPartnerProfile = async () => {
    if (!recipientId) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, legal_name, job_title')
        .eq('id', recipientId)
        .maybeSingle();

      if (error) throw error;
      setPartner(data || { full_name: 'Operator Representative', legal_name: 'Partner entity' });
    } catch (e) {
      console.error('Error fetching partner profile:', e);
    }
  };

  const fetchMessages = async (showLoading = false) => {
    if (!user || !recipientId) return;
    if (showLoading) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (e) {
      console.error('Error fetching messages:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartnerProfile();
    fetchMessages(true);

    // Poll for new messages every 3 seconds (HTTP polling fallback for WebSockets)
    const interval = setInterval(() => {
      fetchMessages(false);
    }, 3000);

    return () => clearInterval(interval);
  }, [recipientId, user]);

  useEffect(() => {
    // Auto-scroll to bottom of conversation
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = input.trim();
    if (!txt || !user || !recipientId || sending) return;

    setInput('');
    setSending(true);

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          sender_id: user.id,
          receiver_id: recipientId,
          message: txt,
        });

      if (error) throw error;
      
      // Instantly add message to local view to keep UI snappy
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36),
          sender_id: user.id,
          receiver_id: recipientId,
          message: txt,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e: any) {
      alert(e.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px-64px)] bg-background">
      {/* Top Header Partner Card */}
      <div className="border-b border-border bg-surface px-4 py-3 shrink-0 flex items-center gap-3">
        <div className="h-9 w-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm shrink-0">
          {partner?.full_name ? partner.full_name[0].toUpperCase() : 'O'}
        </div>
        <div>
          <h3 className="text-[13.5px] font-medium text-foreground">{partner?.full_name || 'Operator'}</h3>
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{partner?.job_title} · {partner?.legal_name}</p>
        </div>
      </div>

      {/* Messages Scroll Box */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {loading ? (
          <div className="p-6 flex flex-col items-center justify-center min-h-[150px]">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center pt-10 text-[12.5px] text-muted-foreground max-w-[240px] mx-auto leading-relaxed">
            Beginning of secure channel. Send a message to start collaboration.
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-md px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                    isMe
                      ? 'bg-foreground text-background font-medium'
                      : 'border border-border bg-card text-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.message}</p>
                  <span className={`text-[8.5px] font-mono mt-1 block text-right ${
                    isMe ? 'text-background/70' : 'text-muted-foreground'
                  }`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Message Input Bottom Panel */}
      <form
        onSubmit={handleSend}
        className="border-t border-border p-3 bg-background flex items-center gap-2 shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Secure message..."
          disabled={sending}
          className="flex-1 rounded-md border border-border bg-card px-3 py-2.5 text-[13.5px] outline-none focus:border-foreground"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="h-10 w-10 rounded-md bg-foreground text-background flex items-center justify-center disabled:opacity-40"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};
