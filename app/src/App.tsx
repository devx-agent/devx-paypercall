import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { Header } from './components/Header'
import { ServiceCard } from './components/ServiceCard'
import { CheckForm } from './components/CheckForm'
import { CallStatus } from './components/CallStatus'
import { RecentCalls } from './components/RecentCalls'
import { Footer } from './components/Footer'
import { PAYPERCALL, getChainLabel, isDeployed } from './config'
import { PAYPERCALL_ABI } from './lib/paypercall'
import { AlertCircle } from 'lucide-react'

export default function App() {
  const { chainId, isConnected } = useAccount()

  // Default to Arc Mainnet (the live deployment) if wallet isn't connected or is on another chain
  const effectiveChainId: number = (chainId === 5042 || chainId === 5042002) ? chainId : 5042
  const contractAddress = PAYPERCALL[effectiveChainId]
  const deployed = isDeployed(effectiveChainId)

  // Price from service #0
  const { data: serviceData } = useReadContract({
    address: contractAddress,
    abi: PAYPERCALL_ABI,
    functionName: 'getService',
    args: [0],
    chainId: effectiveChainId,
    query: { enabled: deployed },
  })
  const price = serviceData ? (serviceData as { price: bigint }).price : 10_000n // fallback 0.01 USDC

  // Track the most recent callId for status display
  const [callId, setCallId] = useState<bigint | null>(null)
  const [requestTxHash] = useState<`0x${string}` | undefined>()

  // When the user gets a new callId from CheckForm, store it
  function handleCallId(id: bigint) {
    setCallId(id)
  }

  const wrongNetwork = isConnected && chainId !== undefined && chainId !== 5042 && chainId !== 5042002

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Wrong network banner */}
        {wrongNetwork && (
          <div className="flex items-center gap-3 rounded-2xl px-5 py-4" style={{ background: 'rgba(232,109,122,0.1)', border: '1px solid rgba(232,109,122,0.25)' }}>
            <AlertCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Wrong network</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                This app runs on Arc Testnet or Arc Mainnet. Use the network switcher in the header.
              </p>
            </div>
          </div>
        )}

        {/* Not deployed banner */}
        {!deployed && (
          <div className="rounded-2xl px-5 py-6 text-center space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>Not deployed on {getChainLabel(effectiveChainId)}</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              PayPerCall has not been deployed to this network yet. Switch to Arc Testnet to try it.
            </p>
          </div>
        )}

        {deployed && (
          <>
            {/* Top row: service card + check form side by side on wider screens */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ServiceCard
                contractAddress={contractAddress}
                chainId={effectiveChainId}
              />
              <CheckForm
                contractAddress={contractAddress}
                chainId={effectiveChainId}
                price={price}
                onCallId={handleCallId}
              />
            </div>

            {/* Live call status */}
            {callId !== null && (
              <CallStatus
                callId={callId}
                chainId={effectiveChainId}
                requestTxHash={requestTxHash}
              />
            )}

            {/* Recent calls */}
            <RecentCalls chainId={effectiveChainId} />
          </>
        )}
      </main>

      <Footer chainId={effectiveChainId} />
    </div>
  )
}
