import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { askAssistant } from "@/lib/assistant.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What is my highest-risk supplier?",
  "Which inventory needs replenishment?",
  "Suggest safer suppliers for my critical categories.",
  "What if Japan has an earthquake tomorrow?",
];

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "Assistant · Global-Chain" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    return null;
  },
  component: AssistantPage,
});

function AssistantPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (question: string) =>
      askAssistant({ data: { question, history: messages.slice(-10) } }),
    onSuccess: (r) => setMessages((m) => [...m, { role: "assistant", content: r.answer }]),
    onError: (e) =>
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${(e as Error).message}` }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ask.isPending]);

  function send(text: string) {
    const q = text.trim();
    if (!q || ask.isPending) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    ask.mutate(q);
  }

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto flex h-[calc(100vh-56px)] max-w-[900px] flex-col px-6 pb-4 pt-8">
        <div>
          <div className="mono-label">§ AI copilot</div>
          <h1 className="mt-2 font-display text-[28px] font-medium tracking-tight">Assistant</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Reasons over your suppliers, inventory and current risk signals. Only your data.
          </p>
        </div>

        <div ref={scrollRef} className="mt-6 flex-1 overflow-auto rounded-md border border-border bg-card p-5">
          {messages.length === 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-md border border-border p-3 text-left text-[13px] hover:border-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <ul className="space-y-4">
              {messages.map((m, i) => (
                <li key={i} className={m.role === "user" ? "text-right" : ""}>
                  <div
                    className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-md px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                      m.role === "user"
                        ? "bg-foreground text-background"
                        : "border border-border bg-background"
                    }`}
                  >
                    {m.content}
                  </div>
                </li>
              ))}
              {ask.isPending && (
                <li>
                  <div className="inline-block rounded-md border border-border px-3.5 py-2.5 text-[13px] text-muted-foreground">
                    Thinking…
                  </div>
                </li>
              )}
            </ul>
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="mt-4 flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your supply chain…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-[13.5px]"
          />
          <button
            disabled={ask.isPending || !input.trim()}
            className="rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </AppShell>
  );
}
