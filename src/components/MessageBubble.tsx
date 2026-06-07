export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type MessageBubbleProps = {
  message: ChatMessage;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <article className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? <Avatar label="T" tone="assistant" /> : null}

      <div
        className={`max-w-[82%] rounded-lg px-4 py-3 shadow-sm ${
          isUser
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-900"
        }`}
      >
        <div className="whitespace-pre-wrap break-words text-sm leading-6">
          {message.content}
        </div>
      </div>

      {isUser ? <Avatar label="You" tone="user" /> : null}
    </article>
  );
}

function Avatar({ label, tone }: { label: string; tone: "assistant" | "user" }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm ${
        tone === "assistant"
          ? "bg-emerald-600 text-white"
          : "border border-slate-200 bg-white text-slate-700"
      }`}
      aria-hidden="true"
    >
      {label}
    </div>
  );
}
