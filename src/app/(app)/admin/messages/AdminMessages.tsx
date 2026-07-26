"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  Button,
  Textarea,
  Spinner,
  Badge,
} from "@/components/ui";
import { IconAlert, IconChevronRight } from "@/components/icons";
import { useToast } from "@/components/Toast";

interface Thread {
  flat: string;
  ownerName: string;
  lastBody: string;
  lastSender: "resident" | "admin";
  lastAt: string;
  unread: number;
}

interface ChatMessage {
  id: string;
  sender: "resident" | "admin";
  senderName: string;
  body: string;
  category: string | null;
  createdAt: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AdminMessages() {
  const { toast } = useToast();
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [active, setActive] = React.useState<string | null>(null);

  const loadThreads = React.useCallback(async () => {
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setThreads(data.threads || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadThreads();
    const id = setInterval(loadThreads, 15_000);
    return () => clearInterval(id);
  }, [loadThreads]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading conversations…
        </CardContent>
      </Card>
    );
  }

  if (threads.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No conversations yet. Residents can start one from their dashboard.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Thread list */}
      <Card className={`overflow-hidden ${active ? "hidden lg:block" : ""}`}>
        <ul className="divide-y divide-border">
          {threads.map((t) => (
            <li key={t.flat}>
              <button
                onClick={() => setActive(t.flat)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 ${
                  active === t.flat ? "bg-muted/50" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="tabular font-semibold text-foreground">
                      Flat {t.flat}
                    </p>
                    {t.unread > 0 && (
                      <Badge tone="destructive">{t.unread}</Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.ownerName || "—"}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {t.lastSender === "admin" ? "You: " : ""}
                    {t.lastBody}
                  </p>
                </div>
                <IconChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {/* Conversation */}
      <div className={active ? "" : "hidden lg:block"}>
        {active ? (
          <Conversation
            flat={active}
            onBack={() => setActive(null)}
            onChanged={loadThreads}
          />
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Select a conversation to read and reply.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Conversation({
  flat,
  onBack,
  onChanged,
}: {
  flat: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [owner, setOwner] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/${flat}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages || []);
        setOwner(data.ownerName || "");
        setPhone(data.ownerPhone || "");
      }
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, [flat]);

  React.useEffect(() => {
    setLoaded(false);
    load();
    // Marking read on load changes unread counts — refresh the list.
    onChanged();
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/${flat}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not send.", "error");
        return;
      }
      setMessages((m) => [...m, data.message]);
      setBody("");
      onChanged();
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          onClick={onBack}
          className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="Back"
        >
          <IconChevronRight className="h-5 w-5 rotate-180" />
        </button>
        <div className="min-w-0">
          <p className="tabular font-semibold text-foreground">Flat {flat}</p>
          <p className="truncate text-xs text-muted-foreground">
            {owner || "—"}
            {phone ? ` · ${phone}` : ""}
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[52vh] min-h-[220px] flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4"
      >
        {!loaded ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Loading…
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages in this conversation.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.sender === "admin"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-card text-foreground shadow-sm"
                }`}
              >
                {m.category && (
                  <p
                    className={`mb-0.5 flex items-center gap-1 text-[11px] font-semibold ${
                      m.sender === "admin" ? "text-primary-foreground/80" : "text-destructive"
                    }`}
                  >
                    {m.sender === "resident" && <IconAlert className="h-3 w-3" />}
                    {m.category}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p
                  className={`mt-0.5 text-[10px] ${
                    m.sender === "admin"
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {fmt(m.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={send} className="space-y-2 border-t border-border p-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Reply to Flat ${flat}…`}
          rows={2}
          maxLength={2000}
        />
        <div className="flex justify-end">
          <Button type="submit" size="md" loading={sending} disabled={!body.trim()}>
            Send reply
          </Button>
        </div>
      </form>
    </Card>
  );
}
