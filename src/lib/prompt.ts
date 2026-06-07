import type { ChatMessage, RuntimeSkillMetadata } from "./types";

export function buildSkillSelectionInstructions(skills: RuntimeSkillMetadata[]) {
  return [
    "You are the skill router for the Tempo Fitness customer service chatbot.",
    "Your job is to choose the single best runtime skill for the user's latest message.",
    "Do not answer the user directly in this step.",
    "Use the load_skill tool whenever a skill is needed.",
    "If the user asks about pain, injury, illness, pregnancy, rehab, or medical safety, choose the safety skill.",
    "If the user complains, disputes a refund or charge, or asks for a human, choose the human handoff skill.",
    "Otherwise choose the customer service skill for Tempo Fitness studio questions.",
    "",
    "Available runtime skills:",
    ...skills.map(
      (skill) =>
        `- ${skill.name}: ${skill.description} Knowledge files: ${skill.knowledgeFiles.join(", ") || "none"}`,
    ),
  ].join("\n");
}

export function buildFinalAnswerInstructions(input: {
  skillName: string;
  skillInstructions: string;
  knowledgeContext: string;
}) {
  return [
    "You are Tempo Fitness's customer service chatbot.",
    "Answer the user's latest message using only the selected skill instructions and knowledge context.",
    "Do not invent prices, schedules, addresses, refund terms, booking rules, or medical advice.",
    "If the provided knowledge does not confirm an answer, say the information is not confirmed and recommend contacting staff.",
    "Keep the answer concise, friendly, and actionable.",
    "For safety or medical topics, do not diagnose, prescribe training, or promise safety. Recommend professional advice and staff handoff.",
    "For complaints, payment problems, refund disputes, or explicit human requests, recommend human support.",
    "",
    `Selected skill: ${input.skillName}`,
    "",
    "Selected skill instructions:",
    input.skillInstructions,
    "",
    "Knowledge context:",
    input.knowledgeContext || "No matching knowledge context was found.",
  ].join("\n");
}

export function formatMessagesForModel(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}
