import type { PublicClient } from 'viem'

/** Arc RPCs cap eth_getLogs at 10k blocks: scan newest-first in 9,999-block windows
 *  from `latest` back to `fromBlock`, stopping once `want` logs are found. */
export async function getLogsChunked(
  client: PublicClient,
  params: Record<string, unknown>,
  fromBlock: bigint,
  want = 20,
  maxWindows = 200,
) {
  const latest = await client.getBlockNumber()
  const out: any[] = []
  let to = latest
  for (let i = 0; i < maxWindows && to >= fromBlock; i++) {
    const from = to > 9_998n + fromBlock ? to - 9_998n : fromBlock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = await client.getLogs({ ...(params as any), fromBlock: from, toBlock: to })
    out.unshift(...logs)
    if (out.length >= want) break
    if (from === 0n) break
    to = from - 1n
  }
  return out
}
