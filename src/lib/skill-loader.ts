import { retrieveKnowledge } from "./retrieve";
import { parseFrontmatter, readSkillFileByName } from "./skill-registry";
import type { LoadedSkill } from "./types";

export async function loadRuntimeSkill(name: string, userMessage: string): Promise<{
  skill: LoadedSkill;
  knowledgeContext: string;
  sources: string[];
}> {
  const raw = await readSkillFileByName(name);
  const { frontmatter, body } = parseFrontmatter(raw);
  const knowledgeFiles = parseKnowledgeFiles(frontmatter.knowledgeFiles);
  const chunks = await retrieveKnowledge(userMessage, knowledgeFiles);

  return {
    skill: {
      name,
      description: String(frontmatter.description || ""),
      knowledgeFiles,
      instructions: body,
    },
    knowledgeContext: chunks
      .map((chunk) => `Source: ${chunk.source}\nTitle: ${chunk.title}\n${chunk.content}`)
      .join("\n\n---\n\n"),
    sources: Array.from(new Set(chunks.map((chunk) => chunk.source))),
  };
}

function parseKnowledgeFiles(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  return [trimmed];
}
