// Early-trend rider for CBBTC/USDC, protocol agent-fun/bars-replay/v1.
//
// Idea: on this market a durable move announces itself early and then
// grinds for hours, while one-minute noise is large (about 8 bps of
// per-minute stdev). A bot that demands a big multi-hour confirmation
// buys after most of the move, and a bot that exits on every one-hour
// wobble pays a ~26 bps round trip each time it is shaken out. So this
// bot enters on the earliest confirmation that two horizons agree, and
// then holds patiently: it only leaves on a deep multi-hour reversal
// or on wide safety rails.
//
//   - Flat -> long when BOTH hold: the 60-minute return is above
//     +0.20% AND the 120-minute return is above +0.30%. Both filters
//     must hold, so a single-minute spike never triggers an entry, but
//     the confirmation arrives within the first hours of a real move.
//     It buys with all of its cash (long only, no leverage).
//   - Long -> flat when the 480-minute (8-hour) return turns below
//     -2.00%: the multi-hour trend itself has reversed, not just an
//     hourly wobble. Or on either safety rail: the position is worth
//     under 97% of its cost (stop-loss), or the close has fallen 3%
//     from the peak since entry after at least 30 bars held (trailing
//     stop, so a position that ran up keeps most of the gain).
//   - No new entries in the final hour of the window: a position
//     opened there would have no time to develop before the forced
//     flatten at the last close.
//
// All decisions are pure functions of past closes and the account the
// harness reports; no clock, no environment, no randomness, so two
// runs on the same data agree byte for byte. A full round trip costs
// about 26 bps (4 bps fee + 2 bps slippage + ~7-10 bps of pool impact
// each way), so the entry filters sit just above the noise while the
// exit waits for moves an order of magnitude larger than that cost.
import { runBars } from "./vendor/makefun-bars.ts";
import type { BarsState, OrderInput } from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";
const MAX_SLIPPAGE_BPS = 10_000;

// Entry: 60-minute return above +0.20% and 120-minute return above +0.30%.
const ENTRY_RET_60 = 0.002;
const ENTRY_RET_120 = 0.003;
// Exit: 480-minute return below -2.00%.
const EXIT_RET_480 = -0.02;
// Safety rails: stop-loss at 97% of cost, trailing stop 3% off the peak.
const STOP_NUM = 97n;
const STOP_DEN = 100n;
const TRAIL_NUM = 97;
const TRAIL_DEN = 100;
const MIN_HOLD_BARS = 30;
// No new entries once 1,380 closes have been seen (final hour of a
// 1,440-bar window).
const LAST_ENTRY_INDEX = 1380;

// Closes seen so far, oldest first, as plain numbers (raw closes are
// ~6.1e9, exactly representable; only ratios are used).
const closes: number[] = [];
// Peak close since the current position was opened, and the index at
// which the buy was decided.
let peakClose = 0;
let entryIndex = -1;
// True between sending a buy and seeing the filled position.
let awaitingFill = false;

function retFrom(nowIndex: number, barsBack: number): number | null {
  if (nowIndex < barsBack) return null;
  const then = closes[nowIndex - barsBack];
  if (then === 0) return null;
  return closes[nowIndex] / then - 1;
}

// Both entry filters must hold at once: the 60-minute return above
// +0.20% and the 120-minute return above +0.30%. Requiring the two
// horizons to agree keeps a single-minute spike from triggering an
// entry, while the confirmation still arrives within the first hours
// of a real move.
function entryConfirmed(nowIndex: number): boolean {
  const r60 = retFrom(nowIndex, 60);
  if (r60 === null || r60 <= ENTRY_RET_60) return false;
  const r120 = retFrom(nowIndex, 120);
  if (r120 === null || r120 <= ENTRY_RET_120) return false;
  return true;
}

function sellAll(state: BarsState): OrderInput[] {
  const held = state.positions.get(SYMBOL);
  if (held === undefined) return [];
  return [
    {
      side: "sell",
      symbol: SYMBOL,
      qty: held.qty,
      max_slippage_bps: MAX_SLIPPAGE_BPS,
    },
  ];
}

await runBars({
  onBatch(state: BarsState, batch): OrderInput[] {
    const fresh = batch.bars.find((b) => b.symbol === SYMBOL);
    if (fresh === undefined) return [];
    closes.push(Number(fresh.c));
    const i = closes.length - 1;
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      awaitingFill = false;
      const closeNow = closes[i];
      if (closeNow > peakClose) peakClose = closeNow;
      const r480 = retFrom(i, 480);
      if (r480 !== null && r480 < EXIT_RET_480) return sellAll(state);
      // Stop-loss: position worth under 97% of its cost (fees included).
      if (state.value(SYMBOL, held.qty) * STOP_DEN < held.cost * STOP_NUM) {
        return sellAll(state);
      }
      // Trailing stop: 3% off the peak since entry, after a minimum hold.
      if (
        i - entryIndex >= MIN_HOLD_BARS &&
        closeNow * TRAIL_DEN < peakClose * TRAIL_NUM
      ) {
        return sellAll(state);
      }
      return [];
    }

    // Flat. Wait out the bar after a buy until the fill shows up.
    if (awaitingFill) return [];
    // No new entries in the final hour of the window.
    if (i >= LAST_ENTRY_INDEX) return [];
    // Both horizons must agree before any cash is committed.
    if (!entryConfirmed(i)) return [];
    if (state.cash <= 0n) return [];
    peakClose = closes[i];
    entryIndex = i;
    awaitingFill = true;
    return [
      {
        side: "buy",
        symbol: SYMBOL,
        notional_quote_units: state.cash,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      },
    ];
  },
});
