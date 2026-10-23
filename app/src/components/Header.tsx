import { useAccount, useSwitchChain, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import {
  USDC_ADDRESS, USDC_DECIMALS, ARC_CHAIN_IDS, getChainLabel,
  getExplorerBase, isDeployed, PAYPERCALL,
} from '../config'
import { formatUsdc, formatAddress } from '../lib/utils'
import { ExternalLink } from 'lucide-react'

export function Header() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()

  const { data: usdcBal } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chainId as number,
    query: { enabled: !!address && (chainId === 5042 || chainId === 5042002), refetchInterval: 10_000 },
  })

  const explorerBase = getExplorerBase(chainId ?? 5042002)
  const contractAddr = chainId ? PAYPERCALL[chainId] : undefined

  return (
    <header className="sticky top-0 z-30 border-b" style={{ borderColor: 'var(--border)', background: 'rgba(13,27,47,0.85)', backdropFilter: 'blur(16px)' }}>
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        {/* Brand */}
        <div className="flex-1 min-w-0">
          <div className="display font-bold text-sm sm:text-base" style={{ color: 'var(--ink)' }}>
            DevX PayPerCall
          </div>
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>Made by DevX</div>
        </div>

        {/* Network selector */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--surface-muted)' }}>
          {ARC_CHAIN_IDS.map((cid) => (
            <button
              key={cid}
              onClick={() => switchChain({ chainId: cid })}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: chainId === cid ? 'var(--surface-strong)' : 'transparent',
                color: chainId === cid ? 'var(--ink)' : 'var(--subtle)',
                border: chainId === cid ? '1px solid var(--border-strong)' : '1px solid transparent',
              }}
            >
              {getChainLabel(cid)}
            </button>
          ))}
        </div>

        {/* USDC balance + connect */}
        <div className="flex items-center gap-2">
          {isConnected && address && (chainId === 5042 || chainId === 5042002) && (
            <div className="hidden sm:flex flex-col items-end">
              <span className="tabular-nums text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {usdcBal !== undefined ? formatUsdc(usdcBal, USDC_DECIMALS) : '—'} USDC
              </span>
              <a
                href={`${explorerBase}/address/${address}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-xs hover:underline"
                style={{ color: 'var(--subtle)' }}
              >
                {formatAddress(address)}
                <ExternalLink size={10} />
              </a>
            </div>
          )}
          <ConnectKitButton
            customTheme={{
              '--ck-font-family': "'DM Sans', sans-serif",
              '--ck-primary-button-background': 'var(--surface-strong)',
              '--ck-primary-button-color': 'var(--ink)',
              '--ck-primary-button-border-radius': '12px',
              '--ck-body-background': '#0d1b2f',
              '--ck-body-color': 'var(--ink)',
              '--ck-modal-heading-font-weight': '600',
            }}
          />
        </div>
      </div>

      {/* Contract address bar */}
      {(chainId === 5042 || chainId === 5042002) && contractAddr && isDeployed(chainId) && (
        <div className="border-t max-w-5xl mx-auto px-4 py-1.5 flex items-center gap-1.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--subtle)' }}>
          <span>Contract:</span>
          <a
            href={buildAddressLink(explorerBase, contractAddr)}
            target="_blank" rel="noopener noreferrer"
            className="mono hover:underline flex items-center gap-1"
            style={{ color: 'var(--accent)' }}
          >
            {contractAddr}
            <ExternalLink size={10} />
          </a>
        </div>
      )}
    </header>
  )
}

function buildAddressLink(explorerBase: string, address: string) {
  return `${explorerBase}/address/${address}`
}
