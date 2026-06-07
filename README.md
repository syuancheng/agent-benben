# Tempo Fitness Chatbot

Tempo Fitness customer service chatbot.

The app is a Next.js web UI with backend chat routes. The backend calls OpenAI Responses API, lets the model select a runtime skill through tool-use, loads the selected `SKILL.md` plus relevant `knowledge/*.md`, then streams the final answer back to the UI.

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

Ask a Tempo Fitness question in the chat UI, for example:

```text
第一次来适合上什么课？
```

## Test The Streaming API Directly

With the dev server running, send a request:

```bash
curl -N http://localhost:3000/api/chat/stream \
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

Expected Server-Sent Events shape:

```text
event: meta
data: {"sources":["beginner-guide.md","classes.md"],"selectedSkill":"tempo_customer_service","handoffRecommended":false}

event: delta
data: {"delta":"..."}

event: done
data: {}
```

The older non-streaming endpoint remains available at `POST /api/chat`.

## Acceptance Questions

Use these questions to manually test behavior:

- `第一次来适合上什么课？`
- `你们有哪些课程？`
- `HIIT 和瑜伽课有什么区别？`
- `怎么预约体验课？`
- `可以 walk-in 吗？`
- `我迟到了还能进教室吗？`
- `取消预约会扣课吗？`
- `会员多少钱？`
- `我膝盖痛还能练吗？`
- `我要找人工客服。`
- `我觉得被乱扣费了。`
- `你们几点营业？`
- `I want to participate in the night run next Tuesday. How can I sign up?`
- `My name is Alex, my email is test@example.com, 7'00 pace`

Expected behavior:

- Normal studio questions should select `tempo_customer_service`.
- Safety, injury, pregnancy, illness, or pain questions should select `tempo_safety_boundary`.
- Complaint, refund, payment dispute, or human support questions should select `tempo_human_handoff`.
- The answer should not invent details that are missing from `knowledge/*.md`.
- Signup requests should ask for name and email if they are not provided.
- Night Run signup should also ask for a pace group.
- After required details are provided, the prototype should return a booking summary with a booking code and say a confirmation email has been sent.

The chat UI only shows the conversation. Sources and selected skill metadata remain available in API/SSE responses for backend debugging.

## Signup Prototype

The app includes a deterministic signup shortcut before the LLM call.

Supported classes:

- Night Run
- Cycling class
- Yoga class
- HIIT class

Night Run fixed sessions:

- Tuesday 19:00, Marina Bay, meet at Red Dot Design Museum
- Thursday 19:00, Marina Bay, meet at Red Dot Design Museum
- Saturday 07:00, East Coast, meet at Parkland Green

For signup, the chatbot asks for the user's name and email address. Night Run also requires a pace group.

Supported Night Run pace groups:

- 7'30"
- 7'00"
- 6'30"
- 6'00"
- 5'50"
- 5'30"

In this MVP, confirmation email sending is simulated: after the user provides the required details, the chatbot returns a booking code and tells the user that signup is completed and a confirmation email has been sent.

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
