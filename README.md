# DevX PayPerCall

**Demo video:** [paypercall_demo.mp4](https://github.com/devx-agent/devx-paypercall/releases/download/v1.0-demo/paypercall_demo.mp4) (Arc mainnet demo, [release v1.0-demo](https://github.com/devx-agent/devx-paypercall/releases/tag/v1.0-demo))

**Escrowed USDC pay-per-call for AI agents on [Arc](https://arc.io).** Pay $0.01, get a verified answer or an automatic refund.

**Live app:** https://paypercall.madebydevx.com · **Arc Studio project:** https://studio.arc.io/app/e0f3376e-8287-4dba-bda9-9f13ef987c29 · Service #0: [DevX Token Check](https://tokencheck.madebydevx.com)

## Live on Arc mainnet
| | |
|---|---|
| PayPerCall contract (chain 5042) | [`0x21b9fad1c5eac36c687479d6bc8c8b088cbae9d1`](https://explorer.arc.io/address/0x21b9fad1c5eac36c687479d6bc8c8b088cbae9d1) |
| Deploy tx | [`0x2f2abd83…70ba53`](https://explorer.arc.io/tx/0x2f2abd83c346c0499b6a44d605d8701ab2f1eeda4e3ddb8310cb45359970ba53) (block 27529228) |
| Register service #0 (DevX Token Check, $0.01, 10% referrer) | [`0xbaa744f1…c94e6`](https://explorer.arc.io/tx/0xbaa744f14261c3d3d17cb761ad8961bb95e1945c8a9d55e03decdd64522c94e6) |
| First paid call #0: agent escrows $0.01 | [`0x733de8b2…ab705d`](https://explorer.arc.io/tx/0x733de8b23a826f4a759e540c5052d82451d879c4d897b6aa7fc1cd1372ab705d) |
| Bot settles call #0 (verdict hash on-chain, 0.009 provider / 0.001 referrer) | [`0x6b2b1aa5…f79bfc`](https://explorer.arc.io/tx/0x6b2b1aa5f77ba1d0aa6ee89bba5d2d40379900832896285c86be6bbacdf79bfc) |
| Testnet deployment (by Arc Studio, chain 5042002) | [`0x9351a733…c217bd`](https://explorer.testnet.arc.io/address/0x9351a7332944a24e1e179cf7a891a89d67c217bd) |

**Testnet end-to-end (Arc testnet, Studio's own deployment 0x9351…c217bd), 2026-10-24:**
- register https://explorer.testnet.arc.io/tx/0x0eb958eb26e06c2aa38ed5fe94a189ad5d793d7639983b13f7da98b44f1cc170
- approve pay https://explorer.testnet.arc.io/tx/0x177056f3aeeb5ebf2c2e8f76430070d6de9cf48b370c45ef99eb52b728d23f3c → settle https://explorer.testnet.arc.io/tx/0x34797c241b3588396b587b07559a267193b4b1d4f54d45e2d28e6e4d05285f8f
- gasless EIP-3009 pay https://explorer.testnet.arc.io/tx/0x86e81c41a0d7956c6e314ae743aff391f6e11b1aafb3436b87d45f3251673343 → settle https://explorer.testnet.arc.io/tx/0x44c5c5dd548bfb62296e56c4746e266e05fc84803398669ac37ce16258229dd6
- bad token → reject refund https://explorer.testnet.arc.io/tx/0x753931225f405146b8ccaae118d943a775a33e73a8b86a3ee423a342f3388920
- missed deadline → refundExpired https://explorer.testnet.arc.io/tx/0xd8d7a6a18550a35d8884a2d6f8949af694eaa62e1a7c5b1854c0b8c968a6f37f


The verdict body for call #0 is in [`receipts/mainnet/call-0.json`](receipts/mainnet/call-0.json): `keccak256` of that file equals the
`resultHash` stored on-chain (`0x6c734793…5bed68`). The full flow (register, approve and EIP-3009 pays, settle with the 90/10 split, reject refund, `refundExpired` after the deadline) also ran
on Arc testnet (above) and on an `arc-anvil` fork of Arc mainnet with the same contract.

> **The shipped contract and app were written by [Arc Studio](https://studio.arc.io).** `contracts/src/PayPerCall.sol` is Studio's contract,
> byte-for-byte the source Studio wrote, audited and deployed to testnet, and it is the source deployed on mainnet (compiled with Studio's settings: solc 0.8.30,
> via-IR, 200 runs, cancun; the runtime bytecode matches Studio's build, metadata hash aside). `app/` is Studio's full project (React/Vite app, its
> own contract copy, 33 tests and Create2 scripts). We wrote the spec, the prompts, the 18 acceptance tests (they pass against Studio's contract), and
> the off-chain agent/fulfiller and deploy tooling.

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
| `contracts/src/PayPerCall.sol` | The deployed contract (written by Arc Studio) |
| `contracts/test/` | 18 Foundry tests + EIP-3009 MockUSDC (fuzz escrow conservation, split, refund paths, replay/re-pointing, blocklist recovery) |
| `contracts/script/Deploy.s.sol`, `scripts/deploy.sh` | Deploy + register service #0 (`fork` / `mainfork` / `testnet` / `mainnet`, mainnet gated by an explicit confirm env) |
| `agent/` | `pay.mjs` (demo AI agent payer), `fulfiller.mjs` (provider bot), `fund_agent.mjs`, `bridge_base_to_arc.mjs` (CCTP V2 + Forwarding Service) |
| `app/` | Arc Studio's project: the live React/Vite app (`app/src`) plus Studio's contract tests. Our only edits: the mainnet address and deploy blocks in `src/config.ts`, Arc Mainnet as the default chain, and log scans chunked from the deploy block (`src/lib/logs.ts`) |
| `deployments/`, `receipts/mainnet/` | Mainnet deployment record and the verdict body of paid call #0 |
| `scripts/make_app_deploy.py` | Packs `app/dist` into the Cloudflare Worker serving paypercall.madebydevx.com |
| `docs/` | Project rationale and demo plan |

## Arc details we rely on
Chain 5042 (mainnet) / 5042002 (testnet). USDC ERC-20 interface `0x3600000000000000000000000000000000000000` (6 decimals; native gas balance is
18 decimals). 20 gwei fee floor; `eth_getLogs` ≤ 10k blocks; sends to `address(0)` revert. Tooling: Arc Foundry (`arc-forge`, `arc-anvil --network arc`).

## Run
```bash
cd agent && npm ci
scripts/rehearse_fork.sh          # free end-to-end on an arc-anvil fork of Arc testnet
scripts/deploy.sh mainfork        # same contract on a local fork of Arc mainnet
cd app && npm install --legacy-peer-deps --ignore-scripts && npx vite build   # the app (Studio uses bun)
```
Keys are read from a local secrets file outside the repo and are never committed or printed.

Made by DevX · MIT
