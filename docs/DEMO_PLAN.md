# Demo page + video plan

## App (built by Arc Studio from studio/prompt3_app.txt)
Single page, "DevX PayPerCall · Made by DevX":
1. Network pill (Arc mainnet / testnet), connect wallet (adds chain 5042 automatically), USDC balance.
2. Service card #0 read live from `getService(0)`: DevX Token Check · 0.01 USDC · 10 min timeout · 10% referrer.
3. Form: chain + token address → **Pay 0.01 USDC & check** (approve exact amount if needed → `requestCall`).
4. Live status: Open (countdown) → Fulfilled (grade + summary from the API, "hash matches onchain ✓") or Refunded.
5. Receipt: request tx, settle tx, provider/referrer amounts, explorer links.
6. Recent calls table (logs, ≤9,999-block chunks).
No backend. Config `src/config.ts` gets the mainnet address after deploy.

## Hosting (needs Muhammad's OK, pick one)
- A. Cloudflare Pages on his account → `paypercall.madebydevx.com` (best brand fit; `wrangler pages deploy dist`).
- B. GitHub Pages on `devx-agent/devx-paypercall` (free; `https://devx-agent.github.io/devx-paypercall/`).
- ⚠️ The Studio preview URL might also be public, but may be ephemeral (unverified). Don't rely on it as the "live link".

## Fulfiller (settles calls)
`agent/fulfiller.mjs --net mainnet` (poll every 4 s). For the demo window it runs on the box (`nohup … &`).
Optional later: a Cloudflare cron Worker with the ops key as a Worker secret (needs Cloudflare approval).

## Mainnet demo transactions (≈0.1 USDC total)
1. deploy + registerService (scripts/deploy.sh mainnet)
2. `fund_agent.mjs --amount 0.2` (ops → demo agent)
3. `pay.mjs --mode approve` (USDC token on Base) → fulfilled, split 0.009 / 0.001
4. `pay.mjs --mode auth` (gasless EIP-3009, relayed by ops) → fulfilled
5. `pay.mjs` with a bad token → rejected → refund
6. One call from the app UI with Muhammad's MetaMask (or the agent) → fulfilled. **This is "through your contract and app".**

## Live (2026-10-24)
- App: https://paypercall.madebydevx.com (Studio's app on the existing Cloudflare Worker; defaults to Arc Mainnet; Recent Calls shows call #0)
- Contract: https://explorer.arc.io/address/0x21b9fad1c5eac36c687479d6bc8c8b088cbae9d1
- Paid call #0, escrow: https://explorer.arc.io/tx/0x733de8b23a826f4a759e540c5052d82451d879c4d897b6aa7fc1cd1372ab705d
- Paid call #0, settle (0.009 / 0.001 split): https://explorer.arc.io/tx/0x6b2b1aa5f77ba1d0aa6ee89bba5d2d40379900832896285c86be6bbacdf79bfc
- Studio project: https://studio.arc.io/app/e0f3376e-8287-4dba-bda9-9f13ef987c29
- Repo: https://github.com/devx-agent/devx-paypercall
Mainnet txs done: steps 1 and 3 above, plus a 0.02 USDC fund_agent. Steps 4–5 (gasless pay, reject refund) plus a refundExpired ran on Arc testnet and a mainnet fork, not on mainnet (no extra spend approved). Step 6 is optional and needs approval.
Testnet record: contracts/deployments/testnet.json.

## Video (~3 min, Muhammad records on his laptop: Loom, or QuickTime/OBS → YouTube unlisted)
0:00 Problem: agents pay APIs with no recourse; PayPerCall = escrow + verdict hash + split/refund.
0:25 Arc Studio workspace (https://studio.arc.io/app/e0f3376e-8287-4dba-bda9-9f13ef987c29): scroll the chat (spec → contract → tests passing →
     audit with 5 fixes → testnet deploy → app). Show the file tree and the test output.
1:20 Live app https://paypercall.madebydevx.com: service card (DevX Token Check, $0.01, 10% referrer), then Recent Calls with call #0 →
     click its tx link. (If a wallet with a little Arc USDC is available, do a live "Pay 0.01 USDC & check": status flips to Fulfilled, the verdict
     shows "hash matches onchain". This needs separate approval because it spends.)
2:10 explorer.arc.io: the contract (0x21b9…e9d1), the requestCall tx 0x733de8b2… (0.01 USDC in), the fulfill tx 0x6b2b1aa5… (0.009 to the provider,
     0.001 to the referrer). Show the refund txs on explorer.testnet.arc.io (reject 0x75393122…, refundExpired 0xd8d7a6a1…), and show receipts/mainnet/call-0.json, whose keccak256 equals the onchain resultHash.
2:40 What's next: any API can list itself; ERC-8004 reputation; repo https://github.com/devx-agent/devx-paypercall.
