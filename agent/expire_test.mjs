// testnet only: anyone (here the payer) calls refundExpired once the deadline has passed.
import { setup, arg, FEES, PPC_ABI, USDC, USDC_ABI } from './lib.mjs';
const { dep, pub, wallet, txUrl } = setup(arg('net','testnet'));
const id = BigInt(arg('id'));
const ag = wallet('agent');
let c = await pub.readContract({ address: dep.PayPerCall, abi: PPC_ABI, functionName: 'getCall', args: [id] });
for (;;) { const b = await pub.getBlock(); if (b.timestamp > c.deadline) break; await new Promise(r => setTimeout(r, 10000)); }
const b0 = await pub.readContract({ address: USDC, abi: USDC_ABI, functionName: 'balanceOf', args: [c.payer] });
const h = await ag.writeContract({ address: dep.PayPerCall, abi: PPC_ABI, functionName: 'refundExpired', args: [id], ...FEES });
const r = await pub.waitForTransactionReceipt({ hash: h });
c = await pub.readContract({ address: dep.PayPerCall, abi: PPC_ABI, functionName: 'getCall', args: [id] });
console.log(JSON.stringify({ step: 'refundExpired', callId: id.toString(), status: r.status, callStatus: c.status, tx: txUrl(h), gasUsed: r.gasUsed.toString() }));
