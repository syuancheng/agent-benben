import { promises as fs } from "fs";
import path from "path";
import type { KnowledgeSource, RuntimeSkillMetadata } from "./types";

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
    knowledgeSources: parseKnowledgeSources(frontmatter.knowledge_sources),
  };
}

export type FrontmatterValue = string | string[] | Array<Record<string, string>>;

export function parseFrontmatter(raw: string) {
  if (!raw.startsWith("---\n")) {
    return { frontmatter: {} as Record<string, FrontmatterValue>, body: raw.trim() };
  }

  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {} as Record<string, FrontmatterValue>, body: raw.trim() };
  }

  const frontmatterRaw = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).trim();
  const frontmatter: Record<string, FrontmatterValue> = {};
  let currentKey: string | null = null;
  let currentObject: Record<string, string> | null = null;

  for (const line of frontmatterRaw.split("\n")) {
    // Detect indented key: value inside a list item (e.g. "    note: ...")
    const nestedPair = line.match(/^\s{2,}([A-Za-z0-9_-]+):\s*(.*)$/);
    if (nestedPair && currentKey && currentObject !== null) {
      currentObject[nestedPair[1]] = cleanValue(nestedPair[2]);
      continue;
    }

    // Detect list item: "  - value" or "  - key: value"
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentKey) {
      const itemText = listItem[1];
      const objectStart = itemText.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (objectStart) {
        // Start a new object entry in an array
        currentObject = { [objectStart[1]]: cleanValue(objectStart[2]) };
        const existing = frontmatter[currentKey];
        const arr = Array.isArray(existing) ? (existing as Array<Record<string, string>>) : [];
        arr.push(currentObject);
        frontmatter[currentKey] = arr;
      } else {
        // Plain string list item
        currentObject = null;
        const existing = frontmatter[currentKey];
        frontmatter[currentKey] = [...(Array.isArray(existing) ? (existing as string[]) : []), cleanValue(itemText)];
      }
      continue;
    }

    // Top-level key: value pair
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }

    currentObject = null;
    currentKey = pair[1];
    frontmatter[currentKey] = cleanValue(pair[2]);
  }

  return { frontmatter, body };
}

export function parseKnowledgeSources(value: unknown): KnowledgeSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, string> => typeof item === "object" && item !== null)
    .map((item) => ({ file: item.file || "", note: item.note || "" }))
    .filter((s) => s.file);
}

function parseList(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return (value as string[]).filter((v) => typeof v === "string");
  }

  if (typeof value !== "string") {
    return [];
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

function requireFrontmatter(frontmatter: Record<string, FrontmatterValue>, key: string) {
  const value = frontmatter[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required skill frontmatter: ${key}`);
  }

  return value;
}

function cleanValue(value: string) {
  return value.trim().replace(/^["']|["']$/g, "");
}

// Export parseList for potential use in other modules
export { parseList };
