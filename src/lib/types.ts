export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type KnowledgeChunk = {
  source: string;
  title: string;
  content: string;
  score: number;
};

export type KnowledgeSource = {
  file: string;
  note: string;
};

export type RuntimeSkillMetadata = {
  name: string;
  description: string;
  knowledgeSources: KnowledgeSource[];
};

export type LoadedSkill = RuntimeSkillMetadata & {
  instructions: string;
};

export type ChatResult = {
  message: ChatMessage;
  sources: string[];
  selectedSkill: string;
  handoffRecommended: boolean;
};
