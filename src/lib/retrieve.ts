import { loadKnowledgeDocuments } from "./knowledge";
import type { KnowledgeChunk } from "./types";

const TOKEN_SPLIT_RE = /[\s,.;:!?()[\]{}"'`，。！？、；：（）【】《》]+/u;

export async function retrieveKnowledge(query: string, preferredFiles?: string[], limit = 5) {
  const documents = await loadKnowledgeDocuments(preferredFiles);
  const queryTerms = tokenize(query);
  const chunks = documents.flatMap((document) => chunkDocument(document.filename, document.content));
  return chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(queryTerms, chunk) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function chunkDocument(source: string, content: string): KnowledgeChunk[] {
  const sections = content
    .split(/\n(?=##?\s+)/g)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.map((section, index) => {
    const title = section.match(/^#+\s+(.+)$/m)?.[1] || `${source} section ${index + 1}`;

    return {
      source,
      title,
      content: section,
      score: 0,
    };
  });
}

function scoreChunk(queryTerms: string[], chunk: KnowledgeChunk) {
  const searchable = `${chunk.title}\n${chunk.content}`.toLowerCase();
  return queryTerms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
}

function tokenize(text: string) {
  const normalized = text.toLowerCase();
  const asciiTerms = normalized.split(TOKEN_SPLIT_RE).filter((term) => term.length >= 2);
  const chineseTerms = Array.from(normalized.matchAll(/[一-鿿]{2,}/gu), (match) => match[0]);

  return Array.from(new Set([...asciiTerms, ...chineseTerms]));
}
