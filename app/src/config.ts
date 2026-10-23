/**
 * wagmi configuration + DevX PayPerCall app config
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// ---------------------------------------------------------------------------
// Arc mainnet chain definition
// ---------------------------------------------------------------------------
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
})

// Pre-register chain RPC URLs so trace events show correct chain names
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arcMainnet.id, 'https://rpc.mainnet.arc.io')

export const config = createConfig({
  chains: [arcTestnet, arcMainnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.io'),
    [arcMainnet.id]: http('https://rpc.mainnet.arc.io'),
    [mainnet.id]: http(),
  },
})

// ---------------------------------------------------------------------------
// PayPerCall contract config
// ---------------------------------------------------------------------------

/** Contract addresses by chain ID. Zero address = not yet deployed. */
export const PAYPERCALL: Record<number, `0x${string}`> = {
  5042:    '0x21b9fad1c5eac36c687479d6bc8c8b088cbae9d1', // Arc Mainnet (deployed 2026-10-24)
  5042002: '0x9351a7332944a24e1e179cf7a891a89d67c217bd', // Arc Testnet
}

/** Block each PayPerCall deployment was mined in (log scans start here). */
export const DEPLOY_BLOCK: Record<number, bigint> = {
  5042: 27529228n,
  5042002: 68761822n,
}

/** DevX app treasury — referrer for all calls from this UI */
export const REFERRER = '0xe30c4544eC57ac44d8586eB49e49e267fc2d40DB' as const

/** USDC ERC-20 address (same on Arc mainnet and testnet) */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`
export const USDC_DECIMALS = 6

/** Arc chain IDs supported by this app */
export const ARC_CHAIN_IDS = [5042002, 5042] as const
export type ArcChainId = (typeof ARC_CHAIN_IDS)[number]

export function isArcChain(chainId: number | undefined): chainId is ArcChainId {
  return chainId === 5042 || chainId === 5042002
}

export function getExplorerBase(chainId: number): string {
  if (chainId === 5042) return 'https://explorer.arc.io'
  if (chainId === 5042002) return 'https://explorer.testnet.arc.io'
  return 'https://explorer.testnet.arc.io'
}

export function getChainLabel(chainId: number): string {
  if (chainId === 5042) return 'Arc Mainnet'
  if (chainId === 5042002) return 'Arc Testnet'
  return `Chain ${chainId}`
}

export function isDeployed(chainId: number): boolean {
  const addr = PAYPERCALL[chainId]
  return !!addr && addr !== '0x0000000000000000000000000000000000000000'
}

/** Chains for the token-check request dropdown */
export const TOKEN_CHAINS = [
  { id: 'base',      label: 'Base' },
  { id: 'ethereum',  label: 'Ethereum' },
  { id: 'arbitrum',  label: 'Arbitrum' },
  { id: 'optimism',  label: 'Optimism' },
  { id: 'polygon',   label: 'Polygon' },
  { id: 'bsc',       label: 'BSC' },
] as const
