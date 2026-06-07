"use client";

import { useState } from "react";
import { ChatInput } from "./ChatInput";
import { ChatMessage, MessageBubble } from "./MessageBubble";

type StreamEvent = {
  event: string;
  data: unknown;
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: "assistant",
      content: "Hi. Ask me a question and I will answer here.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(content: string) {
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content,
    };
    const assistantId = createId();
    const nextMessages = [...messages, userMessage];

    setMessages([
      ...nextMessages,
      {
        id: assistantId,
        role: "assistant",
        content: "",
      },
    ]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : `Request failed with status ${response.status}.`;
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("Response stream is not available.");
      }

      await readAssistantStream(response.body, {
        onDelta: (delta) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + delta } : message,
            ),
          );
        },
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to send message.";
      setError(message);
      setMessages((current) =>
        current.map((chatMessage) =>
          chatMessage.id === assistantId && !chatMessage.content
            ? {
                ...chatMessage,
                content: "I could not generate an answer. Please try again.",
              }
            : chatMessage,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <h1 className="text-lg font-semibold text-slate-950">
          Tempo Fitness Chat
        </h1>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading ? (
          <div className="text-sm text-slate-500">Assistant is responding...</div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}
      </div>

      <ChatInput disabled={isLoading} onSend={handleSend} />
    </section>
  );
}

async function readAssistantStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onDelta: (delta: string) => void;
  },
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      const parsed = parseSseEvent(rawEvent);

      if (!parsed) {
        continue;
      }

      if (parsed.event === "delta" && isRecord(parsed.data) && typeof parsed.data.delta === "string") {
        handlers.onDelta(parsed.data.delta);
      }

      if (parsed.event === "error") {
        const message =
          isRecord(parsed.data) && typeof parsed.data.error === "string"
            ? parsed.data.error
            : "Streaming request failed.";
        throw new Error(message);
      }
    }
  }
}

function parseSseEvent(rawEvent: string): StreamEvent | null {
  const lines = rawEvent.split("\n");
  const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
  const dataLine = lines.find((line) => line.startsWith("data: "))?.slice(6);

  if (!event || !dataLine) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataLine),
    };
  } catch {
    return null;
  }
}
