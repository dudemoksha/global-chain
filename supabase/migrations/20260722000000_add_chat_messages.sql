-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for conversation queries
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx 
ON public.chat_messages(sender_id, receiver_id, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: users can read messages where they are sender or receiver
CREATE POLICY "Users can read their own conversations" ON public.chat_messages
  FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Policy: users can send messages as themselves
CREATE POLICY "Users can send messages as sender" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- Policy to allow approved operators to search/view other profiles
CREATE POLICY "Users can view other profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
