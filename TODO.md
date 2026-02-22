# TODO

## `/apply` — Discord Modal Application Command

**Status:** Removed (was implemented, then pulled back)

**Why removed:** Discord modals are capped at 5 text inputs, which isn't enough to match the full per-track question sets needed (Tester, Builder, CMD each have different question requirements). Google Forms remains the primary application path.

**What was built:**
- `/apply track:<autocomplete>` slash command opened a modal
- 4 hardcoded questions: In-Game Name, Why do you want to join, Relevant experience, Anything else
- Discord username/ID auto-filled from `interaction.user` (no question needed)
- Submitted responses enqueued as a `post_application` job (`rowIndex: -1` sentinel) into the existing polling pipeline — same vote/approve/deny flow as Google Form applications

**What needs to happen before re-implementing:**
1. Decide on per-track question sets (4–5 questions each, within Discord's 5-input limit)
2. Optionally: runtime-configurable questions via `/settings apply-questions track:<track>` — would open a meta-modal to set question labels, short vs. paragraph style, and required/optional per slot, stored in `.bot-state.json`
3. Consider whether a separate channel or hosted form is a better fit if question count exceeds 5

**Core implementation notes (for when this is revisited):**
- `enqueueModalApplication()` in `src/index.js` was the helper that built and enqueued the job
- `buildApplyModal(trackKey, trackLabel)` in `src/lib/interactionCommandHandler.js` built the modal
- `APPLY_MODAL_PREFIX = "apply_modal"` was the modal custom ID prefix
- Modal submission handled in the `interaction.isModalSubmit()` block
- All wiring through `createInteractionCommandHandler` via `enqueueModalApplication` injected dep
