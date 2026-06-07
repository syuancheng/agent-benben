import { getOpenAIClient, getOpenAIModel } from "./openai";
import { buildFinalAnswerInstructions, buildSkillSelectionInstructions, formatMessagesForModel, getLatestUserMessage } from "./prompt";
import { loadRuntimeSkill } from "./skill-loader";
import { listRuntimeSkills } from "./skill-registry";
import type { ChatMessage, ChatResult } from "./types";
import type { OpenAI } from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

type ResponseItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
};

export async function runChatOrchestrator(messages: ChatMessage[]): Promise<ChatResult> {
  const prepared = await prepareChatResponse(messages);

  const finalResponse = await prepared.openai.responses.create({
    model: prepared.model,
    instructions: prepared.finalInstructions,
    ...prepared.finalInput,
  } as ResponseCreateParamsNonStreaming);

  return {
    message: {
      role: "assistant",
      content: finalResponse.output_text || "I could not generate an answer. Please contact Tempo Fitness staff.",
    },
    sources: prepared.sources,
    selectedSkill: prepared.selectedSkill,
    handoffRecommended: prepared.handoffRecommended,
  };
}

export async function streamChatOrchestrator(
  messages: ChatMessage[],
  handlers: {
    onMeta: (meta: Omit<ChatResult, "message">) => void | Promise<void>;
    onDelta: (delta: string) => void | Promise<void>;
  },
): Promise<void> {
  const prepared = await prepareChatResponse(messages);

  await handlers.onMeta({
    sources: prepared.sources,
    selectedSkill: prepared.selectedSkill,
    handoffRecommended: prepared.handoffRecommended,
  });

  const stream = await prepared.openai.responses.create({
    model: prepared.model,
    instructions: prepared.finalInstructions,
    ...prepared.finalInput,
    stream: true,
  } as ResponseCreateParamsStreaming);

  for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
    if (event.type === "response.output_text.delta") {
      await handlers.onDelta(event.delta);
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }

    if (event.type === "response.failed") {
      throw new Error(event.response.error?.message || "OpenAI response failed.");
    }
  }
}

async function prepareChatResponse(messages: ChatMessage[]): Promise<{
  openai: OpenAI;
  model: string;
  finalInstructions: string;
  finalInput: Record<string, unknown>;
  sources: string[];
  selectedSkill: string;
  handoffRecommended: boolean;
}> {
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
        description: "Load the selected Tempo Fitness runtime skill instructions and relevant knowledge context.",
        parameters: {
          type: "object",
          properties: {
            skill: {
              type: "string",
              enum: skills.map((skill) => skill.name),
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

  const toolCall = findLoadSkillToolCall(selectionResponse.output as ResponseItem[]);
  const requestedSkill = toolCall ? parseSkillName(toolCall.arguments) : fallbackSkillName(skills);
  const loaded = await loadRuntimeSkill(requestedSkill, latestUserMessage.content);
  const selectedSkill = loaded.skill.name;

  return {
    openai,
    model,
    finalInstructions: buildFinalAnswerInstructions({
      skillName: loaded.skill.name,
      skillInstructions: loaded.skill.instructions,
      knowledgeContext: loaded.knowledgeContext,
    }),
    finalInput: toolCall
      ? {
          previous_response_id: selectionResponse.id,
          input: [
            {
              type: "function_call_output",
              call_id: toolCall.call_id,
              output: JSON.stringify({
                skill: loaded.skill,
                knowledgeContext: loaded.knowledgeContext,
                sources: loaded.sources,
              }),
            },
          ],
        }
      : {
          input: formatMessagesForModel(messages),
        },
    sources: loaded.sources,
    selectedSkill,
    handoffRecommended: isHandoffSkill(selectedSkill) || shouldRecommendHandoff(latestUserMessage.content),
  };
}

function findLoadSkillToolCall(output: ResponseItem[] | undefined) {
  return output?.find((item) => item.type === "function_call" && item.name === "load_skill");
}

function parseSkillName(args: string | undefined) {
  if (!args) {
    throw new Error("load_skill tool call is missing arguments.");
  }

  const parsed = JSON.parse(args) as { skill?: string };
  if (!parsed.skill) {
    throw new Error("load_skill tool call is missing skill.");
  }

  return parsed.skill;
}

function fallbackSkillName(skills: Array<{ name: string }>) {
  return skills.find((skill) => skill.name === "tempo_customer_service")?.name || skills[0]?.name;
}

function isHandoffSkill(skillName: string) {
  return skillName.includes("handoff") || skillName.includes("safety");
}

function shouldRecommendHandoff(message: string) {
  return /(人工|客服|投诉|退款|扣费|争议|受伤|疼|怀孕|高血压|康复|human|complaint|refund|charge|injury|pain|pregnan|blood pressure|rehab)/i.test(
    message,
  );
}
