"use client";

import { useState } from "react";
import { ChatInput } from "./ChatInput";
import { ChatMessage, MessageBubble } from "./MessageBubble";

type ParsedAssistantResponse = {
  content: string;
  sources?: unknown;
  debug?: unknown;
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function parseAssistantResponse(data: unknown): ParsedAssistantResponse {
  if (typeof data === "string") {
    return { content: data };
  }

  if (!isRecord(data)) {
    return { content: "Received an empty response." };
  }

  const message = isRecord(data.message) ? data.message : undefined;
  const choices = Array.isArray(data.choices) ? data.choices : undefined;
  const firstChoice = choices?.find(isRecord);
  const choiceMessage = isRecord(firstChoice?.message)
    ? firstChoice.message
    : undefined;
  const messages = Array.isArray(data.messages) ? data.messages : undefined;
  const lastAssistantMessage = messages
    ?.filter(isRecord)
    .reverse()
    .find((item) => item.role === "assistant");

  const content =
    getString(data.content) ??
    getString(data.answer) ??
    getString(data.response) ??
    getString(message?.content) ??
    getString(choiceMessage?.content) ??
    getString(lastAssistantMessage?.content) ??
    "Received an empty response.";

  return {
    content,
    sources: data.sources ?? message?.sources ?? lastAssistantMessage?.sources,
    debug:
      data.debug ??
      message?.debug ??
      lastAssistantMessage?.debug ??
      {
        selectedSkill: data.selectedSkill,
        handoffRecommended: data.handoffRecommended,
      },
  };
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
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
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

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : `Request failed with status ${response.status}.`;
        throw new Error(message);
      }

      const assistant = parseAssistantResponse(data);

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: assistant.content,
          sources: assistant.sources,
          debug: assistant.debug,
        },
      ]);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to send message.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <h1 className="text-lg font-semibold text-slate-950">
          Agent Benben Chat
        </h1>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading ? (
          <div className="text-sm text-slate-500">Assistant is thinking...</div>
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
