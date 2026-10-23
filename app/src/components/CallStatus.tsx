import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { keccak256, toBytes, createPublicClient, http, parseAbiItem } from 'viem'
import { PAYPERCALL_ABI } from '../lib/paypercall'
import { formatUsdc, formatCountdown } from '../lib/utils'
import { USDC_DECIMALS, getExplorerBase, PAYPERCALL, DEPLOY_BLOCK } from '../config'
import { getLogsChunked } from '../lib/logs'
import { Loader2, CheckCircle2, XCircle, Clock, ExternalLink, ShieldCheck, ShieldAlert } from 'lucide-react'

const CALL_FULFILLED_ABI = parseAbiItem(
  'event CallFulfilled(uint256 indexed callId, bytes32 resultHash, string resultURI, uint96 providerAmount, uint96 referrerAmount)'
)

interface Props {
  callId: bigint
  chainId: number
  requestTxHash: `0x${string}` | undefined
}

interface VerdictData {
  grade?: string
  summary?: string
  [key: string]: unknown
}

type HashMatch = 'match' | 'changed' | 'pending'

export function CallStatus({ callId, chainId, requestTxHash }: Props) {
  const explorerBase = getExplorerBase(chainId)
  const contractAddress = PAYPERCALL[chainId]

  const [now, setNow] = useState(BigInt(Math.floor(Date.now() / 1000)))
  const [verdict, setVerdict] = useState<VerdictData | null>(null)
  const [verdictBody, setVerdictBody] = useState<string>('')
  const [hashMatch, setHashMatch] = useState<HashMatch>('pending')
  const [settleTxHash, setSettleTxHash] = useState<`0x${string}` | undefined>()
  const [providerAmount, setProviderAmount] = useState<bigint | undefined>()
  const [referrerAmount, setReferrerAmount] = useState<bigint | undefined>()
  const [resultURI, setResultURI] = useState<string>('')
  const [fetchedVerdictFor, setFetchedVerdictFor] = useState<string>('')

  // Poll call state every 2s
  const { data: callData } = useReadContract({
    address: contractAddress,
    abi: PAYPERCALL_ABI,
    functionName: 'getCall',
    args: [callId],
    chainId,
    query: { refetchInterval: 2_000 },
  })

  type _CallData = { payer: `0x${string}`; deadline: bigint; status: number; serviceId: number; referrer: `0x${string}`; amount: bigint; requestHash: `0x${string}`; resultHash: `0x${string}` }
  const c = callData

  // Tick countdown every second
  useEffect(() => {
    const id = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 1_000)
    return () => clearInterval(id)
  }, [])

  // When fulfilled, fetch the CallFulfilled event for resultURI + amounts
  useEffect(() => {
    if (c?.status !== 2 || !contractAddress || resultURI) return
    const rpcUrl = chainId === 5042 ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io'
    const client = createPublicClient({ transport: http(rpcUrl) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void getLogsChunked(client as any, {
      address: contractAddress,
      event: CALL_FULFILLED_ABI,
      args: { callId },
    }, DEPLOY_BLOCK[chainId] ?? 0n, 1).then((logs) => {
      if (logs.length === 0) return
      const log = logs[0]
      const args = log.args
      setResultURI(args.resultURI ?? '')
      setProviderAmount(args.providerAmount)
      setReferrerAmount(args.referrerAmount)
      const tx = log.transactionHash
      if (tx) setSettleTxHash(tx)
    }).catch(() => { /* ignore network errors */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.status, contractAddress])

  // When we have resultURI + resultHash, fetch verdict and check hash
  useEffect(() => {
    if (!resultURI || !c?.resultHash || fetchedVerdictFor === resultURI) return
    setFetchedVerdictFor(resultURI)

    // Try to parse chain + address from resultURI query params
    try {
      const url = new URL(resultURI)
      const chain = url.searchParams.get('chain') ?? ''
      const addr = url.searchParams.get('address') ?? url.searchParams.get('token') ?? ''
      if (chain && addr) {
        const apiUrl = `https://tokencheck.madebydevx.com/v1/token/free?chain=${chain}&address=${addr}`
        void fetch(apiUrl)
          .then(r => r.text())
          .then(body => {
            const hash = keccak256(toBytes(body))
            setVerdictBody(body)
            try {
              setVerdict(JSON.parse(body) as VerdictData)
            } catch {
              setVerdict({ summary: body })
            }
            setHashMatch(hash === c.resultHash ? 'match' : 'changed')
          })
          .catch(() => setHashMatch('changed'))
      }
    } catch { /* ignore URL parse errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultURI, c?.resultHash])

  if (!c) return (
    <div className="rounded-2xl p-5 flex items-center gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
      <Loader2 size={14} className="animate-spin" />
      <span className="text-sm">Loading call #{callId.toString()}…</span>
    </div>
  )

  const status = c.status
  const isOpen = status === 1
  const isFulfilled = status === 2
  const isRefunded = status === 3

  const isExpired = c.deadline > 0n && now > c.deadline

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      {/* Status banner */}
      <div className="px-5 py-3 flex items-center justify-between" style={{
        background: isFulfilled ? 'rgba(141,216,159,0.12)' : isRefunded ? 'rgba(232,109,122,0.12)' : 'rgba(172,198,233,0.10)',
      }}>
        <div className="flex items-center gap-2 font-semibold text-sm">
          {isOpen && <><Clock size={14} style={{ color: 'var(--accent)' }} /><span style={{ color: 'var(--accent)' }}>Open — awaiting fulfiller</span></>}
          {isFulfilled && <><CheckCircle2 size={14} style={{ color: 'var(--success)' }} /><span style={{ color: 'var(--success)' }}>Fulfilled</span></>}
          {isRefunded && <><XCircle size={14} style={{ color: 'var(--danger)' }} /><span style={{ color: 'var(--danger)' }}>Refunded</span></>}
        </div>
        <span className="text-xs mono" style={{ color: 'var(--subtle)' }}>Call #{callId.toString()}</span>
      </div>

      <div className="p-5 space-y-4">
        {/* Countdown */}
        {isOpen && (
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            {isExpired ? (
              <span style={{ color: 'var(--warning)' }}>Deadline passed — call refundExpired to reclaim USDC</span>
            ) : (
              <span>Deadline in <span className="tabular-nums font-semibold mono" style={{ color: 'var(--ink)' }}>{formatCountdown(c.deadline)}</span></span>
            )}
          </div>
        )}

        {/* Verdict (fulfilled only) */}
        {isFulfilled && verdict && (
          <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-muted)' }}>
            {verdict.grade !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>Grade</span>
                <span className="display font-bold text-lg" style={{ color: 'var(--ink)' }}>{String(verdict.grade)}</span>
              </div>
            )}
            {verdict.summary && (
              <p className="text-sm" style={{ color: 'var(--muted)', maxWidth: '60ch' }}>{String(verdict.summary)}</p>
            )}
            {/* Hash match indicator */}
            <div className="flex items-center gap-1.5 text-xs mt-2">
              {hashMatch === 'match' && (
                <><ShieldCheck size={13} style={{ color: 'var(--success)' }} /><span style={{ color: 'var(--success)' }}>Hash matches onchain</span></>
              )}
              {hashMatch === 'changed' && (
                <><ShieldAlert size={13} style={{ color: 'var(--warning)' }} /><span style={{ color: 'var(--warning)' }}>Result changed since settlement</span></>
              )}
              {hashMatch === 'pending' && verdictBody === '' && (
                <><Loader2 size={12} className="animate-spin" style={{ color: 'var(--subtle)' }} /><span style={{ color: 'var(--subtle)' }}>Verifying hash…</span></>
              )}
            </div>
          </div>
        )}

        {/* Receipt */}
        <div className="space-y-2">
          {requestTxHash && (
            <ReceiptRow label="Request tx">
              <TxLink explorerBase={explorerBase} hash={requestTxHash} />
            </ReceiptRow>
          )}
          {settleTxHash && (
            <ReceiptRow label="Settle tx">
              <TxLink explorerBase={explorerBase} hash={settleTxHash} />
            </ReceiptRow>
          )}
          {providerAmount !== undefined && (
            <ReceiptRow label="Provider received">
              <span className="tabular-nums">${formatUsdc(providerAmount, USDC_DECIMALS)} USDC</span>
            </ReceiptRow>
          )}
          {referrerAmount !== undefined && referrerAmount > 0n && (
            <ReceiptRow label="Referrer received">
              <span className="tabular-nums">${formatUsdc(referrerAmount, USDC_DECIMALS)} USDC</span>
            </ReceiptRow>
          )}
          {isRefunded && (
            <ReceiptRow label="Refunded to">
              <span className="mono text-xs">{c.payer.slice(0, 6)}…{c.payer.slice(-4)}</span>
            </ReceiptRow>
          )}
        </div>
      </div>
    </div>
  )
}

function ReceiptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      <span style={{ color: 'var(--ink)' }}>{children}</span>
    </div>
  )
}

function TxLink({ explorerBase, hash }: { explorerBase: string; hash: string }) {
  return (
    <a
      href={`${explorerBase}/tx/${hash}`}
      target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1 mono text-xs hover:underline"
      style={{ color: 'var(--accent)' }}
    >
      {hash.slice(0, 10)}…{hash.slice(-6)}
      <ExternalLink size={10} />
    </a>
  )
}
