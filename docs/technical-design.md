# FitFlow AI Customer Service Chatbot Technical Design

## 1. Goal

Build a web-based customer service chatbot for a fitness studio.

Users can ask questions in a frontend chat UI. The backend calls an OpenAI model through a customer-service chat orchestration layer. That orchestration layer uses the local `knowledge/*.md` files as its business knowledge source.

In this design, `knowledge/` is not itself a skill. It is content.

There are two different skill concepts:

1. Codex skill: a development-time skill used by Codex while building or maintaining this project. Codex can automatically trigger it based on the user's request and the skill description.
2. Runtime chat orchestration: app code used by the deployed chatbot when frontend users send messages.

The frontend user does not directly trigger a Codex skill. The frontend user triggers `/api/chat`; the backend then runs the runtime chat orchestration code.

The runtime chat orchestration combines:

- Assistant instructions
- Conversation state
- Safety and handoff rules
- A knowledge search tool
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

The MVP should not try to build a complex multi-agent runtime. Development may use temporary Codex sub-agents and Codex skills, but the production app should run as a single customer-service chat orchestration layer with knowledge search.

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
- Development skill: optional Codex skill for maintaining the FitFlow chatbot project
- Runtime orchestration: customer-service chat orchestration implemented in app code
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
  | call knowledge search tool
  v
Knowledge Retriever
  |
  | relevant knowledge chunks
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

The model does not directly read local files. A prompt alone cannot make the model automatically load a local skill or scan the project directory.

The application must explicitly give the model access to knowledge in one of two ways:

1. Custom tool approach: the backend implements a `searchKnowledge` function, retrieves relevant Markdown chunks, and passes them to the model.
2. Hosted tool approach: the app uploads the Markdown files to an OpenAI vector store and gives the model the built-in `file_search` tool.

For MVP, this design uses the custom tool approach because the knowledge base is small and already lives in the repository. The same runtime chat orchestration can later replace the custom retriever with OpenAI `file_search` without changing the frontend.

## 5. Proposed Directory Structure

```text
agent-benben/
  docs/
    technical-design.md

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

## 7. Codex Skill Vs Runtime Orchestration

### Codex Skill

A Codex skill is useful for development and maintenance. It can teach Codex how to work on this specific project, such as:

- How the FitFlow knowledge files are structured
- How to update chatbot prompts
- How to add new knowledge files safely
- How to run acceptance checks
- How to avoid mixing runtime app skills with Codex development skills

Codex skill triggering is handled by Codex. When the user asks for a task that matches the skill description, Codex can load the skill instructions and follow them.

A Codex skill is not available to end users of the deployed web chat UI.

### Runtime Chat Orchestration

Runtime chat orchestration is implemented in app code. It is what the deployed chatbot uses when a frontend user sends a message.

The orchestration owns:

- The assistant's role and tone
- How conversation history is passed to the model
- Which knowledge search tool is available
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
- Determine whether the latest user message needs handoff checks.
- Call `retrieveKnowledge()` or expose `searchKnowledge` as a tool.
- Build the OpenAI request using instructions from `prompt.ts`.
- Return assistant text, source filenames, and `handoffRecommended`.

### Runtime Tool Calling Decision

There are two valid implementation styles.

Option A: pre-retrieve before model call.

```text
User message -> retrieveKnowledge() -> model call with selected context
```

This is simpler and easier to debug. It is the recommended MVP path.

Option B: expose `searchKnowledge` as a function tool.

```text
User message -> model decides to call searchKnowledge -> backend runs tool -> model answers
```

This is closer to an agentic tool workflow. It is useful once we need multi-step reasoning or multiple tools, such as booking lookup, membership lookup, and staff handoff creation.

For the first implementation, use Option A. It gives us deterministic source selection and fewer moving parts.

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
- "HIIT 和 Strength 有什么区别？"
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

### Phase 4: Knowledge Retrieval

- Implement Markdown file loader.
- Implement chunking.
- Implement keyword scoring.
- Add file-level intent weighting.

### Phase 4.5: Chat Orchestration

- Implement `src/lib/chat-orchestrator.ts`.
- Connect prompt, retrieval, handoff rules, and OpenAI call.
- Keep the API route thin.

### Phase 5: Prompt And Safety

- Add customer-service system prompt.
- Add safety and handoff rules.
- Make missing-knowledge behavior explicit.

### Phase 6: Verification

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
