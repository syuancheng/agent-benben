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

```text
User
  |
  v
Frontend Chat UI
  |
  | POST /api/chat
  v
Backend Chat Route
  |
  | run customer-service chat orchestration
  v
Chat Orchestration
  |
  | first model call with skill metadata and load_skill tool
  v
OpenAI Model
  |
  | returns tool-use: load_skill(skillName, userIntent)
  v
Runtime Skill Loader
  |
  | selected skill instructions
  v
Chat Orchestration
  |
  | selected skill calls knowledge search
  v
Knowledge Retriever
  |
  | relevant knowledge chunks + selected skill content
  v
OpenAI Model
  |
  | answer grounded in knowledge
  v
Backend Chat Route
  |
  v
Frontend Chat UI
```

The model does not directly read local files. A prompt alone cannot make the model scan the project directory. The app must expose an explicit tool that lets the model request a skill.

The runtime flow is:

1. The backend loads the frontmatter metadata for available runtime skills.
2. The backend sends the user message, conversation context, skill metadata list, and a `load_skill` function tool to the model.
3. The model returns a tool call such as `load_skill({ "skill": "tempo_customer_service" })`.
4. The backend executes the tool by loading the selected skill instructions and any relevant knowledge.
5. The backend sends the tool output back to the model.
6. The model generates the final user-facing answer.

This matches the standard OpenAI tool-calling loop: request with tools, receive tool call, execute app code, submit tool output, then receive the final model response.

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

### MVP Retrieval Strategy

The MVP can use simple local retrieval:

1. Read all Markdown files from `knowledge/`.
2. Split each file into chunks by headings or paragraphs.
3. Score chunks against the latest user message.
4. Prefer files whose scenario matches the user intent.
5. Return the top 3-5 chunks to the chat route.

This is enough while the knowledge base is small.

### Future Retrieval Strategy

When the knowledge base grows, migrate to:

- OpenAI Vector Store
- `file_search`
- Admin upload workflow
- Versioned knowledge documents

## 7. Skill System

### Runtime Skill Files

Runtime skills are app-readable files. They can follow a Codex-like `SKILL.md` format with frontmatter metadata plus instructions.

Example:

```markdown
---
name: tempo_customer_service
description: Answer Tempo Fitness studio, class, membership, booking, cancellation, and FAQ questions using Tempo Fitness knowledge.
---

# Tempo Fitness Customer Service Skill

Use Tempo Fitness knowledge files as the source of truth.
Do not invent prices, schedules, addresses, or policies.
```

The runtime skill frontmatter is safe to show to the model during skill selection. The full skill body should only be loaded after the model selects that skill.

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

- Load the selected `SKILL.md` body.
- Attach skill-specific knowledge files or retrieval configuration.
- Return the skill instructions and selected knowledge context as the `load_skill` tool output.

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
User message
  -> chat-orchestrator loads skill metadata
  -> OpenAI call #1 with load_skill tool
  -> model returns tool-use: load_skill(...)
  -> backend loads selected SKILL.md and relevant knowledge
  -> OpenAI call #2 with function_call_output
  -> model returns final answer
```

The first model response should normally be a tool-use response. The second model response should be the final user-facing answer.

## 8. Chat API

Endpoint:

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

The first version can return a non-streaming response. Streaming can be added later for better UX.

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

The second model call should produce the user-facing answer.

It receives:

- Current user message
- Recent conversation history
- Selected skill instructions
- Retrieved knowledge context
- Tool output from `load_skill`

The assistant should behave as a fitness studio customer service representative.

Core rules:

- Answer only based on provided knowledge context.
- Do not invent prices, schedules, addresses, refund terms, or medical advice.
- If knowledge is missing, say that the current information is not confirmed and recommend contacting staff.
- Keep answers concise, friendly, and actionable.
- Ask one follow-up question only when needed.
- For safety, medical, pain, injury, pregnancy, or illness topics, do not diagnose or prescribe training. Recommend consulting a qualified professional and notify staff before class.
- For complaints, refund disputes, payment problems, or explicit human-support requests, recommend human handoff.

The prompt should include:

- Assistant role
- Selected skill instructions
- Knowledge context
- Safety rules
- Handoff rules
- Answer style
- Current conversation history

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
- Connect UI to `/api/chat`.

### Phase 3: Backend Chat Route

- Add request validation.
- Read latest user message.
- Call the customer-service chat orchestration layer.
- Return assistant message, sources, and handoff flag.

### Phase 4: Runtime Skill Files

- Create `skills/tempo-customer-service/SKILL.md`.
- Create `skills/tempo-safety-boundary/SKILL.md`.
- Create `skills/tempo-human-handoff/SKILL.md`.
- Add frontmatter with `name` and `description` for skill selection.
- Add full skill instructions below the frontmatter.

### Phase 5: Skill Registry And Loader

- Implement `src/lib/skill-registry.ts`.
- Parse `SKILL.md` frontmatter.
- Return compact metadata for the first model call.
- Implement `src/lib/skill-loader.ts`.
- Validate selected skill names.
- Load the selected skill body.

### Phase 6: Knowledge Retrieval

- Implement Markdown file loader.
- Implement chunking.
- Implement keyword scoring.
- Add file-level intent weighting.

### Phase 7: Tool-Use Chat Orchestration

- Implement `src/lib/chat-orchestrator.ts`.
- Make OpenAI call #1 with skill metadata and `load_skill` tool.
- Parse model tool-use output.
- Execute `load_skill`.
- Retrieve relevant knowledge for the selected skill.
- Make OpenAI call #2 with `function_call_output`.
- Return the final model answer.
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

- Streaming responses
- Persistent conversation history
- Admin knowledge editor
- OpenAI Vector Store and `file_search`
- Real booking integration
- Staff handoff inbox
- Analytics for unresolved questions
- Multi-language support
- Evaluation suite for answer grounding
