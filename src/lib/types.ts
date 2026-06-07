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

export type RuntimeSkillMetadata = {
  name: string;
  description: string;
  knowledgeFiles: string[];
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
