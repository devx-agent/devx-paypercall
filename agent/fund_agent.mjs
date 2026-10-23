// Top up the demo agent (payer) from the ops key on Arc. Native USDC value transfer (18 decimals).
//   node fund_agent.mjs --net fork|testnet|mainnet [--amount 0.2]
import { parseEther, formatEther } from 'viem';
import { setup, arg, FEES } from './lib.mjs';
const net = arg('net', 'fork');
const { pub, wallet, dep, txUrl } = setup(net);
const w = wallet('ops');
const value = parseEther(arg('amount', '0.2'));
const h = await w.sendTransaction({ to: dep.agent, value, ...FEES });
const rc = await pub.waitForTransactionReceipt({ hash: h });
console.log(JSON.stringify({ step: 'fund_agent', to: dep.agent, amount: formatEther(value) + ' USDC', status: rc.status, tx: txUrl(h),
  agentBalance: formatEther(await pub.getBalance({ address: dep.agent })) + ' USDC' }));
