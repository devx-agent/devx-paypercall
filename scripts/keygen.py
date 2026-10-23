#!/usr/bin/env python3
"""Create the two Arc hot keys used by DevX PayPerCall (idempotent). Prints ADDRESSES ONLY.
   ops   = deployer + service provider + operator (fulfills calls, receives provider share)
   agent = demo payer (an AI agent buying one Token Check verdict)
Keys go to /workspace/earner/secrets/arc/keys.json (dir 700, file 600). Never cat that file into chat."""
import json, os, stat
from eth_account import Account

D = "/workspace/earner/secrets/arc"
F = os.path.join(D, "keys.json")
os.makedirs(D, exist_ok=True)
os.chmod(D, 0o700)
if os.path.exists(F):
    keys = json.load(open(F))
else:
    keys = {}
    for role in ("ops", "agent"):
        a = Account.create()
        keys[role] = {"address": a.address, "private_key": a.key.hex() if a.key.hex().startswith("0x") else "0x" + a.key.hex()}
    fd = os.open(F, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump(keys, fh, indent=1)
os.chmod(F, 0o600)
pub = {r: k["address"] for r, k in keys.items()}
json.dump(pub, open("/workspace/earner/arc/addresses.json", "w"), indent=1)
print(json.dumps(pub, indent=1))
