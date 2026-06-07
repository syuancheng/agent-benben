# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js App Router project for the Tempo Fitness customer service chatbot. App routes and pages live in `src/app/`, including chat endpoints under `src/app/api/chat/`. Reusable React UI components are in `src/components/`. Core backend logic is in `src/lib/`, including OpenAI setup, chat orchestration, skill loading, booking shortcuts, and knowledge retrieval.

Runtime chatbot instructions live in `skills/*/SKILL.md`. Business source material lives in `knowledge/*.md`; keep answers grounded there and update `knowledge/index.md` when adding new knowledge files. Architecture notes are in `docs/technical-design.md`.

## Build, Test, and Development Commands

- `npm install` or `make install`: install dependencies.
- `npm run dev` or `make dev`: start the local dev server at `http://localhost:3000`.
- `npm run lint` or `make lint`: run ESLint with Next.js and TypeScript rules.
- `npm run typecheck` or `make typecheck`: run `tsc --noEmit`.
- `npm run build` or `make build`: create a production build.
- `make test`: run lint, typecheck, and build as the current full verification suite.

Use `.env.local` for local configuration. Required: `OPENAI_API_KEY`. Optional: `OPENAI_MODEL`.

## Coding Style & Naming Conventions

Use TypeScript throughout app code. Follow the existing style: two-space indentation, double quotes, named exports for shared functions/components, and explicit types for public data shapes. React components use PascalCase filenames such as `ChatWindow.tsx`; library modules use lowercase kebab or descriptive names such as `chat-orchestrator.ts`.

Keep orchestration code deterministic where possible. Do not let the model read arbitrary files; expose controlled helpers such as `read_knowledge_file`.

## Testing Guidelines

There is no dedicated unit test framework in this repository yet. Treat `make test` as the required pre-PR verification. For behavior changes, manually test the chat UI and streaming endpoint with representative prompts from `README.md`, especially skill routing, safety boundary, human handoff, and booking/signup flows.

## Commit & Pull Request Guidelines

Recent commit history uses short, imperative summaries such as `Add streaming chat responses` and `Refine beginner and night run guidance`; keep messages concise and focused. Avoid bundling unrelated UI, orchestration, and knowledge edits.

Pull requests should include a brief change summary, verification commands run, and any manual chat prompts tested. Include screenshots for visible UI changes and note updates to `knowledge/` or `skills/` because they affect chatbot behavior.
