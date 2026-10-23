// Demo payer agent: buys one DevX Token Check verdict through PayPerCall on Arc.
//   node pay.mjs --net fork|testnet|mainnet [--mode approve|auth] [--chain base] [--token 0x…] [--referrer 0x…]
// mode approve: agent sends approve() + requestCall() (agent pays its own Arc gas in USDC)
// mode auth:    agent only SIGNS an EIP-3009 ReceiveWithAuthorization (x402-style); the ops key relays it and pays gas.
import { keccak256, toBytes, hexToSignature, isAddress } from 'viem';
import { setup, arg, PPC_ABI, USDC_ABI, USDC, FEES, fmt } from './lib.mjs';

const net = arg('net', 'fork');
const mode = arg('mode', 'approve');
const chainName = arg('chain', 'base');
const token = arg('token', '0x4200000000000000000000000000000000000006');
const { dep, pub, wallet, txUrl } = setup(net);
const referrer = arg('referrer', '0xe30c4544eC57ac44d8586eB49e49e267fc2d40DB'); // DevX app treasury (MAIN) = referrer share
if (!isAddress(token) && chainName !== 'solana') throw new Error('bad --token');
const request = `${chainName}:${token}`;
const ppc = dep.PayPerCall;
const agent = wallet('agent');
const svc = await pub.readContract({ address: ppc, abi: PPC_ABI, functionName: 'getService', args: [0] });
console.log(`service #0 ${svc.name} price ${fmt(svc.price)} referrer share ${svc.referrerBps / 100}%`);
console.log(`agent ${agent.account.address} balance ${fmt(await pub.readContract({ address: USDC, abi: USDC_ABI, functionName: 'balanceOf', args: [agent.account.address] }))}`);

let hash;
if (mode === 'approve') {
  const allowance = await pub.readContract({ address: USDC, abi: USDC_ABI, functionName: 'allowance', args: [agent.account.address, ppc] });
  if (allowance < svc.price) {
    const h = await agent.writeContract({ address: USDC, abi: USDC_ABI, functionName: 'approve', args: [ppc, svc.price], ...FEES });
    await pub.waitForTransactionReceipt({ hash: h });
    console.log('approve', txUrl(h));
  }
  hash = await agent.writeContract({ address: ppc, abi: PPC_ABI, functionName: 'requestCall', args: [0, request, referrer, svc.price], ...FEES });
} else {
  const nonce = await pub.readContract({ address: ppc, abi: PPC_ABI, functionName: 'authNonce', args: [0, keccak256(toBytes(request)), referrer, agent.account.address, svc.price] });
  const [name, version] = await Promise.all(['name', 'version'].map((f) => pub.readContract({ address: USDC, abi: USDC_ABI, functionName: f })));
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600);
  const sig = await agent.account.signTypedData({
    domain: { name, version, chainId: pub.chain.id, verifyingContract: USDC },
    types: { ReceiveWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] },
    primaryType: 'ReceiveWithAuthorization',
    message: { from: agent.account.address, to: ppc, value: svc.price, validAfter: 0n, validBefore, nonce },
  });
  const { v, r, s } = hexToSignature(sig);
  console.log('agent signed EIP-3009 authorization (no gas); relaying with ops key');
  hash = await wallet('ops').writeContract({ address: ppc, abi: PPC_ABI, functionName: 'requestCallWithAuthorization',
    args: [0, request, referrer, agent.account.address, 0n, validBefore, nonce, Number(v), r, s], ...FEES });
}
const rc = await pub.waitForTransactionReceipt({ hash });
if (rc.status !== 'success') throw new Error('request reverted ' + hash);
const callId = (await pub.readContract({ address: ppc, abi: PPC_ABI, functionName: 'callCount' })) - 1n;
console.log(JSON.stringify({ step: 'requestCall', mode, callId: callId.toString(), request, tx: hash, url: txUrl(hash), gasUsed: rc.gasUsed.toString() }));
