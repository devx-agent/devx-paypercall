# DevX PayPerCall

> Built with Arc Studio - money-powered apps in minutes

## What This App Does

Escrowed USDC pay-per-call contract for AI agents and paid APIs on Arc. An agent (payer) escrows the exact service price; the operator fulfills with a result hash (splitting payment to provider + optional referrer) or rejects (full refund). Anyone may trigger a refund after the deadline passes. Includes a gasless EIP-3009 `requestCallWithAuthorization` path so a relayer can post calls on behalf of payers.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity ^0.8.30 + Foundry with `via_ir = true`. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `forge build`, test with `forge test`.
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC 6-decimal ERC-20 at `0x3600000000000000000000000000000000000000`

## Key Files

- `contracts/PayPerCall.sol` — main contract (no external deps, no owner, no upgradeability)
- `contracts/test/PayPerCall.t.sol` — reference tests (from spec, unchanged)
- `contracts/test/MockUSDC.sol` — EIP-3009 mock token
- `contracts/test/PayPerCallExtra.t.sol` — additional tests: invariant/fuzz escrow conservation, reentrancy via malicious token, deadline edge cases, bad nonce paths

## Deployment

| Network | Address | Deploy Tx | Explorer |
|---|---|---|---|
| Arc Testnet | `0x9351a7332944a24e1e179cf7a891a89d67c217bd` | `0x2684e1693a91312b7078a263cf3d7720cb2a721f6c65aeb7713444641fd8f48e` | https://explorer.testnet.arc.io/address/0x9351a7332944a24e1e179cf7a891a89d67c217bd |

Constructor arg: `usdc = 0x3600000000000000000000000000000000000000`

Bytecode verified: on-chain code is 7187 bytes matching the local artifact. The 5 differing bytes are the `usdc` immutable slots — Foundry leaves them as zeros in the artifact; the EVM fills them with the constructor arg on deploy. All 5 slots contain `0x36...` (the USDC address) on-chain.

## Frontend

- `src/config.ts` — PAYPERCALL addresses by chain ID, REFERRER, USDC address, TOKEN_CHAINS, Arc chain definitions
- `src/lib/paypercall.ts` — full ABI and TypeScript types for ServiceData/CallData
- `src/lib/utils.ts` — formatUsdc, formatCountdown, parseOnchainError, etc.
- `src/components/Header.tsx` — sticky header with network switcher (Arc Testnet / Mainnet), USDC balance, ConnectKit
- `src/components/ServiceCard.tsx` — live reads service #0 (name, price, timeout, referrerBps)
- `src/components/CheckForm.tsx` — approve + requestCall flow with full state machine
- `src/components/CallStatus.tsx` — polls getCall every 2s, fetches CallFulfilled event, verifies result hash, shows receipt
- `src/components/RecentCalls.tsx` — getLogs last 9,999 blocks for CallRequested events
- `src/components/Footer.tsx` — how it works, explorer/GitHub/tokencheck links

## Contract Notes

- Contract is live and all 33 tests pass.
- Foundry config: `solc_version = "0.8.30"`, `via_ir = true` (needed to avoid stack-too-deep in `requestCallWithAuthorization`).
- `authNonce` binds the EIP-3009 nonce to `(chainId, address(this), serviceId, requestHash, referrer, payer, price)` — a relayer cannot re-point a signed payment.
- When referrer is `address(0)`, provider receives 100% of the price.
- When referrer transfer fails (e.g. Arc blocklist), that portion routes to provider instead of reverting.
- Reentrancy guard (`uint8 _locked`) on all USDC state-changing paths; checks-effects-interactions throughout.

## Security Review

Ran max-severity review (two passes). First pass found and fixed:
1. Stack-too-deep in `requestCallWithAuthorization` → enabled `via_ir = true`.
2. Missing bounds check on `callId` in `fulfill`/`reject`/`refundExpired` → added `if (callId >= _calls.length) revert NotOpen()`.
3. Constructor did not validate `usdc_ != address(0)` → added check.
4. Dead code `msg.sender == address(0)` in `requestCall` → removed.
5. Blocked referrer could prevent `fulfill` from settling → added `_tryTransfer` fallback routing referrer share to provider on failure.

Second pass: no material findings.

## Invariants

- Escrow conservation: `usdc.balanceOf(address(this)) == sum(amount for all Open calls)` always holds.
- Each call settles exactly once (Fulfilled or Refunded).
