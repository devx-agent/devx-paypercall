// node register.mjs --net testnet : registers DevX Token Check as the next service (ops = provider + operator).
import fs from 'fs';
import { setup, arg, FEES, PPC_ABI } from './lib.mjs';
import { parseAbi } from 'viem';
const net = arg('net', 'testnet');
const { dep, pub, wallet, txUrl } = setup(net);
const ops = wallet('ops');
const abi = [...PPC_ABI, ...parseAbi(['function registerService(string name, string endpoint, address operator, uint96 price, uint32 timeout, uint16 referrerBps) returns (uint32)', 'function serviceCount() view returns (uint256)'])];
const before = await pub.readContract({ address: dep.PayPerCall, abi, functionName: 'serviceCount' });
const h = await ops.writeContract({ address: dep.PayPerCall, abi, functionName: 'registerService',
  args: ['DevX Token Check', 'https://tokencheck.madebydevx.com/v1/token/verdict', ops.account.address, 10_000n, 600, 1000], ...FEES });
const r = await pub.waitForTransactionReceipt({ hash: h });
const s = await pub.readContract({ address: dep.PayPerCall, abi, functionName: 'getService', args: [Number(before)] });
console.log(JSON.stringify({ step: 'registerService', serviceId: Number(before), status: r.status, tx: txUrl(h), provider: s.provider, price: s.price.toString(), referrerBps: s.referrerBps }));
