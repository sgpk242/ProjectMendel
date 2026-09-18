@AGENTS.md

## User preferences

- Whenever a file is edited, tell the user the entire set of commands they
  need to run before starting the server (e.g. `npm install` if a
  dependency changed, `npm run db:push` / `npm run db:types` if a migration
  changed, etc.) — not just the ones related to that specific edit.
- That command list must always include, in order, whenever Claude pushed
  commits this session:
  1. `git checkout src/lib/types/database.ts` — the user runs
     `npm run db:types` locally against their live Supabase project, which
     rewrites this file to differ from Claude's hand-committed version;
     leaving that local diff in place blocks the next `git pull`. Discard
     it first.
  2. `git pull` — never assume this is implicit or obvious; state it
     explicitly every time, even though it seems basic.
  3. Then the rest of the usual list (`npm install`, `npm run db:push`,
     `npm run db:types`, etc.) as needed for that push's changes.
  4. `npm run dev` to start the server — always state this explicitly as
     the final step, every time, even though it seems basic.
- State the command list as just the commands to run — no note about which
  ones were skipped or why something wasn't needed (e.g. don't add "no
  npm install needed, no new dependencies"). Silence on a command is enough.
- The user develops on a Windows PC (terminal, not Mac). Give shell
  instructions in PowerShell/CMD form, not macOS/Homebrew commands.
