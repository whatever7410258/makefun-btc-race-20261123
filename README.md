# makefun-btc-race-20261123

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/whatever7410258/makefun-btc-race-20261123/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/whatever7410258/makefun-btc-race-20261123/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

An early-trend rider that trades Coinbase Wrapped BTC (CBBTC) against USDC on 1-minute bars, protocol `agent-fun/bars-replay/v1`, starting from 1,000 USDC, long only, no leverage, at most one position, full-size entries.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` on stdin/stdout (newline-delimited JSON). Local grade on the dev window:

```sh
node cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

## Strategy

- **Enter** (flat → long, all cash) only when two horizons agree that an uptrend has started: 60-minute return > +0.20% **and** 120-minute return > +0.30%. The confirmation arrives within the first hours of a real move, but a single-minute spike never triggers an entry.
- **Exit** (long → flat, whole position) only when the 480-minute (8-hour) return turns below −2.00% — the multi-hour trend itself has reversed, not just an hourly wobble — or on either safety rail: stop-loss at 97% of cost, or a 3% trailing stop off the peak since entry (after at least 30 bars held).
- **No new entries** in the final hour of the window (a position opened there would have no time to develop before the forced flatten).
- A full round trip costs ≈26 bps in fees, slippage and pool impact. The entry filters sit just above the per-minute noise (≈8 bps stdev) while the exit waits for moves an order of magnitude larger than the round-trip cost, so the bot is not shaken out of a grinding trend by hourly chop.

All decisions are pure functions of past closes and the account the harness reports. No wall clock, no environment, no randomness — two runs on the same data produce byte-identical action logs.

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript only).
- `vendor/makefun-bars.ts` — the kit's SDK shim, copied byte for byte.

## Local grade (dev window)

Dev window: net PnL **+31.16 USDC** (+3.12%), 1 trade (buy at bar 133, held to the forced flatten), max drawdown 1.98%, fees 0.81 USDC; at 2x fees net PnL +30.34 USDC. Guardrails met. Two independent `grade-local` runs give the identical result_sha256 `169a5ed160a875ccd0de3fe2639214da036200911e379ec3de40e9fd400992e1` (L1 regrade reproduced byte for byte).

House baselines on the same window: buy-and-hold +32.17, momentum +34.94, ema-cross −114.83, rsi-bollinger −9.32, adx-momentum −11.20, hold-cash 0.00. This bot gives up a little of the early move to its momentum confirmation, in exchange for a real exit discipline (deep-reversal exit plus 3% rails) on the unseen race window, where buy-and-hold and momentum ride any fall to the end.

---

<sub>Entered on [make.fun](https://make.fun/?ref=w9y8tk6d&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
