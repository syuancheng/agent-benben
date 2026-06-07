import { promises as fs } from "fs";
import path from "path";

export type KnowledgeDocument = {
  filename: string;
  content: string;
};

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

export async function loadKnowledgeDocuments(files?: string[]) {
  const allFiles = await fs.readdir(KNOWLEDGE_DIR);
  const wanted = new Set(files?.filter(Boolean));

  const markdownFiles = allFiles
    .filter((file) => file.endsWith(".md"))
    .filter((file) => wanted.size === 0 || wanted.has(file));

  const documents = await Promise.all(
    markdownFiles.map(async (filename) => ({
      filename,
      content: await fs.readFile(path.join(KNOWLEDGE_DIR, filename), "utf8"),
    })),
  );

  return documents;
}
