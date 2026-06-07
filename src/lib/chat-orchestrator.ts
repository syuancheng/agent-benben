import { readKnowledgeFile } from "./knowledge";
import { getOpenAIClient, getOpenAIModel } from "./openai";
import {
  buildFinalAnswerInstructions,
  buildSkillSelectionInstructions,
  formatMessagesForModel,
  getLatestUserMessage,
} from "./prompt";
import { loadSkillContext } from "./skill-loader";
import { listRuntimeSkills } from "./skill-registry";
import type { ChatMessage, ChatResult, LoadedSkill } from "./types";
import { handleBookingShortcut } from "./booking";
import type { OpenAI } from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

type ResponseItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  text?: string;
};

const READ_KNOWLEDGE_TOOL = {
  type: "function",
  name: "read_knowledge_file",
  description:
    "Read a Tempo Fitness knowledge file to get the information needed to answer the user's question. Check the knowledge index first to choose the right file.",
  parameters: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "The knowledge file to read, e.g. 'beginner-guide.md' or 'classes.md'.",
      },
    },
    required: ["filename"],
    additionalProperties: false,
  },
} as never;

export async function runChatOrchestrator(messages: ChatMessage[]): Promise<ChatResult> {
  const bookingResult = await handleBookingShortcut(messages);
  if (bookingResult) {
    return bookingResult;
  }

  const ctx = await prepareSkillContext(messages);
  const instructions = buildFinalAnswerInstructions({
    skillName: ctx.skill.name,
    skillInstructions: ctx.skill.instructions,
    knowledgeIndex: ctx.indexContent,
  });

  const { text, sources } = await runAgenticPhase2(ctx.openai, ctx.model, instructions, ctx);

  return {
    message: {
      role: "assistant",
      content: text || "I could not generate an answer. Please contact Tempo Fitness staff.",
    },
    sources,
    selectedSkill: ctx.selectedSkill,
    handoffRecommended: ctx.handoffRecommended,
  };
}

