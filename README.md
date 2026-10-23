# DevX PayPerCall

**Escrowed USDC pay-per-call for AI agents on [Arc](https://arc.io).** Pay $0.01, get a verified answer or an automatic refund.

Live page: https://paypercall.madebydevx.com (placeholder until the Arc Studio app ships) · Service #0: [DevX Token Check](https://tokencheck.madebydevx.com)

> **The shipped contract and app are the ones written by [Arc Studio](https://studio.arc.io).** This repo holds the spec, the acceptance test
> suite, the off-chain agent/fulfiller scripts, and the deploy tooling. Studio's contract lands in `contracts/src/` and its Vite app in `app/`
> once the Studio build is pulled. We wrote the spec and tests; Arc Studio writes, tests, audits and testnet-deploys the contract and builds the app.

## How it works
1. **Escrow.** An agent locks the exact price of one call: `requestCall(serviceId, "base:0xTOKEN", referrer, maxPrice)` (approve), or gaslessly via
   `requestCallWithAuthorization(...)` with an EIP-3009 `receiveWithAuthorization` signature. The nonce commits to service, request, referrer, payer and
   price, so a relayer can't re-point the payment.
2. **Verdict.** The provider's bot (`agent/fulfiller.mjs`) answers off-chain and calls `fulfill(callId, keccak256(body), resultURI)`.
3. **Split or refund.** USDC splits provider / referrer (service-set bps, 10% for Token Check). `reject` refunds instantly, and after the deadline anyone can
   `refundExpired`. Ownerless, non-upgradeable, no protocol fee.

## Repo map
| Path | |
|---|---|
| `studio/SPEC.md`, `studio/prompt1-4*.txt`, `studio/run_studio.sh` | What we hand Arc Studio (spec + 4 turns), driven via `@circle-fin/arc-studio-cli` |
| `contracts/test/` | 18 Foundry tests + EIP-3009 MockUSDC (fuzz escrow conservation, split, refund paths, replay/re-pointing, blocklist recovery) |
| `contracts/script/Deploy.s.sol`, `scripts/deploy.sh` | Deploy + register service #0 (`fork` / `testnet` / `mainnet`, mainnet gated by an explicit confirm env) |
| `agent/` | `pay.mjs` (demo AI agent payer), `fulfiller.mjs` (provider bot), `fund_agent.mjs`, `bridge_base_to_arc.mjs` (CCTP V2 + Forwarding Service) |
| `app/` | Placeholder page; replaced by the Arc Studio app |
| `docs/` | Project rationale and demo plan |

## Arc details we rely on
Chain 5042 (mainnet) / 5042002 (testnet). USDC ERC-20 interface `0x3600000000000000000000000000000000000000` (6 decimals; native gas balance is
18 decimals). 20 gwei fee floor; `eth_getLogs` ≤ 10k blocks; sends to `address(0)` revert. Tooling: Arc Foundry (`arc-forge`, `arc-anvil --network arc`).

## Run
```bash
cd agent && npm ci
scripts/rehearse_fork.sh          # free end-to-end on an arc-anvil fork of Arc testnet
```
Keys are read from a local secrets file outside the repo and are never committed or printed.

Made by DevX · MIT
