import { loadKnowledgeDocuments } from "./knowledge";
import type { KnowledgeChunk } from "./types";

const TOKEN_SPLIT_RE = /[\s,.;:!?()[\]{}"'`，。！？、；：（）【】《》]+/u;

const INTENT_FILE_HINTS: Array<{ terms: string[]; files: string[] }> = [
  {
    terms: ["beginner", "new", "first", "start", "fat loss", "muscle", "第一次", "新手", "减脂", "增肌", "开始"],
    files: ["beginner-guide.md", "classes.md", "faq.md"],
  },
  {
    terms: ["class", "hiit", "strength", "mobility", "running", "run", "night run", "route", "where", "when", "time", "课程", "训练", "力量", "跑步", "夜跑", "路线", "几点", "时间", "哪里"],
    files: ["classes.md", "faq.md"],
  },
  {
    terms: ["price", "membership", "package", "trial", "cost", "多少钱", "会员", "价格", "体验课", "课包"],
    files: ["membership.md"],
  },
  {
    terms: ["book", "booking", "reserve", "walk-in", "预约", "报名", "到店"],
    files: ["booking-policy.md"],
  },
  {
    terms: ["cancel", "late", "refund", "no-show", "取消", "迟到", "退款", "扣课"],
    files: ["cancellation-policy.md", "handoff-policy.md"],
  },
  {
    terms: ["pain", "injury", "pregnant", "blood pressure", "疼", "受伤", "怀孕", "高血压", "康复"],
    files: ["safety-boundary.md", "handoff-policy.md"],
  },
  {
    terms: ["human", "complaint", "charge", "客服", "人工", "投诉", "扣费", "争议"],
    files: ["handoff-policy.md"],
  },
];

export async function retrieveKnowledge(query: string, preferredFiles?: string[], limit = 5) {
  const documents = await loadKnowledgeDocuments(preferredFiles);
  const queryTerms = tokenize(query);
  const hintedFiles = getHintedFiles(query);

  const chunks = documents.flatMap((document) => chunkDocument(document.filename, document.content));

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(queryTerms, chunk) + (hintedFiles.has(chunk.source) ? 3 : 0),
    }))
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

function getHintedFiles(query: string) {
  const lower = query.toLowerCase();
  const files = new Set<string>();

  for (const hint of INTENT_FILE_HINTS) {
    if (hint.terms.some((term) => lower.includes(term.toLowerCase()))) {
      hint.files.forEach((file) => files.add(file));
    }
  }

  return files;
}

function tokenize(text: string) {
  const normalized = text.toLowerCase();
  const asciiTerms = normalized.split(TOKEN_SPLIT_RE).filter((term) => term.length >= 2);
  const chineseTerms = Array.from(normalized.matchAll(/[\u4e00-\u9fff]{2,}/gu), (match) => match[0]);

  return Array.from(new Set([...asciiTerms, ...chineseTerms]));
}
