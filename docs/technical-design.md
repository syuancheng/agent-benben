# Tempo Fitness AI Customer Service Chatbot Technical Design

## 1. Goal

Build a web-based customer service chatbot for a fitness studio.

Users can ask questions in a frontend chat UI. The backend calls an OpenAI model through a customer-service chat orchestration layer. That orchestration layer uses the local `knowledge/*.md` files as its business knowledge source.

In this design, `knowledge/` is not itself a skill. It is content.

There are two related skill concepts:

1. Codex skill: a development-time skill used by Codex while building or maintaining this project. Codex can automatically trigger it based on the user's request and the skill description.
2. Runtime skill: a product-time skill used by the deployed chatbot. The app can implement a Codex-like skill mechanism by exposing skill metadata to the model and letting the model request a skill through tool calling.

The deployed web chatbot cannot rely on the Codex runtime itself. However, it can use the same design pattern: keep skill metadata and instructions in files, show the available skill list to the model, let the model return a tool call selecting a skill, then load the selected skill and call the model again.

The runtime chat orchestration combines:

- Skill metadata
- Selected skill instructions
- Conversation state
- Safety and handoff rules
- A skill loading tool
- A knowledge search tool used by the selected skill
- The retrieved knowledge content

The MVP should support:

- Fitness studio introduction
- Class explanations and recommendations
- Beginner guidance
- Membership and pricing questions
- Booking and cancellation policy questions
- Safety boundary handling
- Human handoff handling
- Common FAQ answers

The MVP should not try to build a complex multi-agent runtime. Development may use temporary Codex sub-agents and Codex skills. The production app should run as a single chat orchestrator with runtime skill selection through tool calling.

## 2. Non-Goals For MVP

The first version will not include:

- Real booking system integration
- Payment system integration
- CRM integration
- Admin dashboard for editing knowledge
- Persistent conversation history
- User accounts
- Vector database
- Multi-agent orchestration at runtime

These can be added after the core chat quality is stable.

## 3. Recommended Stack

- App framework: Next.js with App Router
- Language: TypeScript
- Frontend: React
- Styling: Tailwind CSS
- Backend: Next.js Route Handler
- LLM SDK: OpenAI Node SDK
- Knowledge source: local Markdown files under `knowledge/`
- Development skill: optional Codex skill for maintaining the Tempo Fitness chatbot project
- Runtime skills: app-readable skill files with frontmatter metadata and instructions
- Runtime orchestration: chat orchestrator implemented in app code
- Deployment target: Vercel or another Node-compatible host

This keeps frontend, backend, and knowledge retrieval in one codebase.

## 4. Runtime Architecture

The orchestration uses a two-phase agentic design.

### Phase 1 — Skill Loading (one-time)

```text
User message
  -> Backend loads skill metadata list
  -> OpenAI call #1 with load_skill tool (tool_choice: required)
  -> Model returns: load_skill({ skill: "tempo_customer_service" })
  -> Backend loads selected SKILL.md body + knowledge/index.md
  -> Injects both as function_call_output into Phase 2 context
```

### Phase 2 — Retrieval Execution (agentic loop, up to 5 rounds)

```text
OpenAI call #2 with read_knowledge_file tool + skill instructions + index
  -> Model reads knowledge/index.md to identify relevant files
  -> Model calls: read_knowledge_file({ filename: "beginner-guide.md" })
  -> Backend reads the file, injects content as function_call_output
  -> [repeat if more files are needed]
  -> Model produces final answer (no more tool calls)
  -> Backend streams answer to frontend
```

### Full Flow

```text
User
  |
  v
Frontend Chat UI
  |
  | POST /api/chat/stream
  v
Backend Chat Route
  |
  v
Chat Orchestration — Phase 1
  |
  | call #1: load_skill tool
  v
OpenAI Model
  |
  | tool call: load_skill(skillName)
  v
Skill Loader
  | loads SKILL.md body + knowledge/index.md
  v
Chat Orchestration — Phase 2
  |
  | call #2: read_knowledge_file tool + index injected
  v
OpenAI Model
  |
  | tool call: read_knowledge_file(filename)
  v
Knowledge File Reader
  | returns file content
  v
OpenAI Model  [repeats until no tool calls]
  |
  | final answer
  v
Backend streams to Frontend
```

