import { promises as fs } from "fs";
import path from "path";
import type { RuntimeSkillMetadata } from "./types";

const SKILLS_DIR = path.join(process.cwd(), "skills");

export async function listRuntimeSkills() {
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const skillDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const skills = await Promise.all(skillDirs.map((dir) => readSkillMetadata(dir)));
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function assertRuntimeSkillExists(name: string) {
  const skills = await listRuntimeSkills();
  const skill = skills.find((candidate) => candidate.name === name);

  if (!skill) {
    throw new Error(`Unknown runtime skill: ${name}`);
  }

  return skill;
}

export async function readSkillFileByName(name: string) {
  const skills = await listRuntimeSkills();
  const skillDir = skills.find((candidate) => candidate.name === name)?.directory;

  if (!skillDir) {
    throw new Error(`Unknown runtime skill: ${name}`);
  }

  return fs.readFile(path.join(SKILLS_DIR, skillDir, "SKILL.md"), "utf8");
}

async function readSkillMetadata(directory: string): Promise<RuntimeSkillMetadata & { directory: string }> {
  const raw = await fs.readFile(path.join(SKILLS_DIR, directory, "SKILL.md"), "utf8");
  const { frontmatter } = parseFrontmatter(raw);

  return {
    directory,
    name: requireFrontmatter(frontmatter, "name"),
    description: requireFrontmatter(frontmatter, "description"),
    knowledgeFiles: parseList(frontmatter.knowledgeFiles),
  };
}

export function parseFrontmatter(raw: string) {
  if (!raw.startsWith("---\n")) {
    return { frontmatter: {} as Record<string, string | string[]>, body: raw.trim() };
  }

  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {} as Record<string, string | string[]>, body: raw.trim() };
  }

  const frontmatterRaw = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).trim();
  const frontmatter: Record<string, string | string[]> = {};
  let currentKey: string | null = null;

  for (const line of frontmatterRaw.split("\n")) {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentKey) {
      const existing = frontmatter[currentKey];
      frontmatter[currentKey] = [...(Array.isArray(existing) ? existing : []), cleanValue(listItem[1])];
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }

    currentKey = pair[1];
    frontmatter[currentKey] = cleanValue(pair[2]);
  }

  return { frontmatter, body };
}

function parseList(value: string | string[] | undefined) {
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
      .map(cleanValue)
      .filter(Boolean);
  }

  return [cleanValue(trimmed)].filter(Boolean);
}

function requireFrontmatter(frontmatter: Record<string, string | string[]>, key: string) {
  const value = frontmatter[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required skill frontmatter: ${key}`);
  }

  return value;
}

function cleanValue(value: string) {
  return value.trim().replace(/^["']|["']$/g, "");
}
