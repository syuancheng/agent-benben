import { NextResponse } from "next/server";
import { runChatOrchestrator } from "@/lib/chat-orchestrator";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    const messages = validateMessages(body.messages);
    const result = await runChatOrchestrator(messages);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat error.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function validateMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) {
    throw new Error("messages must be an array.");
  }

  const validated = messages.map((message) => {
    if (!message || typeof message !== "object") {
      throw new Error("Invalid message.");
    }

    const candidate = message as Partial<ChatMessage>;
    if ((candidate.role !== "user" && candidate.role !== "assistant") || typeof candidate.content !== "string") {
      throw new Error("Each message must have role user|assistant and string content.");
    }

    return {
      role: candidate.role,
      content: candidate.content,
    };
  });

  if (!validated.some((message) => message.role === "user")) {
    throw new Error("At least one user message is required.");
  }

  return validated;
}
