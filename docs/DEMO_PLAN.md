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

## Video (~3 min, Muhammad records on his laptop: Loom, or QuickTime/OBS → YouTube unlisted)
0:00 Problem: agents pay APIs with no recourse; PayPerCall = escrow + verdict hash + split/refund.
0:25 Arc Studio workspace: scroll the chat (spec → contracts → tests passing → audit → testnet deploy → app). Show the file tree + test output.
1:20 Live app on mainnet: connect, pay 0.01 USDC for a token, status flips to Fulfilled in seconds, verdict + "hash matches".
2:10 explorer.arc.io: the contract, the requestCall tx (USDC in), the fulfill tx (USDC split out), and the refund tx.
2:40 What's next: any API can list itself; ERC-8004 reputation; repo + links.
