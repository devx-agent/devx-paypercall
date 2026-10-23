// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

interface IUSDC {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

// ---------------------------------------------------------------------------
// PayPerCall — Escrowed USDC pay-per-call for AI agents and paid APIs on Arc
// ---------------------------------------------------------------------------

/// @title  PayPerCall
/// @notice One call escrows the exact service price. The operator fulfills with
///         a result hash (splitting to provider + optional referrer) or rejects
///         (full refund). Anyone may trigger a refund after the deadline.
///         No owner, no admin keys, no upgradeability.
contract PayPerCall {
    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    enum Status { None, Open, Fulfilled, Refunded }

    struct Service {
        address provider;
        address operator;
        uint96  price;
        uint32  timeout;
        uint16  referrerBps;
        bool    active;
        string  name;
        string  endpoint;
    }

    struct Call {
        address  payer;
        uint64   deadline;
        Status   status;
        uint32   serviceId;
        address  referrer;
        uint96   amount;
        bytes32  requestHash;
        bytes32  resultHash;
    }

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    uint16  public constant MAX_REFERRER_BPS  = 5000;
    uint32  public constant MIN_TIMEOUT       = 60;
    uint32  public constant MAX_TIMEOUT       = 7 days;
    uint256 public constant MAX_REQUEST_BYTES = 256;

    // -----------------------------------------------------------------------
    // Immutables
    // -----------------------------------------------------------------------

    IUSDC public immutable usdc;

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    Service[] private _services;
    Call[]    private _calls;
    uint8     private _locked; // 0 = unlocked, 1 = locked

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error Reentrancy();
    error BadParam();
    error UnknownService();
    error ServiceInactive();
    error PriceAboveMax(uint96 price, uint96 maxPrice);
    error NotProvider();
    error NotOperator();
    error NotOpen();
    error DeadlinePassed();
    error DeadlineNotReached();
    error BadNonce();
    error TransferFailed();

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event ServiceRegistered(
        uint32 indexed serviceId,
        address indexed provider,
        address operator,
        uint96 price,
        string name,
        string endpoint
    );

    event ServiceUpdated(
        uint32 indexed serviceId,
        address operator,
        uint96 price,
        uint32 timeout,
        uint16 referrerBps,
        bool   active
    );

    event CallRequested(
        uint256 indexed callId,
        uint32  indexed serviceId,
        address indexed payer,
        address referrer,
        uint96  amount,
        bytes32 requestHash,
        uint64  deadline,
        string  request
    );

    event CallFulfilled(
        uint256 indexed callId,
        bytes32 resultHash,
        string  resultURI,
        uint96  providerAmount,
        uint96  referrerAmount
    );

    event CallRefunded(
        uint256 indexed callId,
        address indexed by,
        string  reason
    );

    // -----------------------------------------------------------------------
    // Reentrancy guard
    // -----------------------------------------------------------------------

    modifier nonReentrant() {
        if (_locked != 0) revert Reentrancy();
        _locked = 1;
        _;
        _locked = 0;
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert BadParam();
        usdc = IUSDC(usdc_);
    }

    // -----------------------------------------------------------------------
    // Service management
    // -----------------------------------------------------------------------

    /// @notice Register a new service. The caller becomes the provider.
    function registerService(
        string calldata name,
        string calldata endpoint,
        address operator,
        uint96 price,
        uint32 timeout,
        uint16 referrerBps
    ) external returns (uint32 id) {
        _validateServiceParams(operator, price, timeout, referrerBps);

        id = uint32(_services.length);
        _services.push(Service({
            provider:    msg.sender,
            operator:    operator,
            price:       price,
            timeout:     timeout,
            referrerBps: referrerBps,
            active:      true,
            name:        name,
            endpoint:    endpoint
        }));

        emit ServiceRegistered(id, msg.sender, operator, price, name, endpoint);
    }

    /// @notice Update service parameters. Only the provider may call.
    function updateService(
        uint32 id,
        address operator,
        uint96 price,
        uint32 timeout,
        uint16 referrerBps,
        bool   active
    ) external {
        if (id >= _services.length) revert UnknownService();
        Service storage svc = _services[id];
        if (msg.sender != svc.provider) revert NotProvider();

        _validateServiceParams(operator, price, timeout, referrerBps);

        svc.operator    = operator;
        svc.price       = price;
        svc.timeout     = timeout;
        svc.referrerBps = referrerBps;
        svc.active      = active;

        emit ServiceUpdated(id, operator, price, timeout, referrerBps, active);
    }

    // -----------------------------------------------------------------------
    // Call lifecycle — standard path
    // -----------------------------------------------------------------------

    /// @notice Escrow USDC for one call. Uses ERC-20 transferFrom.
    function requestCall(
        uint32 serviceId,
        string calldata request,
        address referrer,
        uint96 maxPrice
    ) external nonReentrant returns (uint256 callId) {
        Service storage svc = _loadActiveService(serviceId);
        _validateCallParams(request, referrer, msg.sender, svc.price, maxPrice);

        callId = _createCall(serviceId, svc, msg.sender, referrer, request);

        // interactions last
        if (!usdc.transferFrom(msg.sender, address(this), svc.price)) revert TransferFailed();
    }

    // -----------------------------------------------------------------------
    // Call lifecycle — gasless EIP-3009 path
    // -----------------------------------------------------------------------

    /// @notice Compute the nonce that requestCallWithAuthorization requires.
    ///         Binds the EIP-3009 signature to the exact call parameters so a
    ///         relayer cannot re-point the payment to a different service,
    ///         referrer, or price.
    function authNonce(
        uint32  serviceId,
        bytes32 requestHash,
        address referrer,
        address payer,
        uint96  price
    ) public view returns (bytes32) {
        return keccak256(abi.encode(
            block.chainid,
            address(this),
            serviceId,
            requestHash,
            referrer,
            payer,
            price
        ));
    }

    /// @notice Gasless path: a relayer submits the payer's EIP-3009 signature.
    ///         nonce MUST equal authNonce(...) — validated before calling USDC
    ///         so a wrong nonce reverts early with BadNonce rather than "auth used".
    function requestCallWithAuthorization(
        uint32  serviceId,
        string  calldata request,
        address referrer,
        address payer,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 callId) {
        if (payer == address(0)) revert BadParam();
        Service storage svc = _loadActiveService(serviceId);
        _validateCallParams(request, referrer, payer, svc.price, svc.price /* maxPrice = price */);

        bytes32 expected = authNonce(serviceId, keccak256(bytes(request)), referrer, payer, svc.price);
        if (nonce != expected) revert BadNonce();

        callId = _createCall(serviceId, svc, payer, referrer, request);

        // interactions last — USDC checks nonce/sig and reverts on failure
        usdc.receiveWithAuthorization(
            payer, address(this), svc.price,
            validAfter, validBefore,
            nonce, v, r, s
        );
    }

    // -----------------------------------------------------------------------
    // Settlement
    // -----------------------------------------------------------------------

    /// @notice Settle a call by recording the result and paying out.
    function fulfill(
        uint256 callId,
        bytes32 resultHash,
        string calldata resultURI
    ) external nonReentrant {
        if (callId >= _calls.length) revert NotOpen();
        Call    storage c   = _calls[callId];
        Service storage svc = _services[c.serviceId];

        if (c.status != Status.Open) revert NotOpen();
        if (msg.sender != svc.operator && msg.sender != svc.provider) revert NotOperator();
        if (block.timestamp > c.deadline) revert DeadlinePassed();

        // effects before interactions
        c.resultHash = resultHash;
        c.status     = Status.Fulfilled;

        address referrer = c.referrer;
        address provider = svc.provider;
        uint96  amount   = c.amount;

        uint96 refAmt;
        uint96 provAmt;
        if (referrer == address(0)) {
            // no referrer: provider receives everything
            refAmt  = 0;
            provAmt = amount;
        } else {
            refAmt  = uint96(uint256(amount) * svc.referrerBps / 10_000);
            provAmt = amount - refAmt;
        }

        emit CallFulfilled(callId, resultHash, resultURI, provAmt, refAmt);

        // interactions — provider payout first; if referrer transfer fails
        // (e.g. blocklisted on Arc), fall back to paying that portion to provider
        _safeTransfer(provider, provAmt);
        if (referrer != address(0)) {
            bool ok = _tryTransfer(referrer, refAmt);
            if (!ok) {
                // referrer address is unusable; route to provider
                _safeTransfer(provider, refAmt);
            }
        }
    }

    /// @notice Reject a call and refund the payer in full.
    function reject(uint256 callId, string calldata reason) external nonReentrant {
        if (callId >= _calls.length) revert NotOpen();
        Call    storage c   = _calls[callId];
        Service storage svc = _services[c.serviceId];

        if (c.status != Status.Open) revert NotOpen();
        if (msg.sender != svc.operator && msg.sender != svc.provider) revert NotOperator();

        address payer  = c.payer;
        uint96  amount = c.amount;

        // effects before interactions
        c.status = Status.Refunded;

        emit CallRefunded(callId, msg.sender, reason);

        _safeTransfer(payer, amount);
    }

    /// @notice Trigger a refund for a call whose deadline has passed.
    function refundExpired(uint256 callId) external nonReentrant {
        if (callId >= _calls.length) revert NotOpen();
        Call storage c = _calls[callId];

        if (c.status != Status.Open) revert NotOpen();
        if (block.timestamp <= c.deadline) revert DeadlineNotReached();

        address payer  = c.payer;
        uint96  amount = c.amount;

        // effects before interactions
        c.status = Status.Refunded;

        emit CallRefunded(callId, msg.sender, "expired");

        _safeTransfer(payer, amount);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function serviceCount() external view returns (uint256) {
        return _services.length;
    }

    function callCount() external view returns (uint256) {
        return _calls.length;
    }

    function getService(uint32 id) external view returns (Service memory) {
        if (id >= _services.length) revert UnknownService();
        return _services[id];
    }

    function getCall(uint256 id) external view returns (Call memory) {
        if (id >= _calls.length) revert NotOpen();
        return _calls[id];
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    function _validateServiceParams(
        address operator,
        uint96  price,
        uint32  timeout,
        uint16  referrerBps
    ) internal pure {
        if (operator == address(0)) revert BadParam();
        if (price == 0)             revert BadParam();
        if (timeout < MIN_TIMEOUT || timeout > MAX_TIMEOUT) revert BadParam();
        if (referrerBps > MAX_REFERRER_BPS) revert BadParam();
    }

    function _loadActiveService(uint32 serviceId) internal view returns (Service storage) {
        if (serviceId >= _services.length) revert UnknownService();
        Service storage svc = _services[serviceId];
        if (!svc.active) revert ServiceInactive();
        return svc;
    }

    function _validateCallParams(
        string  calldata request,
        address referrer,
        address payer,
        uint96  price,
        uint96  maxPrice
    ) internal pure {
        uint256 reqLen = bytes(request).length;
        if (reqLen == 0 || reqLen > MAX_REQUEST_BYTES) revert BadParam();
        if (referrer != address(0) && referrer == payer)  revert BadParam();
        if (price > maxPrice) revert PriceAboveMax(price, maxPrice);
    }

    function _createCall(
        uint32  serviceId,
        Service storage svc,
        address payer,
        address referrer,
        string  calldata request
    ) internal returns (uint256 callId) {
        uint64  deadline    = uint64(block.timestamp + svc.timeout);
        bytes32 requestHash = keccak256(bytes(request));

        callId = _calls.length;
        _calls.push(Call({
            payer:       payer,
            deadline:    deadline,
            status:      Status.Open,
            serviceId:   serviceId,
            referrer:    referrer,
            amount:      svc.price,
            requestHash: requestHash,
            resultHash:  bytes32(0)
        }));

        emit CallRequested(callId, serviceId, payer, referrer, svc.price, requestHash, deadline, request);
    }

    function _safeTransfer(address to, uint256 amount) internal {
        if (!usdc.transfer(to, amount)) revert TransferFailed();
    }

    /// @dev Like _safeTransfer but returns false instead of reverting.
    ///      Used so a blocked referrer never prevents provider settlement.
    function _tryTransfer(address to, uint256 amount) internal returns (bool) {
        (bool success, bytes memory data) = address(usdc).call(
            abi.encodeWithSelector(IUSDC.transfer.selector, to, amount)
        );
        if (!success) return false;
        if (data.length > 0 && !abi.decode(data, (bool))) return false;
        return true;
    }
}