The model never reads local files directly. The app exposes two explicit tools: `load_skill` for Phase 1 skill routing, and `read_knowledge_file` for Phase 2 on-demand knowledge retrieval.

The runtime flow is:

1. The backend loads the frontmatter metadata for available runtime skills.
2. Phase 1: the backend sends the user message, skill metadata, and `load_skill` tool. The model selects a skill.
3. The backend loads the selected `SKILL.md` body and `knowledge/index.md`, and injects them as the tool result.
4. Phase 2: the backend sends the skill instructions, index, and `read_knowledge_file` tool. The model reads the index to decide which files to load, then calls `read_knowledge_file` for each.
5. The backend executes each file read and returns the content as a tool result. This repeats until the model stops requesting files.
6. The model generates the final user-facing answer grounded in the files it chose to read.

This avoids loading all knowledge files upfront. The model loads only what it needs for each query, reducing token use and context noise.

## 5. Proposed Directory Structure

```text
tempo-fitness/
  docs/
    technical-design.md

  skills/
    tempo-customer-service/
      SKILL.md
    tempo-safety-boundary/
      SKILL.md
    tempo-human-handoff/
      SKILL.md

  knowledge/
    index.md             ← navigation index, injected in Phase 1
    studio-overview.md
    classes.md
    beginner-guide.md
    membership.md
    booking-policy.md
    cancellation-policy.md
    safety-boundary.md
    handoff-policy.md
    faq.md

  src/
    app/
      page.tsx
      layout.tsx
      globals.css
      api/
        chat/
          route.ts

    components/
      ChatWindow.tsx
      MessageBubble.tsx
      ChatInput.tsx

    lib/
      openai.ts
      knowledge.ts
      retrieve.ts
      prompt.ts
      chat-orchestrator.ts
      skill-loader.ts
      skill-registry.ts
      types.ts

  .env.local.example
  next.config.ts
  package.json
  tsconfig.json
```

## 6. Knowledge Module

The existing `knowledge/` directory is the source of truth for business information.

Each file owns a specific conversation area:

- `studio-overview.md`: studio intro, address, opening hours, positioning
- `classes.md`: class types and suitability
- `beginner-guide.md`: beginner recommendations and goals
- `membership.md`: pricing, packages, trial classes, consultations
- `booking-policy.md`: booking process and walk-in policy
- `cancellation-policy.md`: cancellation, late arrival, refund, no-show rules
- `safety-boundary.md`: injury, pain, illness, pregnancy, and medical safety limits
- `handoff-policy.md`: complaints, refunds, payment disputes, human support
- `faq.md`: common fallback questions

### Navigation Index

`knowledge/index.md` is the entry point for Phase 2 retrieval. It contains a table mapping each file to its topics. The model reads this index first to decide which files to load for the current query.

```markdown
| File | Topics |
|---|---|
| beginner-guide.md | Beginner fitness, body measurements, sedentary workers, fat loss, muscle gain |
| classes.md | Class types, schedules, intensity, night run routes, pace groups |
| ...  | ... |
```

### Agentic Retrieval Strategy

Phase 2 uses an agentic loop driven by the `read_knowledge_file` tool:

1. The model receives the knowledge index and skill instructions as context.
2. The model calls `read_knowledge_file(filename)` for each file it needs.
3. The backend reads the file and returns its full content as a tool result.
4. The model may call the tool multiple times across rounds (up to 5).
5. When the model produces text without a tool call, that is the final answer.

Sources are tracked as the list of files the model actually requested.

Why this approach instead of pre-loaded chunks:

- **Token efficiency**: most queries need 1-2 files, not all 9. Chunk injection loads the entire set regardless.
- **No context noise**: irrelevant file content does not interfere with the model's judgment.
- **Index-driven routing**: the model reads the index and routes to the right file by meaning, not keyword scoring.

