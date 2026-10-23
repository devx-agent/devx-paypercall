/**
 * PayPerCall contract ABI and helpers.
 */

export const PAYPERCALL_ABI = [
  // --- enums (represented as uint8) ---
  // Status: None=0, Open=1, Fulfilled=2, Refunded=3

  // --- structs returned by view functions ---
  {
    type: 'function',
    name: 'getService',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'provider', type: 'address' },
          { name: 'operator', type: 'address' },
          { name: 'price', type: 'uint96' },
          { name: 'timeout', type: 'uint32' },
          { name: 'referrerBps', type: 'uint16' },
          { name: 'active', type: 'bool' },
          { name: 'name', type: 'string' },
          { name: 'endpoint', type: 'string' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getCall',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'payer', type: 'address' },
          { name: 'deadline', type: 'uint64' },
          { name: 'status', type: 'uint8' },
          { name: 'serviceId', type: 'uint32' },
          { name: 'referrer', type: 'address' },
          { name: 'amount', type: 'uint96' },
          { name: 'requestHash', type: 'bytes32' },
          { name: 'resultHash', type: 'bytes32' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'serviceCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'callCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'requestCall',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'serviceId', type: 'uint32' },
      { name: 'request', type: 'string' },
      { name: 'referrer', type: 'address' },
      { name: 'maxPrice', type: 'uint96' },
    ],
    outputs: [{ name: 'callId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'usdc',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  // --- events ---
  {
    type: 'event',
    name: 'CallRequested',
    inputs: [
      { name: 'callId', type: 'uint256', indexed: true },
      { name: 'serviceId', type: 'uint32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'referrer', type: 'address', indexed: false },
      { name: 'amount', type: 'uint96', indexed: false },
      { name: 'requestHash', type: 'bytes32', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
      { name: 'request', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CallFulfilled',
    inputs: [
      { name: 'callId', type: 'uint256', indexed: true },
      { name: 'resultHash', type: 'bytes32', indexed: false },
      { name: 'resultURI', type: 'string', indexed: false },
      { name: 'providerAmount', type: 'uint96', indexed: false },
      { name: 'referrerAmount', type: 'uint96', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CallRefunded',
    inputs: [
      { name: 'callId', type: 'uint256', indexed: true },
      { name: 'by', type: 'address', indexed: true },
      { name: 'reason', type: 'string', indexed: false },
    ],
  },
] as const

export type CallStatus = 0 | 1 | 2 | 3
export const STATUS_LABEL: Record<number, string> = {
  0: 'None',
  1: 'Open',
  2: 'Fulfilled',
  3: 'Refunded',
}

export interface ServiceData {
  provider: `0x${string}`
  operator: `0x${string}`
  price: bigint
  timeout: number
  referrerBps: number
  active: boolean
  name: string
  endpoint: string
}

export interface CallData {
  payer: `0x${string}`
  deadline: bigint
  status: number
  serviceId: number
  referrer: `0x${string}`
  amount: bigint
  requestHash: `0x${string}`
  resultHash: `0x${string}`
}
