import { USDC_DECIMALS } from '../config'

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatUsdc(raw: bigint, decimals = USDC_DECIMALS): string {
  const divisor = BigInt(10 ** decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2)
  return `${whole.toString()}.${fracStr}`
}

export function parseUsdc(amount: string, decimals = USDC_DECIMALS): bigint {
  const [whole, frac = ''] = amount.split('.')
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0')
  return BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(fracPadded || '0')
}

export function formatTimeout(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`
}

export function formatCountdown(deadlineSeconds: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const remaining = deadlineSeconds - now
  if (remaining <= 0n) return 'Expired'
  const secs = Number(remaining)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

export function buildTxLink(explorerBase: string, hash: string): string {
  return `${explorerBase}/tx/${hash}`
}

export function buildAddressLink(explorerBase: string, address: string): string {
  return `${explorerBase}/address/${address}`
}

export function parseOnchainError(err: unknown): string {
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('user denied')) return 'Transaction cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient USDC balance.'
  if (msg.includes('reverted')) {
    const m = msg.match(/error: ([a-z]+)\(\)/i)
    if (m) return `Contract error: ${m[1]}`
    return 'Transaction reverted.'
  }
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error — please retry.'
  return 'Something went wrong. Please try again.'
}
