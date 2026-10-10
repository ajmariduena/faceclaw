# Paseo home card — Astra

Recommend **Decision**: first answer whether I need to intervene, then show the actual question, then background counts.
Two layouts rendered: Decision (semantic headline) and Ledger (three stable count rows).
Ledger is easier to compare numerically but makes the wearer interpret zeros and counts; Decision answers the brief faster.

## Hierarchy and states
- Frame and stock left column retained; 20 px stock type, 27 px pitch, white primary text, secondary gray 136.
- Dim “Paseo” → white “1 needs you” → dim Spanish agent title → white pending question → dim working/done counts.
- Needs: one pending agent, two working, three done; the real pending question takes two rows.
- Working: “No action needed”, “2 working”, short Spanish titles, zero completions in the last hour.
- Quiet: “All clear”, “3 done in last hour”, one latest Spanish result, “Nothing running”.
- Offline: “Mac unreachable”, “Status unknown”, actual last-seen age. Hide counts; left count becomes a dash, not zero.
- Not paired: replace body with “Not paired”; connecting: “Connecting”, “Status unknown”; never imply all clear.
- No extra panel icons, gesture hints, terminal prompts, or decorative rules. Preserve the calm home-card frame.
- Large: Roboto 26 px / 34 px pitch; remove secondary titles/results before removing the question or counts.
- In these fixtures the full pending question fits at both sizes; longer text uses measured wrapping and a visible ellipsis.

## Interaction and semantics
- A tap with exactly one attention item opens that agent on its host, with the pending question visible.
- Multiple attention items open the attention list; no attention opens the working list, or recent completions when quiet.
- Offline opens Paseo connection status; unpaired opens pairing. Opening a question never approves it.
- Attention = needs + failed + review. Keep the three source buckets distinct in the snapshot.
- For mixed attention use “N need attention”; detail priority needs → failed → review, then oldest unresolved item.
- A failure says “N failed”; review-only says “N ready to review”. Neither can produce “All clear”.
- Done means current done-bucket agents completed within a rolling hour, not all historical conversations.
- Needs fixture footer abbreviates this same rolling-hour done count; detail screen must make its window explicit.
- Quiet with no recent completion says “All clear” / “Nothing running”; do not invent a success result.

## Snapshot additions (proposal only)
- Add failed, review, doneLastHour, completedAtMs, snapshotAtMs, lastConnectedAtMs and explicit connection enum.
- Retain needs/working; add selectedAttention {hostId, agentId, title, bucket, line, activityMs}.
- Add bounded workingTitles and latestCompletion; select from all agents, not today's two-update slice.
- Derive completion time from a bucket transition, not arbitrary last message activity; recount when the hour expires.
- Add hostId/hostLabel and per-host reachability for multiple hosts; identity is (hostId, agentId).
- Aggregate healthy-host counts, but show “1 host unreachable” ahead of a reassuring clear state when coverage is partial.
- For multi-host attention, replace the secondary title line with host + abbreviated title; large mode resolves host in detail.
- The UI labels are English; original agent titles/questions/results retain their language.

## Evidence and risks
- Ran `cd tools/headless-render && node paseo-card-astra.cjs`; 16 renders passed measured bounds/row-collision checks.
- Inspected every state in the contact sheet: no clipping/overlap; all PNGs use the 640×480 canvas and 576×288 band.
- Renderer reuses production GrayImage, stock-font.cjs, stock clock art and Lucide rasterization; output quantizes to 16 grays.
- Headless mock validation only: physical-lens brightness/readability and actual ring navigation remain untested.
- Risks: long questions lose qualifiers; stale hosts can falsely reassure; completion time needs reliable transitions.
- Counts are deterministic; this design does not ask an LLM to infer progress or whether user action is needed.
- No app-code changes, integration, deployment, or commit.

## PNGs (relative to repository root)
- `tools/headless-render/out/paseo-card-astra-decision-needs-{20,26}.png`
- `tools/headless-render/out/paseo-card-astra-decision-working-{20,26}.png`
- `tools/headless-render/out/paseo-card-astra-decision-quiet-{20,26}.png`
- `tools/headless-render/out/paseo-card-astra-decision-offline-{20,26}.png`
- `tools/headless-render/out/paseo-card-astra-ledger-needs-{20,26}.png`
- `tools/headless-render/out/paseo-card-astra-ledger-working-{20,26}.png`
- `tools/headless-render/out/paseo-card-astra-ledger-quiet-{20,26}.png`
- `tools/headless-render/out/paseo-card-astra-ledger-offline-{20,26}.png`
- `tools/headless-render/out/paseo-card-astra-sheet.png` (columns: needs, working, quiet, offline; rows: Decision 20/26, Ledger 20/26).
