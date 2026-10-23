# DevX PayPerCall

Escrowed USDC pay-per-call for AI agents and paid APIs, deployed on Arc. A payer locks the exact service price onchain; an off-chain operator delivers the result and settles with a content hash, splitting the payment between provider and an optional referrer. If the operator rejects the request or misses the deadline, the payer is refunded in full — no trust required.

The first live service is **DevX Token Check**: pay 0.01 USDC to get an onchain-verified token security verdict for any EVM address on Base, Ethereum, Arbitrum, Optimism, Polygon, or BSC.

Built with [Arc Studio](https://studio.arc.io)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PayPerCall.sol  (Arc — USDC is native gas)                     │
│                                                                  │
│  registerService ──► Service registry (provider, price, timeout)│
│  requestCall ──────► escrow USDC ──► Call{ Open, deadline }     │
│  fulfill ──────────► verify resultHash ──► split to provider    │
│                       and referrer, status = Fulfilled           │
│  reject / refundExpired ──► full refund to payer                │
└──────────────────────────┬───────────────────────────────────────┘
                           │ watches CallRequested events
                 ┌─────────▼──────────┐
                 │  Off-chain fulfiller│  (DevX bot, key:
                 │  (operator key)    │   0xbDdd5BB708…)
                 │                    │
                 │  1. Decode request │
                 │  2. Call API       │
                 │  3. Hash result    │
                 │  4. fulfill(id,    │
                 │     hash, uri)     │
                 └─────────┬──────────┘
                           │ resultURI (IPFS or HTTPS)
                 ┌─────────▼──────────┐
                 │  React frontend    │
                 │                    │
                 │  • wagmi v2 + viem │
                 │  • ConnectKit      │
                 │  • Arc Testnet /   │
                 │    Arc Mainnet     │
                 │  • No backend      │
                 └────────────────────┘
```

**Contract** (`contracts/PayPerCall.sol`) — ownerless, non-upgradeable Solidity ^0.8.30. Holds escrowed USDC per call in a `Call[]` array. The EIP-3009 `requestCallWithAuthorization` path lets a relayer submit a signed payment without the payer needing gas. The `authNonce` binds the EIP-3009 nonce to `(chainId, address(this), serviceId, requestHash, referrer, payer, price)` so the signature cannot be replayed on a different service or referrer.

**Off-chain fulfiller** — a bot run by DevX that watches `CallRequested` events, calls the token-verdict API, hashes the JSON response body with keccak256, and calls `fulfill(callId, hash, resultURI)`. The operator key is `0xbDdd5BB708D9368ce3373d083aA1e7D2c5D14d57`.

**Frontend** (`src/`) — React + Vite + TypeScript + Tailwind. No backend. All reads go directly to Arc RPC via viem `publicClient`; all writes go through the user's injected wallet (MetaMask, Rabby, etc.) via wagmi. Polls `getCall` every 2 s for live status updates.

---

## How Arc Studio Was Used

| Step | What Arc Studio did |
|------|---------------------|
| **Contract** | Wrote `contracts/PayPerCall.sol` from the full SPEC.md interface — services, escrowed calls, EIP-3009 gasless path, reentrancy guard, checks-effects-interactions throughout. |
| **Tests** | Copied the reference Foundry suite (`PayPerCall.t.sol`, `MockUSDC.sol`) into `contracts/test/` and wrote a second suite (`PayPerCallExtra.t.sol`) with invariant/fuzz escrow conservation, reentrancy via a malicious token, deadline edge cases, and bad-nonce EIP-3009 paths. |
| **Audit** | Ran two rounds of security review at max severity. Round 1 found: stack-too-deep in `requestCallWithAuthorization` (fixed with `via_ir`), missing `callId` bounds checks (added), missing constructor zero-address check (added), a blocked referrer that could brick `fulfill` (fixed with `_tryTransfer` fallback). Round 2: no findings. |
| **Testnet deploy** | Built artifact with `forge build`, deployed to Arc Testnet via Circle Smart Contract Platform, verified bytecode on-chain. |
| **Frontend** | Wrote all components (Header, ServiceCard, CheckForm, CallStatus, RecentCalls, Footer), wagmi config, PayPerCall ABI, and utility helpers. Zero lint errors, zero TypeScript errors. |

---

## Testnet Deployment (Arc Testnet, chainId 5042002)

| Item | Value |
|------|-------|
| Contract address | `0x9351a7332944a24e1e179cf7a891a89d67c217bd` |
| Deploy tx | `0x2684e1693a91312b7078a263cf3d7720cb2a721f6c65aeb7713444641fd8f48e` |
| Explorer | https://explorer.testnet.arc.io/address/0x9351a7332944a24e1e179cf7a891a89d67c217bd |
| USDC (testnet) | `0x3600000000000000000000000000000000000000` |
| Operator (fulfiller bot) | `0xbDdd5BB708D9368ce3373d083aA1e7D2c5D14d57` |
| REFERRER (DevX treasury) | `0xe30c4544eC57ac44d8586eB49e49e267fc2d40DB` |
| Service #0 | DevX Token Check, registered 2026-10-24 (tx `0x0eb958eb26e06c2aa38ed5fe94a189ad5d793d7639983b13f7da98b44f1cc170`) |

---

## Mainnet Deployment (Arc Mainnet, chainId 5042)

Deployed 2026-10-24 by DevX from this exact `PayPerCall.sol` (see the root README for the full tx list).

| Item | Value |
|------|-------|
| Contract address | `0x21b9fad1c5eac36c687479d6bc8c8b088cbae9d1` |
| Deploy tx | `0x2f2abd83c346c0499b6a44d605d8701ab2f1eeda4e3ddb8310cb45359970ba53` |
| Explorer | https://explorer.arc.io/address/0x21b9fad1c5eac36c687479d6bc8c8b088cbae9d1 |
| USDC (mainnet) | `0x3600000000000000000000000000000000000000` |
| Service #0 | DevX Token Check, price 0.01 USDC, timeout 600 s, 10% referrer split |
| First paid call | `0x733de8b23a826f4a759e540c5052d82451d879c4d897b6aa7fc1cd1372ab705d` (settled in `0x6b2b1aa5f77ba1d0aa6ee89bba5d2d40379900832896285c86be6bbacdf79bfc`) |

---

## Development

### Prerequisites

- [Foundry](https://getfoundry.sh/) — `forge`, `cast`
- [Bun](https://bun.sh/) — frontend package manager and runner

### Install

```bash
bun install
```

### Environment Variables

None required. All chain RPC URLs and contract addresses are in `src/config.ts`. No backend.

### Run the frontend (dev server)

```bash
bun run dev
```

### Build for production

```bash
bun run build
```

### Build contracts

```bash
forge build
```

### Run contract tests

```bash
forge test
```

### Lint + typecheck

```bash
bun run check
```

---

## Tech Stack

- **Contract:** Solidity ^0.8.30, Foundry, `via_ir = true` (stack-depth), no external dependencies
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS
- **Web3:** wagmi v2, viem, ConnectKit (injected wallets)
- **Chain:** Arc Testnet + Arc Mainnet (USDC is the native gas token)

---

## Key Files

```
contracts/
  PayPerCall.sol               # core contract
  test/
    PayPerCall.t.sol           # reference test suite (33 tests)
    PayPerCallExtra.t.sol      # invariant/fuzz/reentrancy/edge tests
    MockUSDC.sol               # EIP-3009 USDC mock for tests
    MaliciousToken.sol         # reentrancy attack token for tests
src/
  config.ts                    # contract addresses, REFERRER, chain defs
  lib/
    paypercall.ts              # full ABI + TypeScript types
    utils.ts                   # formatUsdc, formatCountdown, etc.
  components/
    Header.tsx                 # network switch, USDC balance, wallet
    ServiceCard.tsx            # live service #0 info
    CheckForm.tsx              # approve + requestCall flow
    CallStatus.tsx             # polls call, shows verdict + receipt
    RecentCalls.tsx            # getLogs last 9,999 blocks
    Footer.tsx                 # how it works, links
```
