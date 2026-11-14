# Flowise Chat-to-Agent — shared project guidance

-   Product: a Vietnamese chat interface collects requirements and builds agents on the existing Flowise Agentflow V2 runtime.
-   Current scope: planning, shared project memory, and local coding harness only. Product implementation has not started. A later explicit user request can expand this scope.
-   Start with `AI-Agent/state/project.json`, then `AI-Agent/context/PROJECT_MAP.md` and the selected task. Read only the relevant section of the master plan. Do not reload the full blueprint or scan the entire repository each session.
-   `AI-Agent/state/project.json` is the canonical progress/handoff record for Codex, Claude Code, Antigravity, and Gemini CLI. Verify its assumptions against the current Git state; it is memory, not proof that code or tests exist.
-   Check `git status --short` before edits. Preserve pre-existing changes. Never run the old `AI-Agent/scripts/sync-ai-config.py` as part of this harness: it resets generated directories.
-   Git: `origin` is the user's fork `https://github.com/tuananh271020k5/Flowise.git`; `upstream` is FlowiseAI/Flowise. Follow `AI-Agent/harness/GIT_WORKFLOW.md`: one reviewed task per commit, include its task ID and checks, stage only that task's changes, and keep state/task docs with the change. Commit/push when requested; do not bundle unrelated existing patches or publish automatically.
-   Do not copy the nested `AI-Agent/.codex`, `.claude`, or `.agents` templates into the repository root. They are inherited templates, not active project configuration.

<!-- CODEGRAPH_START -->

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

-   **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
-   **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output. In Windows PowerShell, use `codegraph.cmd` if the `.ps1` shim is blocked.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.

<!-- CODEGRAPH_END -->

-   Keep retrieval bounded: start with one focused query and 2–4 files. Expand when evidence is missing. Do not re-read source already returned as current; read flagged stale files or uncovered details directly.
-   Docs, config, runtime behavior, and tests may require direct inspection. CodeGraph is not a compiler or a runtime verification tool.
-   Root instructions are the only shared rules source. `CLAUDE.md` and `GEMINI.md` are thin adapters. Detailed docs load on demand.
-   Optional startup pack: `node AI-Agent/harness/harness.mjs context --task AI-Agent/tasks/B-002.md`. It contains state/map/task, so do not also attach those same files in full.
-   Test the actual change with the narrowest meaningful checks. Report commands run, outcomes, and what remains unverified. Never invent build results, token counts, or completion percentages.
-   Write a checkpoint before a long operation, after each completed subtask or meaningful test result, and when handing off. Include the phase/subtask ID in summary, completed vs partial work, changed paths, actual checks, blockers and the exact next action. Use the current revision to avoid overwriting a newer handoff. This is a workflow rule, not an automatic quota-exhaustion hook.
-   After an interrupted session, follow `AI-Agent/harness/HANDOFF.md`: reconcile shared state with live Git diff and relevant logs/processes before resuming; do not assume uncheckpointed edits were tested or finished.
-   Do not place credentials, raw conversations, full logs, or customer documents in shared memory. Local generated packs/logs/usage belong under ignored `AI-Agent/.local/`.
-   Use `pnpm.cmd` on this Windows host. The Flowise runtime requires Node 24; harness utilities work with Node 22+. Do not change system execution policy to run scripts.
