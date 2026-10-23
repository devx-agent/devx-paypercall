// Shared helpers for the DevX PayPerCall demo agent and fulfiller. Never logs private keys.
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, defineChain, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ARC = '/workspace/earner/arc';
export const USDC = '0x3600000000000000000000000000000000000000';
const NETS = {
  mainnet: { id: 5042, rpc: 'https://rpc.mainnet.arc.io', explorer: 'https://explorer.arc.io' },
  testnet: { id: 5042002, rpc: 'https://rpc.testnet.arc.io', explorer: 'https://explorer.testnet.arc.io' },
  fork: { id: 5042002, rpc: 'http://127.0.0.1:8547', explorer: null },
  mainfork: { id: 5042, rpc: 'http://127.0.0.1:8549', explorer: null },
};

export function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
export const flag = (name) => process.argv.includes(`--${name}`);

export function setup(netName) {
  const n = NETS[netName];
  if (!n) throw new Error(`unknown --net ${netName} (fork|testnet|mainnet)`);
  if (netName === 'mainnet' && process.env.CONFIRM_MAINNET !== 'I_APPROVE_REAL_USDC')
    throw new Error('mainnet spends real USDC: set CONFIRM_MAINNET=I_APPROVE_REAL_USDC after Muhammad approves');
  const chain = defineChain({
    id: n.id, name: `Arc ${netName}`, nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [n.rpc] } },
  });
  const dep = JSON.parse(fs.readFileSync(`${ARC}/contracts/deployments/${netName}.json`, 'utf8'));
  const keys = JSON.parse(fs.readFileSync('/workspace/earner/secrets/arc/keys.json', 'utf8'));
  const pub = createPublicClient({ chain, transport: http(n.rpc) });
  const wallet = (role) => createWalletClient({ chain, transport: http(n.rpc), account: privateKeyToAccount(keys[role].private_key) });
  const txUrl = (h) => (n.explorer ? `${n.explorer}/tx/${h}` : `(fork) ${h}`);
  return { n, chain, dep, pub, wallet, txUrl };
}

// Arc mempool floor is 20 gwei maxFeePerGas; pass explicit fees so wallets never under-bid.
export const FEES = { maxFeePerGas: 40_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };

export const PPC_ABI = parseAbi([
  'function requestCall(uint32 serviceId, string request, address referrer, uint96 maxPrice) returns (uint256)',
  'function requestCallWithAuthorization(uint32 serviceId, string request, address referrer, address payer, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) returns (uint256)',
  'function authNonce(uint32 serviceId, bytes32 requestHash, address referrer, address payer, uint96 price) view returns (bytes32)',
  'function fulfill(uint256 callId, bytes32 resultHash, string resultURI)',
  'function reject(uint256 callId, string reason)',
  'function refundExpired(uint256 callId)',
  'function callCount() view returns (uint256)',
  'function getService(uint32 serviceId) view returns ((address provider, address operator, uint96 price, uint32 timeout, uint16 referrerBps, bool active, string name, string endpoint))',
  'function getCall(uint256 callId) view returns ((address payer, uint64 deadline, uint8 status, uint32 serviceId, address referrer, uint96 amount, bytes32 requestHash, bytes32 resultHash))',
  'event CallRequested(uint256 indexed callId, uint32 indexed serviceId, address indexed payer, address referrer, uint96 amount, bytes32 requestHash, uint64 deadline, string request)',
  'event CallFulfilled(uint256 indexed callId, bytes32 resultHash, string resultURI, uint96 providerAmount, uint96 referrerAmount)',
  'event CallRefunded(uint256 indexed callId, address indexed by, string reason)',
]);
export const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
]);
export const fmt = (v) => (Number(v) / 1e6).toFixed(6) + ' USDC';
