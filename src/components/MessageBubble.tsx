export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  sources?: unknown;
  debug?: unknown;
};

type MessageBubbleProps = {
  message: ChatMessage;
};

function renderMeta(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const sources = renderMeta(message.sources);
  const debug = renderMeta(message.debug);

  return (
    <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
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

        {!isUser && (sources || debug) ? (
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
            {sources ? (
              <details>
                <summary className="cursor-pointer select-none font-medium">
                  Sources
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2">
                  {sources}
                </pre>
              </details>
            ) : null}

            {debug ? (
              <details>
                <summary className="cursor-pointer select-none font-medium">
                  Debug
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2">
                  {debug}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
