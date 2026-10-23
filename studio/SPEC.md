# DevX PayPerCall: contract spec (context file for Arc Studio)

Escrowed USDC pay-per-call for AI agents and paid APIs on Arc. An agent (payer) escrows the exact price of one API
call. The service operator delivers the answer off-chain and settles on-chain with a hash of the exact response body.
Payment is split provider/referrer. If the operator rejects or misses the deadline, the payer is refunded in full.

## Token
USDC ERC-20 interface on Arc: `0x3600000000000000000000000000000000000000` (6 decimals, same address on testnet and
mainnet; it shares the balance with native gas USDC, which has 18 decimals. The contract only uses the 6-dec ERC-20).
The constructor takes the USDC address so tests can use a mock. It supports EIP-3009 `receiveWithAuthorization`.

## Interface (must match exactly; our reference test suite compiles against it)
```solidity
contract PayPerCall {
  enum Status { None, Open, Fulfilled, Refunded }
  struct Service { address provider; address operator; uint96 price; uint32 timeout; uint16 referrerBps; bool active; string name; string endpoint; }
  struct Call { address payer; uint64 deadline; Status status; uint32 serviceId; address referrer; uint96 amount; bytes32 requestHash; bytes32 resultHash; }
  uint16 public constant MAX_REFERRER_BPS = 5000; uint32 public constant MIN_TIMEOUT = 60; uint32 public constant MAX_TIMEOUT = 7 days; uint256 public constant MAX_REQUEST_BYTES = 256;
  IUSDC public immutable usdc;
  constructor(address usdc_);
  function registerService(string name, string endpoint, address operator, uint96 price, uint32 timeout, uint16 referrerBps) returns (uint32 id); // provider = msg.sender
  function updateService(uint32 id, address operator, uint96 price, uint32 timeout, uint16 referrerBps, bool active); // provider only
  function requestCall(uint32 serviceId, string request, address referrer, uint96 maxPrice) returns (uint256 callId); // transferFrom payer
  function authNonce(uint32 serviceId, bytes32 requestHash, address referrer, address payer, uint96 price) view returns (bytes32);
      // = keccak256(abi.encode(block.chainid, address(this), serviceId, requestHash, referrer, payer, price))
  function requestCallWithAuthorization(uint32 serviceId, string request, address referrer, address payer, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) returns (uint256 callId);
      // gasless x402-style path: anyone relays the payer's EIP-3009 signature; nonce MUST equal authNonce(...) so a relayer cannot re-point the payment
  function fulfill(uint256 callId, bytes32 resultHash, string resultURI); // operator or provider, Open, before deadline; pays provider (price - referrer cut) and referrer (price*bps/1e4)
  function reject(uint256 callId, string reason); // operator or provider; full refund to payer
  function refundExpired(uint256 callId); // anyone, after deadline; full refund to payer
  function serviceCount() view returns (uint256); function callCount() view returns (uint256);
  function getService(uint32 id) view returns (Service); function getCall(uint256 id) view returns (Call);
  event ServiceRegistered(uint32 indexed serviceId, address indexed provider, address operator, uint96 price, string name, string endpoint);
  event ServiceUpdated(uint32 indexed serviceId, address operator, uint96 price, uint32 timeout, uint16 referrerBps, bool active);
  event CallRequested(uint256 indexed callId, uint32 indexed serviceId, address indexed payer, address referrer, uint96 amount, bytes32 requestHash, uint64 deadline, string request);
  event CallFulfilled(uint256 indexed callId, bytes32 resultHash, string resultURI, uint96 providerAmount, uint96 referrerAmount);
  event CallRefunded(uint256 indexed callId, address indexed by, string reason);
}
```
Custom errors (the reference tests match on these selectors):
`Reentrancy() BadParam() UnknownService() ServiceInactive() PriceAboveMax(uint96 price, uint96 maxPrice) NotProvider() NotOperator() NotOpen() DeadlinePassed() DeadlineNotReached() BadNonce() TransferFailed()`.
Unknown callId → NotOpen. fulfill after the deadline → DeadlinePassed (deadline = request timestamp + timeout; fulfill allowed while block.timestamp <= deadline, refundExpired only when block.timestamp > deadline).
Bad params (operator 0, price 0, timeout out of range, bps too high, empty/oversized request, referrer == payer, payer 0) → BadParam.

## Rules / invariants
- Escrow conservation: contract USDC balance == sum of `amount` over Open calls, always.
- Each call settles exactly once (Fulfilled or Refunded). No double settle.
- price > 0; MIN_TIMEOUT ≤ timeout ≤ MAX_TIMEOUT; referrerBps ≤ MAX_REFERRER_BPS; operator ≠ 0.
- requestCall reverts if service inactive/unknown, price > maxPrice (front-run guard), request empty or > 256 bytes, or referrer == payer (self-referral).
- referrer == address(0) → provider gets 100%.
- Arc: sends to address(0) revert, and USDC has a blocklist. If the provider is blocklisted, fulfill reverts; the payer can still recover through refundExpired after the deadline.
- Reentrancy guard on all state-changing USDC paths; checks-effects-interactions.
- No owner, no admin keys, no upgradeability, no fees to DevX beyond the optional referrer split.

## Service #0 (registered by the deploy script)
name "DevX Token Check", endpoint https://tokencheck.madebydevx.com/v1/token/verdict, price 10000 (0.01 USDC), timeout 600 s,
referrerBps 1000 (10%). Request format: `<chain>:<tokenAddress>` e.g. `base:0x8335…2913`. Off-chain fulfiller calls
`GET https://tokencheck.madebydevx.com/v1/token/free?chain=<chain>&address=<token>` (CORS *), fulfills with
`keccak256(exact response body)` and `resultURI = page_url`; rejects (refund) on non-200.