### Future Retrieval Strategy

When the knowledge base grows beyond local files, migrate to:

- OpenAI Vector Store with `file_search`
- Admin upload workflow
- Versioned knowledge documents

## 7. Skill System

### Runtime Skill Files

Runtime skills are app-readable files. They can follow a Codex-like `SKILL.md` format with frontmatter metadata plus instructions.

Example:

```markdown
---
name: tempo_customer_service
description: Answer Tempo Fitness studio, class, membership, booking, cancellation, and FAQ questions.
knowledge_sources:
  - file: beginner-guide.md
    note: Beginner fitness advice, body measurements, sedentary desk workers, fat loss, muscle gain
  - file: classes.md
    note: Class types, schedules, intensity guide, night run routes and pace groups
  - file: studio-overview.md
    note: Studio location, amenities, arrival guidance, house rules
  - file: membership.md
    note: Membership options, pricing, class packs, trial offers
  - file: booking-policy.md
    note: How to book, walk-in policy, reservations, waitlist
  - file: cancellation-policy.md
    note: Cancellation policy, refunds, late cancel, no-show, credit rules
  - file: faq.md
    note: Frequently asked questions
---

# Tempo Fitness Customer Service Skill

Use Tempo Fitness knowledge files as the source of truth.
Do not invent prices, schedules, addresses, or policies.
```

`knowledge_sources` declares which files this skill can read, with a `note` describing each file's content. The frontmatter is safe to show to the model during skill selection. The full skill body and file contents are only loaded after the model selects the skill.

### Runtime Skill Registry

Suggested file:

```text
src/lib/skill-registry.ts
```

Responsibilities:

- Read available skill directories under `skills/`.
- Parse each `SKILL.md` frontmatter.
- Return a compact skill metadata list for the first model call.
- Validate that a requested skill name exists.

### Runtime Skill Loader

Suggested file:

```text
src/lib/skill-loader.ts
```

Responsibilities:

- Load the selected `SKILL.md` body and parse `knowledge_sources`.
- Read `knowledge/index.md` as the Phase 2 navigation anchor.
- Return the skill instructions and index content as the `load_skill` tool output.
- Does not pre-load or score knowledge chunks — file reading happens in Phase 2.

### Codex Skill Vs Runtime Skill

#### Codex Skill

A Codex skill is useful for development and maintenance. It can teach Codex how to work on this specific project, such as:

- How the Tempo Fitness knowledge files are structured
- How to update chatbot prompts
- How to add new knowledge files safely
- How to run acceptance checks
- How to avoid mixing runtime app skills with Codex development skills

Codex skill triggering is handled by Codex. When the user asks for a task that matches the skill description, Codex can load the skill instructions and follow them.

The deployed web chatbot does not automatically get Codex's native skill runtime. If we want frontend users to trigger skills, the app must implement the runtime skill registry and `load_skill` tool described above.

#### Runtime Chat Orchestration

Runtime chat orchestration is implemented in app code. It is what the deployed chatbot uses when a frontend user sends a message.

The orchestration owns:

- The assistant's role and tone
- How conversation history is passed to the model
- Which skill metadata is visible to the model
- Which skill loading tool is available
- How retrieved knowledge is inserted into the model request
- Safety boundaries
- Handoff rules
- Response shape returned to the frontend

Suggested file:

```text
src/lib/chat-orchestrator.ts
```

Responsibilities:

- Accept chat messages from the API route.
- Load available skill metadata from `skill-registry.ts`.
- Make the first OpenAI request with the `load_skill` tool available.
- Read the returned tool call.
- Execute `load_skill` through `skill-loader.ts`.
- Send the tool output back to the model.
- Return assistant text, source filenames, and `handoffRecommended`.

### Runtime Tool Calling Flow

