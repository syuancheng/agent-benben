import { getOpenAIClient, getOpenAIModel } from "./openai";
import { buildFinalAnswerInstructions, buildSkillSelectionInstructions, formatMessagesForModel, getLatestUserMessage } from "./prompt";
import { loadRuntimeSkill } from "./skill-loader";
import { listRuntimeSkills } from "./skill-registry";
import type { ChatMessage, ChatResult } from "./types";

type ResponseItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
};

export async function runChatOrchestrator(messages: ChatMessage[]): Promise<ChatResult> {
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

  const finalResponse = await openai.responses.create({
    model,
    instructions: buildFinalAnswerInstructions({
      skillName: loaded.skill.name,
      skillInstructions: loaded.skill.instructions,
      knowledgeContext: loaded.knowledgeContext,
    }),
    ...(toolCall
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
        }),
  } as never);

  const selectedSkill = loaded.skill.name;

  return {
    message: {
      role: "assistant",
      content: finalResponse.output_text || "I could not generate an answer. Please contact Tempo Fitness staff.",
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
