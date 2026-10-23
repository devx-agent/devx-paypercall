import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { PAYPERCALL_ABI } from '../lib/paypercall'
import { USDC_ADDRESS, REFERRER, TOKEN_CHAINS, getChainLabel } from '../config'
import { parseOnchainError } from '../lib/utils'
import { toast } from 'sonner'
import { Loader2, AlertCircle } from 'lucide-react'

interface Props {
  contractAddress: `0x${string}`
  chainId: number
  price: bigint
  onCallId: (id: bigint) => void
}

type Step = 'idle' | 'approving' | 'approve-confirming' | 'requesting' | 'request-confirming' | 'done' | 'error'

export function CheckForm({ contractAddress, chainId, price, onCallId }: Props) {
  const { address, chainId: walletChain } = useAccount()
  const { switchChain } = useSwitchChain()

  const [tokenChain, setTokenChain] = useState('base')
  const [tokenAddr, setTokenAddr] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const wrongChain = walletChain !== chainId

  // --- Read allowance ---
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, contractAddress] : undefined,
    chainId,
    query: { enabled: !!address },
  })

  const needsApproval = allowance !== undefined ? (allowance) < price : true

  // --- Approve ---
  const { writeContract: approve, data: approveTx, error: approveErr } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTx })

  // --- RequestCall ---
  const { writeContract: requestCall, data: requestTx, error: requestErr } = useWriteContract()
  const { isLoading: requestConfirming, isSuccess: requestSuccess, data: requestReceipt } = useWaitForTransactionReceipt({ hash: requestTx })

  // Handle approve success → proceed to request
  useEffect(() => {
    if (approveSuccess && step === 'approve-confirming') {
      void refetchAllowance().then(() => {
        setStep('requesting')
        doRequestCall()
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess])

  // Handle request confirmed
  useEffect(() => {
    if (requestSuccess && requestReceipt && step === 'request-confirming') {
      // Find the CallRequested log — callId is the first indexed topic (topics[1])
      let callId: bigint | undefined
      for (const log of requestReceipt.logs) {
        // CallRequested event signature keccak256
        if (log.topics[0] === '0x0c3f0f0a7e9a8e65cd2af6d0e614827af37b048f70038b3f0e99e62f63b6c4d5') {
          callId = BigInt(log.topics[1] ?? '0x0')
          break
        }
        // fallback: check address matches contract and use topics[1]
        if (log.address.toLowerCase() === contractAddress.toLowerCase() && log.topics.length >= 2) {
          try { callId = BigInt(log.topics[1]!) } catch { /* */ }
          break
        }
      }
      if (callId !== undefined) {
        onCallId(callId)
      }
      setStep('done')
      toast.success('Call requested! Waiting for the fulfiller…')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSuccess])

  // Handle errors
  useEffect(() => {
    if (approveErr && step === 'approving') {
      setErrorMsg(parseOnchainError(approveErr))
      setStep('error')
    }
  }, [approveErr, step])

  useEffect(() => {
    if (requestErr && (step === 'requesting' || step === 'request-confirming')) {
      setErrorMsg(parseOnchainError(requestErr))
      setStep('error')
    }
  }, [requestErr, step])

  // Track approve confirming
  useEffect(() => {
    if (approveTx && approveConfirming && step === 'approving') setStep('approve-confirming')
  }, [approveTx, approveConfirming, step])

  // Track request confirming
  useEffect(() => {
    if (requestTx && requestConfirming && step === 'requesting') setStep('request-confirming')
  }, [requestTx, requestConfirming, step])

  function doRequestCall() {
    const request = `${tokenChain}:${tokenAddr.trim()}`
    requestCall({
      address: contractAddress,
      abi: PAYPERCALL_ABI,
      functionName: 'requestCall',
      args: [0, request, REFERRER, price],
      chainId,
    })
  }

  function handleSubmit() {
    if (!address) { toast.error('Connect your wallet first'); return }
    if (wrongChain) { switchChain({ chainId: chainId }); return }
    if (!tokenAddr.trim() || !tokenAddr.startsWith('0x')) {
      setErrorMsg('Enter a valid token address starting with 0x')
      setStep('error')
      return
    }
    setErrorMsg('')
    setStep('idle')

    if (needsApproval) {
      setStep('approving')
      approve({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contractAddress, price],
        chainId,
      })
    } else {
      setStep('requesting')
      doRequestCall()
    }
  }

  const isWorking = ['approving', 'approve-confirming', 'requesting', 'request-confirming'].includes(step)

  const stepLabel = {
    idle: `Pay $0.01 USDC & check`,
    approving: 'Confirm approval in wallet…',
    'approve-confirming': 'Approving USDC…',
    requesting: 'Confirm request in wallet…',
    'request-confirming': 'Sending request…',
    done: 'Request sent!',
    error: 'Retry',
  }[step]

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h2 className="display font-bold text-base mb-4" style={{ color: 'var(--ink)' }}>
        Check a Token
      </h2>

      <div className="space-y-3">
        {/* Chain + address row */}
        <div className="flex gap-2">
          <select
            value={tokenChain}
            onChange={e => setTokenChain(e.target.value)}
            disabled={isWorking}
            className="rounded-xl px-3 py-2.5 text-sm font-medium outline-none cursor-pointer"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)', minWidth: 110 }}
          >
            {TOKEN_CHAINS.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={tokenAddr}
            onChange={e => { setTokenAddr(e.target.value); if (step === 'error') setStep('idle') }}
            placeholder="0x token address"
            disabled={isWorking}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm mono outline-none"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)', minWidth: 0 }}
          />
        </div>

        {/* Request preview */}
        {tokenAddr && (
          <div className="text-xs px-3 py-2 rounded-lg mono" style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>
            {tokenChain}:{tokenAddr.trim()}
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="flex items-start gap-2 text-sm px-3 py-2.5 rounded-xl" style={{ background: 'rgba(232,109,122,0.1)', color: 'var(--danger)' }}>
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Wrong chain warning */}
        {wrongChain && address && (
          <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(240,192,112,0.1)', color: 'var(--warning)', border: '1px solid rgba(240,192,112,0.2)' }}>
            You are on chain {walletChain} — click the button to switch to {getChainLabel(chainId)}.
          </div>
        )}

        {/* CTA */}
        <button
          onClick={wrongChain ? () => switchChain({ chainId: chainId }) : handleSubmit}
          disabled={isWorking || !address}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-sm transition-all"
          style={{
            background: isWorking ? 'var(--surface-muted)' : 'var(--accent)',
            color: isWorking ? 'var(--subtle)' : '#0d1b2f',
            cursor: isWorking || !address ? 'not-allowed' : 'pointer',
            border: 'none',
          }}
        >
          {isWorking && <Loader2 size={14} className="animate-spin" />}
          {!address ? 'Connect wallet to check' : wrongChain ? `Switch to ${getChainLabel(chainId)}` : stepLabel}
        </button>

        {/* Approval note */}
        {needsApproval && !isWorking && address && !wrongChain && (
          <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
            One approval + one request — two wallet confirmations.
          </p>
        )}
      </div>
    </div>
  )
}
