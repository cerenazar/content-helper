# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Local Mac editor for the @cerenbuilds Instagram account: split-format reels and carousels, with a Claude Code side panel that edits the same project. The UI and all user-facing text are in Turkish; keep new UI copy, errors, and comments in Turkish to match.

## Commands

```sh
npm install
npm run dev            # server (127.0.0.1:4318, tsx watch) + web (Vite, 127.0.0.1:5180)
npm test               # vitest unit tests (packages/*/test/*.test.ts)
npx vitest run packages/renderer/test/timing.test.ts -t "formülü"   # single file / single test
npm run typecheck      # tsc -p tsconfig.json (whole monorepo, noEmit)

# Need a running server (and web for test:browser):
CB_ROOT=/tmp/cb-test CB_WEB=http://127.0.0.1:5180 npm run test:browser   # apps/web/e2e/editor.e2e.mjs
npm run test:parity    # pixel parity vs. the skill's original scene.html (reads ./cerenbuilds-split-reel.skill)
```

Env: `CB_ROOT` (projects dir, default `~/cerenbuilds/projects`), `CB_PORT` (server port; Vite proxy reads it too). Use a throwaway `CB_ROOT` for tests so real projects are untouched. System deps: ffmpeg/ffprobe, Google Chrome (export launches it via playwright-core `channel: 'chrome'`), logged-in `claude` CLI.

## Architecture

npm workspaces: `packages/schema` (zod), `packages/renderer` (canvas drawing), `apps/server` (Fastify), `apps/web` (React + zustand). Packages are consumed as TS source (`main: src/index.ts`), with no build step.

**The project folder is the single source of truth.** Each project lives at `$CB_ROOT/<slug>/` with `project.json` (validated by `packages/schema`), `scenes.js`, `.history/` snapshots, `.editor/` (Claude session id + chat log), `cache/` (proxies, keyframe sheets, waveforms, export work dir), `exports/`. Source videos are referenced by absolute path, never copied. Caption `start`/`end` are never stored; they are always derived from order + `timing.ts`.

**Preview and export share one renderer.** `packages/renderer` is a port of the `scene.html` in `cerenbuilds-split-reel.skill`. The web preview calls it live; export runs the *same* code in headless Chrome (server bundles `apps/server/src/render-entry.ts` with esbuild and serves it at `/render/index.html`), writes transparent PNG overlays, and ffmpeg composes them over the bottom-half cuts. Any visual change must go in the renderer, not in the preview or export separately. `scenes.js` is a function *body* compiled with `new Function('h', code)`; it receives the kit helpers as `h` and must `return [scene1, scene2, ...]`.

**Design system is fixed by the skill.** Colors, fonts (bundled in `packages/renderer/fonts/`), caption pill style, header, sprites, timing formula, and 4K crop values come from `cerenbuilds-split-reel.skill` and must not drift. Unit tests pin the timing formula to the Python original, and `test:parity` pins rendering. Two deliberate deviations from the skill: each scene is wrapped in `save/restore` (the original leaked `globalAlpha`), and the first caption shows fully on frame 0 (hook rule).

**Edit flow and sync.**
- Web store (`apps/web/src/store.ts`) owns the in-memory document plus undo/redo. Edits are debounced into `PUT /api/projects/:slug`. A `key` argument coalesces drags into one undo step.
- Server watches project files (chokidar). Writes it made itself are ignored by content hash. External changes are schema-validated and pushed over SSE (`/api/projects/:slug/events`) as `project-changed`; invalid ones become `project-invalid` and are not applied.
- Call `useStore.getState().flush()` before any server operation that reads the project from disk (adding clips → proxy/sheet, export).

**Claude panel** (`apps/server/src/claude.ts`):
- Each turn spawns `claude -p --output-format stream-json --verbose --resume <id>` in the project folder, with a restricted `--allowedTools`.
- Before a turn it snapshots to `.history/`. During the turn file events are suppressed (`quiet`) and manual saves get 409. After the turn it validates once and auto-restores the snapshot if Claude left an invalid project.
- `apps/server/templates/CLAUDE.md` is copied into every project folder as the panel-Claude's instructions (schema, `scenes.js` contract, format rules). It is a product file, distinct from this one. Update it whenever the schema or kit helpers change.

**Media.** Proxies are 720p H.264 with dense keyframes for scrubbing. The preview draws the active cut's proxy into the bottom half of the same canvas using `cropRect()`, the same crop math as the export's ffmpeg filter. Keyframe sheets use `-skip_frame nokey -fps_mode passthrough` + `showinfo`, mapped by frame number `n`, because log order and pts order can differ.

## Conventions

- UI shell tokens live in `apps/web/src/styles.css`: dark neutral chrome, sky = selection/playhead, orange reserved for Claude-related UI. Keep WCAG AA contrast, visible focus, keyboard access, and `prefers-reduced-motion`.
- Planned next phases (not yet built) are in README: idea notes and inspiration links, Whisper caption alignment, SFX track.
