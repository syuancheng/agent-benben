import { readKnowledgeFile } from "./knowledge";
import { parseFrontmatter, parseKnowledgeSources, readSkillFileByName } from "./skill-registry";
import type { LoadedSkill } from "./types";

export async function loadSkillContext(name: string): Promise<{
  skill: LoadedSkill;
  indexContent: string;
}> {
  const raw = await readSkillFileByName(name);
  const { frontmatter, body } = parseFrontmatter(raw);
  const knowledgeSources = parseKnowledgeSources(frontmatter.knowledge_sources);
  const indexContent = await readKnowledgeFile("index.md");

  return {
    skill: {
      name,
      description: String(frontmatter.description || ""),
      knowledgeSources,
      instructions: body,
    },
    indexContent,
  };
}
