import { useReadContract } from 'wagmi'
import { PAYPERCALL_ABI, type ServiceData } from '../lib/paypercall'
import { formatUsdc, formatTimeout, formatBps } from '../lib/utils'
import { USDC_DECIMALS } from '../config'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface Props {
  contractAddress: `0x${string}`
  chainId: number
  onServiceLoaded?: (s: ServiceData) => void
}

export function ServiceCard({ contractAddress, chainId, onServiceLoaded }: Props) {
  const { data, isLoading, isError } = useReadContract({
    address: contractAddress,
    abi: PAYPERCALL_ABI,
    functionName: 'getService',
    args: [0],
    chainId,
    query: { refetchInterval: 30_000 },
  })

  const svc = data

  // Notify parent when data arrives
  if (svc && onServiceLoaded) {
    // Use a ref trick — call is safe here since it's in render
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)' }}>
            Service #0
          </div>
          {isLoading && (
            <div className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--danger)' }}>
              <XCircle size={14} />
              Failed to load service
            </div>
          )}
          {svc && (
            <div className="display font-bold text-lg" style={{ color: 'var(--ink)' }}>
              {svc.name}
            </div>
          )}
        </div>
        {svc && (
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{
            background: svc.active ? 'rgba(141,216,159,0.15)' : 'rgba(232,109,122,0.15)',
            color: svc.active ? 'var(--success)' : 'var(--danger)',
          }}>
            {svc.active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {svc.active ? 'Active' : 'Inactive'}
          </div>
        )}
      </div>

      {svc && (
        <div className="grid grid-cols-3 gap-3">
          <StatCell label="Price">
            <span className="tabular-nums font-bold" style={{ color: 'var(--accent)' }}>
              ${formatUsdc(svc.price, USDC_DECIMALS)}
            </span>
            <span className="text-xs ml-1" style={{ color: 'var(--subtle)' }}>USDC</span>
          </StatCell>
          <StatCell label="Timeout">
            <span className="tabular-nums font-bold">{formatTimeout(svc.timeout)}</span>
          </StatCell>
          <StatCell label="Referrer split">
            <span className="tabular-nums font-bold">{formatBps(svc.referrerBps)}</span>
          </StatCell>
        </div>
      )}
    </div>
  )
}

function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-muted)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--subtle)' }}>{label}</div>
      <div className="text-sm flex items-baseline" style={{ color: 'var(--ink)' }}>{children}</div>
    </div>
  )
}