```text
Phase 1 — Skill Selection
  -> chat-orchestrator loads skill metadata
  -> OpenAI call #1 with load_skill tool
  -> model returns tool-use: load_skill({ skill: "tempo_customer_service" })
  -> backend loads SKILL.md body + knowledge/index.md

Phase 2 — Agentic Retrieval (up to 5 rounds)
  -> OpenAI call #2: model receives skill instructions + index
  -> model calls read_knowledge_file({ filename: "beginner-guide.md" })
  -> backend reads file, injects content
  -> [repeat for additional files if needed]
  -> model produces final answer (no tool call)
```

Phase 1 always produces one tool call. Phase 2 produces one tool call per file read, followed by the final text answer. The context accumulates across rounds via `previous_response_id`.

## 8. Chat API

Streaming endpoint used by the frontend:

```text
POST /api/chat/stream
```

Request body:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "第一次来应该上什么课？"
    }
  ]
}
```

Response body:

```text
event: meta
data: {"sources":["beginner-guide.md","classes.md"],"selectedSkill":"tempo_customer_service","handoffRecommended":false}

event: delta
data: {"delta":"..."}

event: done
data: {}
```

The skill selection call is not streamed to the user. The final answer call is streamed token-by-token through Server-Sent Events.

Non-streaming endpoint retained for compatibility:

```text
POST /api/chat
```

Request body:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "第一次来应该上什么课？"
    }
  ]
}
```

Response body:

```json
{
  "message": {
    "role": "assistant",
    "content": "..."
  },
  "sources": [
    "beginner-guide.md",
    "classes.md"
  ],
  "handoffRecommended": false
}
```

## 9. Prompt Design

There are two prompt layers.

### Skill Selection Prompt

The first model call should select a skill, not answer the user directly.

It receives:

- Current user message
- Recent conversation history
- Compact runtime skill metadata from `skill-registry.ts`
- The `load_skill` function tool

Core rules:

- Choose the best skill using the skill descriptions.
- Return a `load_skill` tool call when a skill is needed.
- Do not answer the user before the selected skill instructions and knowledge are loaded.
- If no skill applies, call the fallback or handoff skill.

### Final Answer Prompt

Phase 2 model calls receive:

- Current user message and conversation history
- Selected skill instructions (from `load_skill` tool output)
- `knowledge/index.md` content (navigation anchor, from `load_skill` tool output)
- The `read_knowledge_file` tool
- File contents returned by previous `read_knowledge_file` calls (accumulated via `previous_response_id`)

The model is instructed to read the index first, call `read_knowledge_file` for each relevant file, then produce the answer.

Core rules:

- Use `read_knowledge_file` before answering — do not guess from memory.
- Read only the files relevant to the user's question, not all files.
- Answer only based on the knowledge files read.
- Do not invent prices, schedules, addresses, refund terms, or medical advice.
- If knowledge is missing, say that the current information is not confirmed and recommend contacting staff.
- Keep answers concise, friendly, and actionable.
- For safety, medical, pain, injury, pregnancy, or illness topics, do not diagnose or prescribe training. Recommend consulting a qualified professional and notify staff before class.
- For complaints, refund disputes, payment problems, or explicit human-support requests, recommend human handoff.

## 10. Handoff Logic

Handoff can be detected in two ways:

1. Rule-based keyword checks before model call.
2. Model-instructed recommendation in the answer.

MVP handoff triggers:

- User asks for a human
- Complaint or negative escalation
- Refund dispute
- Payment or charge issue
- Injury, pain, illness, pregnancy, rehabilitation, high blood pressure
- Question outside the knowledge base

The API should expose `handoffRecommended` so the UI can show a handoff hint later.

## 11. Frontend UX

The MVP chat UI should include:

- Message list
- User and assistant message bubbles
- Text input
- Send button
- Enter-to-send
- Loading state
- Error state
- Basic empty state

The UI should not expose internal retrieval details by default. During development, sources can be displayed in a small debug area.

## 12. Environment Variables

Required:

```text
OPENAI_API_KEY=
OPENAI_MODEL=
```

Recommended default model:

```text
OPENAI_MODEL=gpt-4.1-mini
```

The model value should be configurable so upgrades do not require code changes.

## 13. Development Sub-Agent Usage

Sub-agents are for development only. They are not part of the runtime system.

