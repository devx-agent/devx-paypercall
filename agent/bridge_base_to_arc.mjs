// Move a little real USDC from DevX MAIN (Base) to the Arc ops key on Arc mainnet with CCTP V2 + Circle Forwarding
// Service (Circle submits the Arc-side mint, so no Arc gas is needed up front).
//   node bridge_base_to_arc.mjs                 DRY RUN: balances, live fee quote, exact calls. Sends nothing.
//   CONFIRM_MAINNET=I_APPROVE_REAL_USDC node bridge_base_to_arc.mjs --send [--amount 2.0] [--to 0x…]
// Cost (quoted live 2026-10-24 00:2x CEST): forwarding fee ≈ 0.0157 USDC, Standard transfer protocol fee 0,
// Base gas for approve + burn ≈ $0.01 in ETH. Standard finality ≈ 15-20 min on Base.
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, pad, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { mnemonicToAccount } from 'viem/accounts';
import { arg, flag } from './lib.mjs';

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TOKEN_MESSENGER_V2 = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d'; // same address on Base and Arc (docs.arc.io contract-addresses)
const ARC_DOMAIN = 26, BASE_DOMAIN = 6;
const FORWARD_HOOK = '0x636374702d666f72776172640000000000000000000000000000000000000000'; // "cctp-forward" v0, no payload
const addrs = JSON.parse(fs.readFileSync('/workspace/earner/arc/addresses.json', 'utf8'));
const to = arg('to', addrs.ops);
const amount = parseUnits(arg('amount', '2.0'), 6);
const send = flag('send');
if (send && process.env.CONFIRM_MAINNET !== 'I_APPROVE_REAL_USDC') throw new Error('set CONFIRM_MAINNET=I_APPROVE_REAL_USDC (Muhammad approval) to send');

const mnemonic = JSON.parse(fs.readFileSync('/workspace/earner/secrets/wallet.json', 'utf8')).mnemonic_bip39_24;
const account = mnemonicToAccount(mnemonic, { addressIndex: 0 });
const pub = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)']);
const tm = parseAbi(['function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)']);

const [usdcBal, ethBal] = await Promise.all([pub.readContract({ address: BASE_USDC, abi: erc20, functionName: 'balanceOf', args: [account.address] }), pub.getBalance({ address: account.address })]);
const fees = await (await fetch(`https://iris-api.circle.com/v2/burn/USDC/fees/${BASE_DOMAIN}/${ARC_DOMAIN}?forward=true`)).json();
const std = fees.find((f) => f.finalityThreshold === 2000);
const maxFee = BigInt(std.forwardFee.high) + 2000n; // small buffer over the "high" forwarding quote
console.log(JSON.stringify({ from: account.address, baseUSDC: formatUnits(usdcBal, 6), baseETH: formatUnits(ethBal, 18), to, arcDomain: ARC_DOMAIN,
  amount: formatUnits(amount, 6), quote: std, maxFee: formatUnits(maxFee, 6), expectedOnArc: `≈${formatUnits(amount - BigInt(std.forwardFee.med), 6)} USDC` }, null, 1));
if (usdcBal < amount) throw new Error('not enough Base USDC');
if (!send) { console.log('DRY RUN only. Calls that --send makes: USDC.approve(TokenMessengerV2, amount); TokenMessengerV2.depositForBurnWithHook(amount, 26, to, USDC, 0x0, maxFee, 2000, cctp-forward hook)'); process.exit(0); }

const w = createWalletClient({ chain: base, transport: http('https://mainnet.base.org'), account });
const allowance = await pub.readContract({ address: BASE_USDC, abi: erc20, functionName: 'allowance', args: [account.address, TOKEN_MESSENGER_V2] });
if (allowance < amount) {
  const h = await w.writeContract({ address: BASE_USDC, abi: erc20, functionName: 'approve', args: [TOKEN_MESSENGER_V2, amount] });
  await pub.waitForTransactionReceipt({ hash: h }); console.log('approve', `https://basescan.org/tx/${h}`);
  await new Promise((r) => setTimeout(r, 6000)); // public RPC nodes lag; let the allowance propagate before estimating the burn
}
const h = await w.writeContract({ address: TOKEN_MESSENGER_V2, abi: tm, functionName: 'depositForBurnWithHook',
  args: [amount, ARC_DOMAIN, pad(to, { size: 32 }), BASE_USDC, pad('0x0', { size: 32 }), maxFee, 2000, FORWARD_HOOK] });
const rc = await pub.waitForTransactionReceipt({ hash: h });
console.log('burn', rc.status, `https://basescan.org/tx/${h}`);
console.log(`track: https://iris-api.circle.com/v2/messages/${BASE_DOMAIN}?transactionHash=${h}  then check ${to} on https://explorer.arc.io`);
