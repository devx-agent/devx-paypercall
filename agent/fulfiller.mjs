// Token Check operator: reads open PayPerCall requests from Arc events, runs DevX Token Check, and settles onchain.
//   node fulfiller.mjs --net fork|testnet|mainnet [--once] [--from <block>]
// Valid request → fulfill(callId, keccak256(verdict JSON), share URL) → escrow split provider/referrer.
// Bad input or analysis failure → reject(callId, reason) → payer refunded in the same tx (never charged for nothing).
import fs from 'node:fs';
import { keccak256, toBytes, isAddress } from 'viem';
import { setup, arg, flag, PPC_ABI, FEES, fmt } from './lib.mjs';

const net = arg('net', 'fork');
const { dep, pub, wallet, txUrl } = setup(net);
const ops = wallet('ops');
const API = process.env.TOKENCHECK_API || 'https://tokencheck.madebydevx.com';
const CHAINS = new Set(['base', 'ethereum', 'arbitrum', 'optimism', 'polygon', 'robinhood', 'solana']);
const OUT = `/workspace/earner/arc/receipts/${net}`;
fs.mkdirSync(OUT, { recursive: true });

async function verdict(request) {
  const m = /^([a-z]+):(\S+)$/.exec(request);
  if (!m || !CHAINS.has(m[1])) return { reject: 'unsupported chain' };
  if (m[1] !== 'solana' && !isAddress(m[2])) return { reject: 'invalid token address' };
  const url = `${API}/v1/token/free?chain=${m[1]}&address=${m[2]}`;
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'devx-paypercall-fulfiller/1' } });
  const body = await r.text();
  if (!r.ok) return { reject: `analysis unavailable (${r.status})` };
  let j; try { j = JSON.parse(body); } catch { return { reject: 'analysis unavailable (bad json)' }; }
  if (!j.result || !j.result.grade) return { reject: 'analysis failed' };
  const share = j.page_url || `${API}/?chain=${m[1]}&address=${m[2]}`;
  return { body, grade: j.result.grade, oneLiner: j.result.one_liner, share };
}

async function tick(fromBlock) {
  const latest = await pub.getBlockNumber();
  const logs = [];
  for (let b = fromBlock; b <= latest; b += 9_999n) {
    const to = b + 9_998n > latest ? latest : b + 9_998n;
    logs.push(...await pub.getContractEvents({ address: dep.PayPerCall, abi: PPC_ABI, eventName: 'CallRequested', fromBlock: b, toBlock: to }));
  }
  for (const l of logs) {
    const { callId, request, serviceId } = l.args;
    if (serviceId !== 0) continue;
    const c = await pub.readContract({ address: dep.PayPerCall, abi: PPC_ABI, functionName: 'getCall', args: [callId] });
    if (c.status !== 1) continue; // only Open
    const v = await verdict(request);
    let hash, step;
    if (v.reject) {
      step = 'reject';
      hash = await ops.writeContract({ address: dep.PayPerCall, abi: PPC_ABI, functionName: 'reject', args: [callId, v.reject], ...FEES });
    } else {
      step = 'fulfill';
      const resultHash = keccak256(toBytes(v.body));
      fs.writeFileSync(`${OUT}/call-${callId}.json`, v.body); // the exact bytes behind resultHash
      hash = await ops.writeContract({ address: dep.PayPerCall, abi: PPC_ABI, functionName: 'fulfill', args: [callId, resultHash, v.share], ...FEES });
    }
    const rc = await pub.waitForTransactionReceipt({ hash });
    console.log(JSON.stringify({ step, callId: callId.toString(), request, grade: v.grade, reason: v.reject, amount: fmt(c.amount), status: rc.status, tx: hash, url: txUrl(hash), gasUsed: rc.gasUsed.toString() }));
  }
  return latest + 1n;
}

let from = BigInt(arg('from', String(dep.deployBlock)));
from = await tick(from);
if (!flag('once')) {
  console.log('watching for new calls (Ctrl-C to stop)…');
  setInterval(async () => { try { from = await tick(from); } catch (e) { console.error('tick error', e.shortMessage || e.message); } }, 4000);
}
