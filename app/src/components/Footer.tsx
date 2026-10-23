import { ExternalLink } from 'lucide-react'
import { PAYPERCALL, getExplorerBase } from '../config'

interface Props {
  chainId: number
}

export function Footer({ chainId }: Props) {
  const explorerBase = getExplorerBase(chainId)
  const contractAddr = PAYPERCALL[chainId]

  return (
    <footer className="mt-12 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* How it works */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>How it works</h3>
          <ol className="space-y-1">
            {[
              'Escrow — your USDC is locked in the contract when you submit a token check request.',
              'Verdict — our off-chain fulfiller calls the tokencheck API and commits a keccak256 hash of the response body onchain.',
              'Split or refund — on fulfillment the price is split between the provider and referrer; if the deadline passes the full amount is returned to you.',
            ].map((line, i) => (
              <li key={i} className="flex gap-2 text-sm" style={{ color: 'var(--muted)' }}>
                <span className="tabular-nums font-semibold shrink-0" style={{ color: 'var(--subtle)' }}>{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-4 text-xs">
          {contractAddr && contractAddr !== '0x0000000000000000000000000000000000000000' && (
            <FooterLink href={`${explorerBase}/address/${contractAddr}`} label="Contract on explorer" />
          )}
          <FooterLink href="https://github.com/madebydevx" label="GitHub" />
          <FooterLink href="https://tokencheck.madebydevx.com" label="tokencheck.madebydevx.com" />
        </div>

        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          Built with <a href="https://studio.arc.io" target="_blank" rel="noopener noreferrer" className="hover:underline">Arc Studio</a> · DevX 2026
        </p>
      </div>
    </footer>
  )
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1 hover:underline"
      style={{ color: 'var(--muted)' }}
    >
      {label}
      <ExternalLink size={10} />
    </a>
  )
}
