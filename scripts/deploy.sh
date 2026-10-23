#!/usr/bin/env bash
# Deploy DevX PayPerCall to Arc and register DevX Token Check as service #0.
#   ./deploy.sh fork      local arc-anvil fork of Arc testnet (free, no faucet; funds ops+agent with fake test USDC)
#   ./deploy.sh testnet   Arc testnet 5042002 (ops key needs faucet USDC: https://faucet.circle.com → Arc Testnet)
#   CONFIRM_MAINNET=I_APPROVE_REAL_USDC ./deploy.sh mainnet   Arc mainnet 5042 (REAL USDC; ~0.06-0.08 USDC gas)
# Keys come from /workspace/earner/secrets/arc/keys.json (scripts/keygen.py). Nothing secret is printed.
set -euo pipefail
NET="${1:-fork}"
ARC=/workspace/earner/arc
export PATH="$ARC/tools:$PATH"
KEYS=/workspace/earner/secrets/arc/keys.json
[ -f "$KEYS" ] || { echo "run scripts/keygen.py first"; exit 1; }
OPS_ADDR=$(python3 -c "import json;print(json.load(open('$KEYS'))['ops']['address'])")
AGENT_ADDR=$(python3 -c "import json;print(json.load(open('$KEYS'))['agent']['address'])")
case "$NET" in
  fork)    RPC=http://127.0.0.1:8547; CHAIN=5042002
           if ! arc-cast chain-id -r $RPC >/dev/null 2>&1; then
             (nohup arc-anvil --network arc --fork-url https://rpc.testnet.arc.io --port 8547 --silent >/tmp/arcanvil.log 2>&1 &)
             for i in $(seq 1 30); do arc-cast chain-id -r $RPC >/dev/null 2>&1 && break; sleep 1; done
           fi
           # 5 test USDC each (native balance, 18 decimals; the ERC-20 view at 0x3600… mirrors it)
           arc-cast rpc anvil_setBalance "$OPS_ADDR" 0x4563918244F40000 -r $RPC >/dev/null
           arc-cast rpc anvil_setBalance "$AGENT_ADDR" 0x4563918244F40000 -r $RPC >/dev/null ;;
  testnet) RPC=https://rpc.testnet.arc.io; CHAIN=5042002 ;;
  mainnet) RPC=https://rpc.mainnet.arc.io; CHAIN=5042
           [ "${CONFIRM_MAINNET:-}" = "I_APPROVE_REAL_USDC" ] || { echo "Refusing: mainnet spends real USDC. Set CONFIRM_MAINNET=I_APPROVE_REAL_USDC after Muhammad approves."; exit 2; } ;;
  *) echo "usage: $0 fork|testnet|mainnet"; exit 1 ;;
esac
[ "$(arc-cast chain-id -r $RPC)" = "$CHAIN" ] || { echo "chain id mismatch on $RPC"; exit 1; }
BAL=$(arc-cast call 0x3600000000000000000000000000000000000000 "balanceOf(address)(uint256)" "$OPS_ADDR" -r $RPC | awk '{print $1}')
echo "network=$NET rpc=$RPC ops=$OPS_ADDR opsUSDC(6dp)=$BAL gasPrice=$(arc-cast gas-price -r $RPC)"
# mainnet budget: deploy+register ≈ 2.6M gas × ~22-30 gwei ≈ 0.06-0.08 USDC
[ "$BAL" -ge 50000 ] || { echo "ops needs >= 0.05 USDC on $NET for gas (has $BAL). Testnet: faucet.circle.com; mainnet: bridge (scripts/bridge_base_to_arc.mjs)"; exit 3; }
cd "$ARC/contracts"
mkdir -p deployments
set +e
PRIVATE_KEY=$(python3 -c "import json;print(json.load(open('$KEYS'))['ops']['private_key'])") \
  arc-forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --slow --with-gas-price 30gwei --priority-gas-price 1gwei > /tmp/arc_deploy.log 2>&1
RC=$?
set -e
grep -E "PayPerCall|serviceId|provider|Estimated amount|ONCHAIN|Error|error" /tmp/arc_deploy.log | grep -v -i "private" || true
[ $RC -eq 0 ] || { echo "forge script failed (rc=$RC), see /tmp/arc_deploy.log"; exit $RC; }
RUN="broadcast/Deploy.s.sol/$CHAIN/run-latest.json"
python3 - "$RUN" "$NET" "$CHAIN" "$OPS_ADDR" "$AGENT_ADDR" <<'PY'
import json,sys
run,net,chain,ops,agent=sys.argv[1:]
d=json.load(open(run))
create=[t for t in d["transactions"] if t["transactionType"]=="CREATE"][0]
rc={r["transactionHash"]:r for r in d["receipts"]}
addr=create["contractAddress"]; h=create["hash"]
blk=int(rc[h]["blockNumber"],16)
exp={"5042":"https://explorer.arc.io","5042002":"https://explorer.testnet.arc.io"}.get(chain,"")
out={"network":net,"chainId":int(chain),"PayPerCall":addr,"deployTx":h,"deployBlock":blk,"serviceId":0,
     "ops":ops,"agent":agent,"usdc":"0x3600000000000000000000000000000000000000",
     "txs":[t["hash"] for t in d["transactions"]],
     "explorer": (f"{exp}/address/{addr}" if exp and net!="fork" else None)}
json.dump(out,open(f"deployments/{net}.json","w"),indent=1)
print(json.dumps(out,indent=1))
PY
