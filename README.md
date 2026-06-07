# Agent Benben

FitFlow fitness studio customer service chatbot.

The app is a Next.js web UI with a backend chat route. The backend calls OpenAI Responses API, lets the model select a runtime skill through tool-use, loads the selected `SKILL.md` plus relevant `knowledge/*.md`, then asks the model to produce the final answer.

## Prerequisites

- Node.js 20 or newer
- npm
- OpenAI API key

## Local Setup

Install dependencies:

```bash
npm install
```

Or use Make:

```bash
make install
```

Create a local environment file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```text
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

## Start Locally

Run the development server:

```bash
npm run dev
```

Or use Make:

```bash
make dev
```

Open:

```text
http://localhost:3000
```

Ask a FitFlow question in the chat UI, for example:

```text
第一次来适合上什么课？
```

## Test The API Directly

With the dev server running, send a request:

```bash
curl -s http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "第一次来适合上什么课？"
      }
    ]
  }'
```

Expected response shape:

```json
{
  "message": {
    "role": "assistant",
    "content": "..."
  },
  "sources": ["beginner-guide.md", "classes.md"],
  "selectedSkill": "fitflow_customer_service",
  "handoffRecommended": false
}
```

## Acceptance Questions

Use these questions to manually test behavior:

- `第一次来适合上什么课？`
- `你们有哪些课程？`
- `HIIT 和 Strength 有什么区别？`
- `怎么预约体验课？`
- `可以 walk-in 吗？`
- `我迟到了还能进教室吗？`
- `取消预约会扣课吗？`
- `会员多少钱？`
- `我膝盖痛还能练吗？`
- `我要找人工客服。`
- `我觉得被乱扣费了。`
- `你们几点营业？`

Expected behavior:

- Normal studio questions should select `fitflow_customer_service`.
- Safety, injury, pregnancy, illness, or pain questions should select `fitflow_safety_boundary`.
- Complaint, refund, payment dispute, or human support questions should select `fitflow_human_handoff`.
- The answer should not invent details that are missing from `knowledge/*.md`.

The chat UI shows sources and debug data under assistant messages so you can confirm which skill was selected.

## Verification Commands

Run lint:

```bash
npm run lint
```

Or:

```bash
make lint
```

Run TypeScript checks:

```bash
npm run typecheck
```

Or:

```bash
make typecheck
```

Run a production build:

```bash
npm run build
```

Or:

```bash
make build
```

Run all verification commands:

```bash
make test
```

## Project Structure

```text
knowledge/                 Business knowledge files
skills/                    Runtime skill files with frontmatter metadata
src/app/api/chat/route.ts  Chat API route
src/lib/chat-orchestrator.ts
                            Two-step OpenAI tool-use orchestration
src/lib/skill-registry.ts  Reads skill metadata
src/lib/skill-loader.ts    Loads selected skill instructions
src/lib/retrieve.ts        Retrieves relevant knowledge chunks
src/components/            Chat UI components
```

## Troubleshooting

If the API returns `OPENAI_API_KEY is not configured.`, check `.env.local` and restart `npm run dev`.

If the model gives an unsupported answer, update the relevant `knowledge/*.md` file or the selected `skills/*/SKILL.md` instructions.

If dependencies change, rerun:

```bash
npm install
```
