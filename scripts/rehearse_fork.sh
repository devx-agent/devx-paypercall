#!/usr/bin/env bash
# Full free rehearsal on a local arc-anvil fork of Arc testnet (real Arc USDC precompile semantics, fake balances).
# Deploy → agent pays (approve path) → agent pays (EIP-3009 gasless path) → bad request → fulfiller settles/refunds.
set -euo pipefail
cd /workspace/earner/arc
pkill -f "arc-anvil --network arc --fork-url https://rpc.testnet.arc.io --port 8547" 2>/dev/null || true; sleep 1
scripts/deploy.sh fork
cd agent
node pay.mjs --net fork --mode approve --chain base --token 0x4200000000000000000000000000000000000006
node pay.mjs --net fork --mode auth --chain base --token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
node pay.mjs --net fork --mode approve --chain base --token 0x0000000000000000000000000000000000000001
node fulfiller.mjs --net fork --once
