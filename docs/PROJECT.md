# Pick: DevX PayPerCall: escrowed USDC pay-per-call for AI agents on Arc

**One line:** an AI agent escrows $0.01 USDC for one API call. The provider's bot answers and settles onchain with a hash of the exact answer,
and the payment splits 90% provider / 10% referrer. If the call is rejected or the deadline passes, the agent gets a full refund. Service #0 is
our live product, DevX Token Check (token safety verdicts, tokencheck.madebydevx.com).

## Why this one
- **Reuses what we already run:** the Token Check API (already x402/USDC on Base), our x402 + EIP-3009 know-how, and the DevX brand and GitHub.
  The fulfiller calls the live API, so the demo produces real answers, not mock data.
- **Hits all three suggested themes in one product:** escrow + conditional payout, payment splitting, and software-to-software (agent→API) payments.
- **Small and testable:** one ~230-line ownerless contract, no oracles or tokens. A reference implementation and 18 Foundry tests are written
  and passing, and a full end-to-end rehearsal passed on an Arc-testnet fork (including the gasless EIP-3009 path and a refund).
- **Buildable in ~1 day of wall-clock time,** most of it Arc Studio compute plus Muhammad's ~1 h of clicks.

## Expected scoring (weights from the rules)
| Criterion | Weight | How we score |
|---|---|---|
| Real USDC on mainnet, addresses + hashes | 30% | Deploy + register + **≥3 real paid calls** (2 fulfilled with a 90/10 split, 1 refunded), plus 1 call made from the app UI. Every tx is listed with explorer.arc.io links in the README and submission. Several distinct USDC flows (escrow in, split out, refund), not a single transfer. |
| Use of Arc Studio across contracts, tests, app | 25% | Studio writes the contract from our spec, writes its own tests and passes our reference suite, runs the "max preset" audit, deploys to testnet, and builds the whole Vite app. GitHub push from Studio. The video shows the Studio session. |
| Working product | 25% | Live app: connect wallet → pay → live status → verdict with an onchain hash check → receipt. A real off-chain fulfiller settles within seconds. |
| Potential | 20% | A generic marketplace: any API registers a service with its own price, timeout and referral split. It's the escrowed counterpart to x402 (x402 pays up front with no recourse; PayPerCall refunds on failure). Natural next steps: ERC-8004 reputation from fulfill/refund history, Circle Gateway nanopayments, batch settlement. |

## Risks
- Studio produces a contract that deviates from the spec → `run_studio.sh verify` runs our 18 tests against it; iterate in Studio until they pass.
- Studio free-tier limits (unknown) → keep prompts small; the 4 turns are planned.
- The rule "built outside Arc Studio" → our reference contract is **not** uploaded to Studio (only SPEC.md + tests + mock). The shipped contract
  and app come from Studio. We say openly that the spec and tests came from our agent.
