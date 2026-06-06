# FitFlow AI Customer Service Chatbot Technical Design

## 1. Goal

Build a web-based customer service chatbot for a fitness studio.

Users can ask questions in a frontend chat UI. The backend calls an OpenAI model and answers based on the local `knowledge/*.md` files.

The MVP should support:

- Fitness studio introduction
- Class explanations and recommendations
- Beginner guidance
- Membership and pricing questions
- Booking and cancellation policy questions
- Safety boundary handling
- Human handoff handling
- Common FAQ answers

The MVP should not try to build a complex multi-agent runtime. Development may use temporary Codex sub-agents, but the production app should run as a single customer-service assistant with knowledge retrieval.

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
  | read and search local Markdown knowledge
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

The model does not directly read files. The backend retrieves relevant knowledge and includes it in the model instructions/input.

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

## 7. Chat API

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

## 8. Prompt Design

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

## 9. Handoff Logic

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

## 10. Frontend UX

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

## 11. Environment Variables

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

## 12. Development Sub-Agent Usage

Sub-agents are for development only. They are not part of the runtime system.

Recommended development split:

- Frontend worker: chat UI components and page layout
- Backend worker: `/api/chat`, OpenAI SDK integration, request validation
- Knowledge worker: Markdown loading, chunking, retrieval scoring
- Prompt and safety worker: system prompt, handoff rules, safety constraints
- QA worker: acceptance questions and manual test cases

The main agent should integrate the work, resolve conflicts, and run verification.

## 13. Acceptance Test Questions

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

## 14. Implementation Plan

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
- Retrieve relevant knowledge chunks.
- Call OpenAI model.
- Return assistant message, sources, and handoff flag.

### Phase 4: Knowledge Retrieval

- Implement Markdown file loader.
- Implement chunking.
- Implement keyword scoring.
- Add file-level intent weighting.

### Phase 5: Prompt And Safety

- Add customer-service system prompt.
- Add safety and handoff rules.
- Make missing-knowledge behavior explicit.

### Phase 6: Verification

- Run local typecheck and lint.
- Manually test acceptance questions.
- Verify the UI handles loading and errors.

## 15. Future Enhancements

- Streaming responses
- Persistent conversation history
- Admin knowledge editor
- OpenAI Vector Store and `file_search`
- Real booking integration
- Staff handoff inbox
- Analytics for unresolved questions
- Multi-language support
- Evaluation suite for answer grounding
