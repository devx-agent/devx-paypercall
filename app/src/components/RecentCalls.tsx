import { useState, useEffect } from 'react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { PAYPERCALL, getExplorerBase, DEPLOY_BLOCK } from '../config'
import { getLogsChunked } from '../lib/logs'
import { formatUsdc, formatAddress } from '../lib/utils'
import { USDC_DECIMALS } from '../config'
import { Loader2, ExternalLink, RefreshCw } from 'lucide-react'

interface Props {
  chainId: number
}

interface RecentCall {
  callId: bigint
  payer: `0x${string}`
  amount: bigint
  request: string
  deadline: bigint
  blockNumber: bigint
  txHash: `0x${string}`
  status?: number // fetched separately
}

const CALL_REQUESTED_ABI = parseAbiItem(
  'event CallRequested(uint256 indexed callId, uint32 indexed serviceId, address indexed payer, address referrer, uint96 amount, bytes32 requestHash, uint64 deadline, string request)'
)

export function RecentCalls({ chainId }: Props) {
  const [calls, setCalls] = useState<RecentCall[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastFetch, setLastFetch] = useState(0)

  const explorerBase = getExplorerBase(chainId)
  const contractAddress = PAYPERCALL[chainId]

  async function fetchCalls() {
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') return
    setLoading(true)
    setError('')
    try {
      const rpcUrl = chainId === 5042 ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io'
      const client = createPublicClient({ transport: http(rpcUrl) })

      // Scan back to the deployment block in 9,999-block windows (Arc getLogs limit = 10k)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await getLogsChunked(client as any, {
        address: contractAddress,
        event: CALL_REQUESTED_ABI,
      }, DEPLOY_BLOCK[chainId] ?? 0n, 20)

      const parsed: RecentCall[] = logs
        .slice(-20) // show 20 most recent
        .reverse()
        .map(log => ({
          callId: (log.args.callId as bigint),
          payer: (log.args.payer as `0x${string}`),
          amount: (log.args.amount as bigint),
          request: (log.args.request as string) ?? '',
          deadline: (log.args.deadline as bigint) ?? 0n,
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? '0x',
        }))

      setCalls(parsed)
      setLastFetch(Date.now())
    } catch (e) {
      setError('Failed to load recent calls')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Initial load + refresh every 30s
  useEffect(() => {
    void fetchCalls()
    const id = setInterval(() => { void fetchCalls() }, 30_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, contractAddress])

  const isEmpty = calls.length === 0 && !loading

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="display font-bold text-base" style={{ color: 'var(--ink)' }}>Recent Calls</h2>
        <button
          onClick={() => { void fetchCalls() }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
          style={{ background: 'var(--surface-muted)', color: 'var(--subtle)', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="px-5 py-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</div>
      )}

      {isEmpty && !error && (
        <div className="px-5 py-8 text-sm text-center" style={{ color: 'var(--subtle)' }}>
          No calls yet.
        </div>
      )}

      {loading && calls.length === 0 && (
        <div className="px-5 py-8 flex items-center justify-center gap-2" style={{ color: 'var(--subtle)' }}>
          <Loader2 size={14} className="animate-spin" />
          <span className="text-sm">Scanning recent blocks…</span>
        </div>
      )}

      {calls.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Call', 'Request', 'Payer', 'Amount', 'Tx'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.map(c => (
                <tr key={c.callId.toString()} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-3 mono text-xs" style={{ color: 'var(--accent)' }}>#{c.callId.toString()}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="mono text-xs" style={{ color: 'var(--muted)' }} title={c.request}>
                      {c.request.length > 32 ? c.request.slice(0, 30) + '…' : c.request}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`${explorerBase}/address/${c.payer}`}
                      target="_blank" rel="noopener noreferrer"
                      className="mono text-xs hover:underline"
                      style={{ color: 'var(--muted)' }}
                    >
                      {formatAddress(c.payer)}
                    </a>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs" style={{ color: 'var(--ink)' }}>
                    ${formatUsdc(c.amount, USDC_DECIMALS)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`${explorerBase}/tx/${c.txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 mono text-xs hover:underline"
                      style={{ color: 'var(--subtle)' }}
                    >
                      {c.txHash.slice(0, 8)}…
                      <ExternalLink size={10} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastFetch > 0 && (
        <div className="px-5 py-2 text-xs" style={{ color: 'var(--subtle)', borderTop: '1px solid var(--border)' }}>
          Last updated {new Date(lastFetch).toLocaleTimeString()} · since deployment
        </div>
      )}
    </div>
  )
}