Recommended development split:

- Frontend worker: chat UI components and page layout
- Backend worker: `/api/chat`, OpenAI SDK integration, request validation
- Knowledge worker: Markdown loading, chunking, retrieval scoring
- Prompt and safety worker: system prompt, handoff rules, safety constraints
- QA worker: acceptance questions and manual test cases

The main agent should integrate the work, resolve conflicts, and run verification.

## 14. Acceptance Test Questions

Use these questions to verify MVP behavior:

- "第一次来适合上什么课？"
- "你们有哪些课程？"
- "HIIT 和瑜伽课有什么区别？"
- "怎么预约体验课？"
- "可以 walk-in 吗？"
- "我迟到了还能进教室吗？"
- "取消预约会扣课吗？"
- "会员多少钱？"
- "我膝盖痛还能练吗？"
- "我要找人工客服。"
- "我觉得被乱扣费了。"
- "你们几点营业？"

Expected behavior:

- The assistant answers from the relevant knowledge files.
- The assistant does not fabricate missing details.
- The assistant recommends handoff for safety, refund, complaint, payment, and human-support scenarios.

## 15. Implementation Plan

### Phase 1: Project Setup

- Initialize Next.js with TypeScript.
- Add Tailwind CSS.
- Add OpenAI SDK.
- Add `.env.local.example`.

### Phase 2: Chat UI

- Build `ChatWindow`.
- Build `MessageBubble`.
- Build `ChatInput`.
- Connect UI to `/api/chat/stream`.
- Append assistant text as `delta` events arrive.

### Phase 3: Backend Chat Route

- Add request validation.
- Read latest user message.
- Call the customer-service chat orchestration layer.
- Return assistant message, sources, and handoff flag.
- Keep `/api/chat` as a non-streaming compatibility endpoint.
- Add `/api/chat/stream` as the frontend endpoint.

### Phase 4: Runtime Skill Files

- Create `skills/tempo-customer-service/SKILL.md`.
- Create `skills/tempo-safety-boundary/SKILL.md`.
- Create `skills/tempo-human-handoff/SKILL.md`.
- Add frontmatter with `name`, `description`, and `knowledge_sources` (file + note entries).
- Add full skill instructions below the frontmatter.

### Phase 5: Skill Registry And Loader

- Implement `src/lib/skill-registry.ts`.
- Parse `SKILL.md` frontmatter including structured `knowledge_sources` list objects.
- Return compact metadata for the first model call.
- Implement `src/lib/skill-loader.ts`.
- Load selected skill body and `knowledge/index.md`.
- Return both as the `load_skill` tool output (no chunk retrieval).

### Phase 6: Knowledge Index

- Create `knowledge/index.md` as a navigation index table (file → topics).
- Add `src/lib/knowledge.ts` with `readKnowledgeFile(filename)` for Phase 2 tool execution.
- No chunking or keyword scoring needed.

### Phase 7: Two-Phase Agentic Orchestration

- Implement `src/lib/chat-orchestrator.ts`.
- Phase 1: OpenAI call #1 with skill metadata and `load_skill` tool. Load skill body + index.
- Phase 2: agentic loop (up to 5 rounds) with `read_knowledge_file` tool.
  - Each round: model calls tool → backend reads file → inject as `function_call_output`.
  - Loop exits when model produces text (no tool call).
  - Accumulate sources (files actually read).
- Stream final answer word-by-word after the loop resolves.
- Keep the API route thin.

### Phase 8: Prompt And Safety

- Add skill selection prompt.
- Add final answer prompt.
- Add safety and handoff rules.
- Make missing-knowledge behavior explicit.

### Phase 9: Verification

- Run local typecheck and lint.
- Manually test acceptance questions.
- Verify the UI handles loading and errors.

## 16. Future Enhancements

- Persistent conversation history
- Admin knowledge editor
- OpenAI Vector Store and `file_search`
- Real booking integration
- Staff handoff inbox
- Analytics for unresolved questions
- Multi-language support
- Evaluation suite for answer grounding