export async function streamChatOrchestrator(
  messages: ChatMessage[],
  handlers: {
    onMeta: (meta: Omit<ChatResult, "message">) => void | Promise<void>;
    onDelta: (delta: string) => void | Promise<void>;
  },
): Promise<void> {
  const bookingResult = await handleBookingShortcut(messages);
  if (bookingResult) {
    await handlers.onMeta({
      sources: bookingResult.sources,
      selectedSkill: bookingResult.selectedSkill,
      handoffRecommended: bookingResult.handoffRecommended,
    });
    await streamText(bookingResult.message.content, handlers.onDelta);
    return;
  }

  const ctx = await prepareSkillContext(messages);
  const instructions = buildFinalAnswerInstructions({
    skillName: ctx.skill.name,
    skillInstructions: ctx.skill.instructions,
    knowledgeIndex: ctx.indexContent,
  });

  // Phase 2: resolve all read_knowledge_file tool calls non-streaming,
  // then stream the final answer.
  const { text, sources, finalResponseId } = await runAgenticPhase2(ctx.openai, ctx.model, instructions, ctx);

  await handlers.onMeta({
    sources,
    selectedSkill: ctx.selectedSkill,
    handoffRecommended: ctx.handoffRecommended,
  });

  if (finalResponseId && !text) {
    // LLM hit max rounds — stream a fresh completion from the accumulated context
    await streamFromResponseId(ctx.openai, ctx.model, instructions, finalResponseId, handlers.onDelta);
  } else {
    // Simulate streaming for the pre-fetched answer
    await streamText(text, handlers.onDelta);
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — skill selection
// ---------------------------------------------------------------------------

type SkillContext = {
  openai: OpenAI;
  model: string;
  skill: LoadedSkill;
  indexContent: string;
  selectionResponseId: string;
  toolCallId: string | undefined;
  selectedSkill: string;
  handoffRecommended: boolean;
  messages: ChatMessage[];
};

async function prepareSkillContext(messages: ChatMessage[]): Promise<SkillContext> {
  const latestUserMessage = getLatestUserMessage(messages);
  if (!latestUserMessage?.content.trim()) {
    throw new Error("At least one user message is required.");
  }

  const openai = getOpenAIClient();
  const model = getOpenAIModel();
  const skills = await listRuntimeSkills();

  const selectionResponse = await openai.responses.create({
    model,
    instructions: buildSkillSelectionInstructions(skills),
    input: formatMessagesForModel(messages),
    tools: [
      {
        type: "function",
        name: "load_skill",
        description: "Load the selected Tempo Fitness runtime skill.",
        parameters: {
          type: "object",
          properties: {
            skill: {
              type: "string",
              enum: skills.map((s) => s.name),
              description: "The runtime skill name to load.",
            },
            userIntent: {
              type: "string",
              description: "A short summary of what the user is asking for.",
            },
          },
          required: ["skill"],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: "required",
  } as never);

  const toolCall = (selectionResponse.output as ResponseItem[])?.find(
    (item) => item.type === "function_call" && item.name === "load_skill",
  );

  const skillName =
    (JSON.parse(toolCall?.arguments || "{}") as { skill?: string }).skill ||
    skills.find((s) => s.name === "tempo_customer_service")?.name ||
    skills[0]?.name;

  const loaded = await loadSkillContext(skillName);

  return {
    openai,
    model,
    skill: loaded.skill,
    indexContent: loaded.indexContent,
    selectionResponseId: selectionResponse.id,
    toolCallId: toolCall?.call_id,
    selectedSkill: loaded.skill.name,
    handoffRecommended:
      loaded.skill.name.includes("handoff") ||
      loaded.skill.name.includes("safety") ||
      shouldRecommendHandoff(latestUserMessage.content),
    messages,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — agentic retrieval loop
// ---------------------------------------------------------------------------

async function runAgenticPhase2(
  openai: OpenAI,
  model: string,
  instructions: string,
  ctx: SkillContext,
): Promise<{ text: string; sources: string[]; finalResponseId?: string }> {
  const sources: string[] = [];

  // Inject Phase 1 result: skill context + knowledge index
  const phase1Result = JSON.stringify({
    skillInstructions: ctx.skill.instructions,
    knowledgeIndex: ctx.indexContent,
  });

  let previousResponseId = ctx.selectionResponseId;
  let currentInput: unknown[];

  if (ctx.toolCallId) {
    currentInput = [{ type: "function_call_output", call_id: ctx.toolCallId, output: phase1Result }];
  } else {
    // Fallback: no chaining, inject full conversation
    currentInput = formatMessagesForModel(ctx.messages);
  }

  for (let round = 0; round < 5; round++) {
    const response = await openai.responses.create({
      model,
      instructions,
      ...(ctx.toolCallId || round > 0
        ? { previous_response_id: previousResponseId, input: currentInput }
        : { input: currentInput }),
      tools: [READ_KNOWLEDGE_TOOL],
    } as ResponseCreateParamsNonStreaming);

    previousResponseId = response.id;
    const outputItems = (response.output || []) as ResponseItem[];

    const fileReadCalls = outputItems.filter(
      (item) => item.type === "function_call" && item.name === "read_knowledge_file",
    );

    if (fileReadCalls.length === 0) {
      // LLM produced a text answer — done
      return { text: response.output_text || "", sources };
    }

    // Execute file reads and feed results back
    const toolResults = await Promise.all(
      fileReadCalls.map(async (call) => {
        const args = JSON.parse(call.arguments || "{}") as { filename?: string };
        const filename = args.filename || "";
        const content = await readKnowledgeFile(filename);
        if (filename && !sources.includes(filename)) sources.push(filename);
        return { type: "function_call_output", call_id: call.call_id, output: content };
      }),
    );

    currentInput = toolResults;
  }

  return { text: "", sources, finalResponseId: previousResponseId };
}

// ---------------------------------------------------------------------------
// Streaming helpers
// ---------------------------------------------------------------------------

async function streamFromResponseId(
  openai: OpenAI,
  model: string,
  instructions: string,
  previousResponseId: string,
  onDelta: (delta: string) => void | Promise<void>,
): Promise<void> {
  const stream = await openai.responses.create({
    model,
    instructions,
    previous_response_id: previousResponseId,
    input: [{ type: "text", text: "Please provide your final answer now." }],
    stream: true,
  } as never);

  for await (const event of stream as unknown as AsyncIterable<ResponseStreamEvent>) {
    if (event.type === "response.output_text.delta") {
      await onDelta(event.delta);
    }
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "response.failed") {
      throw new Error(event.response.error?.message || "OpenAI response failed.");
    }
  }
}

async function streamText(text: string, onDelta: (delta: string) => void | Promise<void>) {
  const words = text.split(/(\s+)/);
  for (const word of words) {
    await onDelta(word);
  }
}

function shouldRecommendHandoff(message: string) {
  return /(人工|客服|投诉|退款|扣费|争议|受伤|疼|怀孕|高血压|康复|human|complaint|refund|charge|injury|pain|pregnan|blood pressure|rehab)/i.test(
    message,
  );
}
