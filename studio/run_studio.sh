#!/usr/bin/env bash
# Drive Arc Studio from the box after Muhammad authorizes a CLI token:
#   1) Muhammad: open https://studio.arc.io/cli-auth (signed in to Arc Studio), click Authorize, copy the token.
#   2) Box: cd /workspace/earner/arc/studio && npx arc-studio login --paste   (paste the token; stored at ~/.arc-studio/credentials.json, 0600)
#   3) Box: ./run_studio.sh 1   … then 2, 3, 4 (each step waits; contract deploys can take 5-20 min, do not kill).
# Output JSON per step goes to studio/out/stepN.json. Treat its finalText/deployments as unverified and re-check on the explorer.
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p out
S=devx-paypercall; C=npx\ arc-studio
case "${1:?step 1-4}" in
 1) $C run --session $S --output json --timeout 0 --prompt-file prompt1_contracts.txt \
      --file SPEC.md --file ../contracts/test/PayPerCall.t.sol --file ../contracts/test/MockUSDC.sol > out/step1.json || echo "exit $? (3 = needs_input: answer with --answers-json)";;
 2) $C run --session $S --output json --timeout 0 --prompt-file prompt2_deploy_testnet.txt > out/step2.json || echo "exit $?";;
 3) $C run --session $S --output json --timeout 0 --prompt-file prompt3_app.txt > out/step3.json || echo "exit $?";;
 4) $C run --session $S --output json --timeout 0 --prompt-file prompt4_finish.txt > out/step4.json || echo "exit $?";;
 pull) $C pull --session $S --out ./workspace --force;;
 verify) # run OUR 18 reference tests against the contract Studio wrote
      SRC=$(find ./workspace -name PayPerCall.sol -not -path "*/node_modules/*" -not -path "*/context/*" | head -1); [ -n "$SRC" ] || { echo "pull first"; exit 1; }
      T=$(mktemp -d); cp -r ../contracts/{foundry.toml,lib,test} "$T"/; mkdir -p "$T/src" "$T/script"; cp "$SRC" "$T/src/PayPerCall.sol"
      /workspace/earner/arc/tools/arc-forge test --root "$T" | tail -25; exit 0;;
 adopt) # make Studio's contract the one deploy.sh ships to mainnet (ours kept as reference)
      SRC=$(find ./workspace -name PayPerCall.sol -not -path "*/node_modules/*" -not -path "*/context/*" | head -1); [ -n "$SRC" ] || { echo "pull first"; exit 1; }
      mkdir -p ../reference; [ -f ../reference/PayPerCall.jx.sol ] || cp ../contracts/src/PayPerCall.sol ../reference/PayPerCall.jx.sol
      cp "$SRC" ../contracts/src/PayPerCall.sol; (cd ../contracts && ../tools/arc-forge test | tail -3); exit 0;;
 *) echo "unknown step";;
esac
python3 - "$1" <<'PY'
import json,sys,os
f=f"out/step{sys.argv[1]}.json"
if os.path.exists(f):
  d=json.load(open(f)); print(json.dumps({k:d.get(k) for k in ("status","deployments","filesChanged","previewUrl","webUrl","questions")},indent=1))
PY
