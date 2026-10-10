# Paseo home card: summary instead of a feed (fable, 10 Oct 2026)

Render: `cd tools/headless-render && node paseo-card-fable.cjs`. Three layouts × four states, stock font 20 px / 27 px pitch, plus Large text (Roboto 26 / 34) checks. No app code touched.

## Recommendation: **Verdict** (`out/paseo-card-fable-verdict-*.png`)

One white sentence answers "do I need to go in?", then the one agent that justifies it, then a dim ledger of the rest.

```
Paseo
1 needs you                      ← white: the verdict
Fix reconnect after BLE drop     ← dim: which agent
¿Apruebas correr los tests de    ← white: what it wants (≤ 2 lines)
BLE?
                                 (blank)
2 working · 3 done               ← dim: the ledger, always on the last row
```

Why this one. The question the user asks is binary, and the card's only job is to answer it before the eye has to read anything else. A verdict line does that; a list makes the eye count rows. The verdict is also the thing that changes between states, so the card looks different at a glance when something happened, while the frame and the ledger row stay put. It is the calmest of the three on a 20 px monochrome HUD, degrades to Large text with nothing lost (`verdict-a-large.png`), and the existing precomputed summary line keeps its place: it is the body.

Hierarchy, in the order the eye hits it: verdict (white, row 1) → body (white, rows 3–4) → agent title (dim, row 2) → ledger (dim, last row). Only two whites, both saying "this".

| State | Verdict | Body | Ledger |
|---|---|---|---|
| (a) 1 needs, 2 working, 3 done | `1 needs you` | title + its pending question | `2 working · 3 done` |
| (b) nothing needs, 2 working | `Nothing needs you` | newest working agent + its latest line | `2 working · 1 done` |
| (c) all done in the last hour | `All done` | newest finished agent + its last line | `4 finished · last 12 min` |
| (d) Mac unreachable | `Mac unreachable` | `Last seen 29 min ago` (dim) | `Was: 1 needs you · 2 working` (dim, last good snapshot) |

Verdict precedence: needs → failed (`1 failed`) → review (`1 to review`) → working (`Nothing needs you`) → done (`All done`) → `No agents`. The ledger lists every non-empty bucket except the one the verdict already named, in bucket order.

**Tap.** With a verdict of needs/failed/review, tap opens Paseo straight into the chat of the agent shown (the body is its question, so the next tap is dictating the answer). Otherwise tap opens the Paseo list as today. The card never scrolls; scroll keeps moving between cards.

## Alternatives rendered

- **Roster** (`roster-*.png`): one row per live agent behind a rail mark (`>` needs, hollow box working, filled box done), the `>` row followed by its question, done folded into `■ 3 done · last 12 min`. With no urgent agent, a `Nothing needs you` / `All done` row leads. It names what is working, which Verdict only counts, and is the better fit if agents multiply (5 rows ≈ 5 agents). Costs: titles truncate at ~22 chars once an age is appended, and Large text drops the question to one line and the second working agent (`roster-a-large.png`).
- **Ledger** (`ledger-*.png`): `Needs you  1 / Working  2 / Done  3` with the count right-aligned and the newest agent of each bucket beneath. Reads like a dashboard, but the counts become the hero and the question gets one truncated line; in Large text the done agent falls off. Not recommended.

## What the snapshot must add (`paseo-glance.ts`)

- `counts: Record<Bucket, number>` for all five buckets (today only `needs` and `working`).
- `updates` extended to the lead agent of every non-empty bucket, not just the top two by recency, so (c) can show the newest finished agent and Roster can list working ones. 5–6 entries, same shape.
- `lastSeenMs` (daemon time of the last good snapshot) and the last good `counts`, kept by the worker across a disconnect, for state (d).
- The Spanish/English `status` strings stay; the card prints `Mac unreachable` itself.

## Several hosts

Verdict aggregates: counts sum across hosts, the lead agent is the most urgent anywhere, and its title row gets a dim host suffix (`Fix reconnect after BLE drop · mini`) only when more than one host is paired. State (d) becomes per host: the verdict says `mini unreachable` only when no host answers; a single dead host shows up as a dim `mini unreachable` ledger item while the live hosts keep the card. The snapshot then needs `host` per update and `hosts: {name, reachable, lastSeenMs}[]`.

## Risks

- A verdict is a claim; a stale snapshot makes it a wrong claim. The ledger must flip to `Last seen …` the moment the worker misses a heartbeat, not when the socket finally errors.
- `review` (finished, wants a look) competes with `needs`. The precedence above makes needs win; if the user treats review as equally urgent, the verdict becomes `1 needs you · 1 to review` and loses the blank row.
- Summaries over ~70 chars wrap past two lines; the second line ends with `…`. The daemon already caps at 100, a 70-char cap for the glance line would avoid most ellipses.
- The hollow-box mark (Roster) reads faint at 9 px; if that layout is chosen, use 11 px or a 2 px stroke.

## Files

`tools/headless-render/paseo-card-fable.cjs`, `research/paseo-card-fable.md`, and in `tools/headless-render/out/`: `paseo-card-fable-{verdict,ledger,roster}-{a,b,c,d}.png`, `paseo-card-fable-{verdict,ledger}-a-large.png`, `paseo-card-fable-roster-{a,b,c,d}-large.png`.
