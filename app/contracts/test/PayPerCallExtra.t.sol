// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayPerCall} from "../PayPerCall.sol";
import {MockUSDC} from "./MockUSDC.sol";

// ---------------------------------------------------------------------------
// Malicious token that tries to re-enter PayPerCall on transfer
// ---------------------------------------------------------------------------
contract MaliciousToken {
    PayPerCall public target;
    uint256 public attackCallId;
    bool public attacking;

    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public balanceOf;

    function setTarget(PayPerCall _target) external { target = _target; }
    function setAttackCallId(uint256 id) external { attackCallId = id; }

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }

    // transferFrom: called by requestCall — do not re-enter here (value not yet in contract)
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }

    // transfer: called by fulfill/reject/refundExpired — attempt re-entry
    function transfer(address to, uint256 a) external returns (bool) {
        // move tokens first (proper bookkeeping so balance assertions hold)
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        if (!attacking) {
            attacking = true;
            // try to double-claim by calling refundExpired on the same call
            try target.refundExpired(attackCallId) {} catch {}
            attacking = false;
        }
        return true;
    }

    function receiveWithAuthorization(
        address from, address to, uint256 value,
        uint256, uint256, bytes32, uint8, bytes32, bytes32
    ) external {
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}

// ---------------------------------------------------------------------------
// Additional tests
// ---------------------------------------------------------------------------
contract PayPerCallExtraTest is Test {
    PayPerCall ppc;
    MockUSDC usdc;
    address provider = address(0xA11CE);
    address operator = address(0x0BE);
    address referrer = address(0xBEEF);
    uint256 payerPk  = 0xA9E17;
    address payer;
    uint96 constant PRICE = 10_000;
    uint32 sid;
    string constant REQS = "base:0x4200000000000000000000000000000000000006";
    bytes32 constant REQ  = keccak256(bytes(REQS));

    function setUp() public {
        payer = vm.addr(payerPk);
        usdc = new MockUSDC();
        ppc  = new PayPerCall(address(usdc));
        vm.prank(provider);
        sid = ppc.registerService("T", "e", operator, PRICE, 600, 1_000);
        usdc.mint(payer, 100_000_000);
        vm.prank(payer);
        usdc.approve(address(ppc), type(uint256).max);
    }

    // -----------------------------------------------------------------------
    // Reentrancy via a malicious token
    // -----------------------------------------------------------------------

    function test_reentrancy_refundExpiredBlocked() public {
        // Deploy a PayPerCall backed by the malicious token
        MaliciousToken malToken = new MaliciousToken();
        PayPerCall ppc2 = new PayPerCall(address(malToken));
        malToken.setTarget(ppc2);

        vm.prank(provider);
        uint32 sid2 = ppc2.registerService("M", "m", operator, PRICE, 600, 0);

        malToken.mint(payer, PRICE);
        vm.prank(payer);
        malToken.approve(address(ppc2), type(uint256).max);

        vm.prank(payer);
        uint256 cid = ppc2.requestCall(sid2, REQS, address(0), PRICE);
        malToken.setAttackCallId(cid);

        // warp past deadline so refundExpired is valid
        vm.warp(block.timestamp + 601);

        // first refund should succeed; the re-entry attempt inside transfer must be blocked
        ppc2.refundExpired(cid);

        // status must be Refunded (not re-entered back to Open or double-settled)
        assertEq(uint256(ppc2.getCall(cid).status), uint256(PayPerCall.Status.Refunded));
        // malToken gave tokens to payer once; contract balance should be 0
        assertEq(malToken.balanceOf(address(ppc2)), 0);
    }

    function test_reentrancy_fulfillBlocked() public {
        MaliciousToken malToken = new MaliciousToken();
        PayPerCall ppc2 = new PayPerCall(address(malToken));
        malToken.setTarget(ppc2);

        vm.prank(provider);
        uint32 sid2 = ppc2.registerService("M", "m", operator, PRICE, 600, 0);

        malToken.mint(payer, PRICE);
        vm.prank(payer);
        malToken.approve(address(ppc2), type(uint256).max);

        vm.prank(payer);
        uint256 cid = ppc2.requestCall(sid2, REQS, address(0), PRICE);
        malToken.setAttackCallId(cid);

        // operator fulfills — transfer to provider triggers re-entry attempt
        vm.prank(operator);
        ppc2.fulfill(cid, keccak256("v"), "");

        assertEq(uint256(ppc2.getCall(cid).status), uint256(PayPerCall.Status.Fulfilled));
    }

    // -----------------------------------------------------------------------
    // Deadline edge cases — exactly at deadline
    // -----------------------------------------------------------------------

    function test_fulfillExactlyAtDeadline() public {
        vm.prank(payer);
        uint256 cid = ppc.requestCall(sid, REQS, address(0), PRICE);
        uint64 deadline = ppc.getCall(cid).deadline;

        // warp to exactly the deadline
        vm.warp(deadline);

        // fulfill should succeed: spec says "allowed while block.timestamp <= deadline"
        vm.prank(operator);
        ppc.fulfill(cid, keccak256("v"), "");
        assertEq(uint256(ppc.getCall(cid).status), uint256(PayPerCall.Status.Fulfilled));
    }

    function test_refundExpiredExactlyAtDeadline_reverts() public {
        vm.prank(payer);
        uint256 cid = ppc.requestCall(sid, REQS, address(0), PRICE);
        uint64 deadline = ppc.getCall(cid).deadline;

        // At deadline: refundExpired must NOT work
        vm.warp(deadline);
        vm.expectRevert(PayPerCall.DeadlineNotReached.selector);
        ppc.refundExpired(cid);
    }

    function test_refundExpiredOneSecondAfterDeadline() public {
        vm.prank(payer);
        uint256 cid = ppc.requestCall(sid, REQS, address(0), PRICE);
        uint64 deadline = ppc.getCall(cid).deadline;

        vm.warp(deadline + 1);

        // fulfill must fail
        vm.expectRevert(PayPerCall.DeadlinePassed.selector);
        vm.prank(operator);
        ppc.fulfill(cid, keccak256("v"), "");

        // refund must succeed
        uint256 before = usdc.balanceOf(payer);
        ppc.refundExpired(cid);
        assertEq(usdc.balanceOf(payer), before + PRICE);
    }

    // -----------------------------------------------------------------------
    // EIP-3009 — wrong nonce reverts BadNonce before any USDC interaction
    // -----------------------------------------------------------------------

    function _sign(uint256 value, bytes32 nonce, uint256 vb) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 d = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), payer, address(ppc), value, uint256(0), vb, nonce))));
        (v, r, s) = vm.sign(payerPk, d);
    }

    function test_badNonce_wrongNonceValue() public {
        bytes32 correctNonce = ppc.authNonce(sid, REQ, referrer, payer, PRICE);
        bytes32 wrongNonce   = bytes32(uint256(correctNonce) ^ 1); // flip one bit
        uint256 vb = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _sign(PRICE, wrongNonce, vb);
        vm.expectRevert(PayPerCall.BadNonce.selector);
        ppc.requestCallWithAuthorization(sid, REQS, referrer, payer, 0, vb, wrongNonce, v, r, s);
    }

    function test_badNonce_wrongPayer() public {
        address otherPayer = address(0xDEAD);
        // nonce computed for otherPayer, but signature is from payer's key
        bytes32 nonce = ppc.authNonce(sid, REQ, referrer, otherPayer, PRICE);
        uint256 vb = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _sign(PRICE, nonce, vb);
        // Passing otherPayer: nonce matches, but USDC sig check will fail
        // Passing payer: nonce won't match the authNonce(…payer…) since we used otherPayer above
        vm.expectRevert(PayPerCall.BadNonce.selector);
        ppc.requestCallWithAuthorization(sid, REQS, referrer, payer, 0, vb, nonce, v, r, s);
    }

    function test_badNonce_wrongServiceId() public {
        // Register a second service
        vm.prank(provider);
        uint32 sid2 = ppc.registerService("S2", "e2", operator, PRICE, 600, 0);

        // Nonce for sid2 but we submit it as sid
        bytes32 nonce = ppc.authNonce(sid2, REQ, referrer, payer, PRICE);
        uint256 vb = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _sign(PRICE, nonce, vb);
        vm.expectRevert(PayPerCall.BadNonce.selector);
        ppc.requestCallWithAuthorization(sid, REQS, referrer, payer, 0, vb, nonce, v, r, s);
    }

    // -----------------------------------------------------------------------
    // Invariant / fuzz: escrow conservation with expire path
    // -----------------------------------------------------------------------

    function testFuzz_escrowConservationWithExpiry(
        uint96  price,
        uint32  timeout,
        uint8   n,
        uint256 seed
    ) public {
        price   = uint96(bound(price, 1, 1e10));
        timeout = uint32(bound(timeout, 60, 7 days));
        n       = uint8(bound(n, 1, 10));

        vm.prank(provider);
        uint32 sid2 = ppc.registerService("FE", "fe", operator, price, timeout, 0);
        usdc.mint(payer, uint256(price) * n);

        uint256 totalBefore = usdc.balanceOf(payer) + usdc.balanceOf(provider) + usdc.balanceOf(referrer);
        uint256 open;
        uint256[] memory callIds = new uint256[](n);

        for (uint256 i; i < n; i++) {
            vm.prank(payer);
            callIds[i] = ppc.requestCall(sid2, vm.toString(i), address(0), price);
            open += price;
        }
        assertEq(usdc.balanceOf(address(ppc)), open, "escrow before settle");

        for (uint256 i; i < n; i++) {
            uint256 action = (seed >> (i * 2)) % 3;
            if (action == 0) {
                vm.prank(operator); ppc.fulfill(callIds[i], keccak256("r"), "");
                open -= price;
            } else if (action == 1) {
                vm.prank(operator); ppc.reject(callIds[i], "x");
                open -= price;
            }
            // else: leave open, will expire
        }

        // expire all remaining open calls
        vm.warp(block.timestamp + 7 days + 1);
        for (uint256 i; i < n; i++) {
            PayPerCall.Call memory c = ppc.getCall(callIds[i]);
            if (c.status == PayPerCall.Status.Open) {
                ppc.refundExpired(callIds[i]);
                open -= price;
            }
        }

        assertEq(open, 0, "all calls settled");
        assertEq(usdc.balanceOf(address(ppc)), 0, "contract empty");
        uint256 totalAfter = usdc.balanceOf(payer) + usdc.balanceOf(provider);
        assertEq(totalAfter, totalBefore, "no funds lost or created");
    }

    // -----------------------------------------------------------------------
    // Fuzz: referrer split never exceeds price
    // -----------------------------------------------------------------------

    function testFuzz_referrerSplitBound(uint96 price, uint16 bps) public {
        price = uint96(bound(price, 1, type(uint96).max / 10_001));
        bps   = uint16(bound(bps, 0, 5_000));

        vm.prank(provider);
        uint32 sid2 = ppc.registerService("SB", "sb", operator, price, 600, bps);

        usdc.mint(payer, price);
        vm.prank(payer);
        usdc.approve(address(ppc), price);

        vm.prank(payer);
        uint256 cid = ppc.requestCall(sid2, REQS, referrer, price);

        uint256 provBefore = usdc.balanceOf(provider);
        uint256 refBefore  = usdc.balanceOf(referrer);

        vm.prank(operator);
        ppc.fulfill(cid, keccak256("v"), "");

        uint256 provGot = usdc.balanceOf(provider) - provBefore;
        uint256 refGot  = usdc.balanceOf(referrer)  - refBefore;

        assertLe(refGot, price,         "referrer amount <= price");
        assertEq(provGot + refGot, price, "splits sum to price");
    }

    // -----------------------------------------------------------------------
    // payer == address(0) in requestCallWithAuthorization
    // -----------------------------------------------------------------------

    function test_badParam_zeroPayerInAuth() public {
        bytes32 nonce = bytes32(uint256(1));
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.requestCallWithAuthorization(sid, REQS, referrer, address(0), 0, block.timestamp + 300, nonce, 0, 0, 0);
    }

    // -----------------------------------------------------------------------
    // updateService validates params same as register
    // -----------------------------------------------------------------------

    function test_updateServiceBadParams() public {
        vm.startPrank(provider);
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.updateService(sid, address(0), PRICE, 600, 0, true);
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.updateService(sid, operator, 0, 600, 0, true);
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.updateService(sid, operator, PRICE, 30, 0, true);
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.updateService(sid, operator, PRICE, 600, 5_001, true);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // getCall on unknown id
    // -----------------------------------------------------------------------

    function test_getCallUnknown() public {
        vm.expectRevert(PayPerCall.NotOpen.selector);
        ppc.getCall(999);
    }

    // -----------------------------------------------------------------------
    // getService on unknown id
    // -----------------------------------------------------------------------

    function test_getServiceUnknown() public {
        vm.expectRevert(PayPerCall.UnknownService.selector);
        ppc.getService(99);
    }

    // -----------------------------------------------------------------------
    // updateService on unknown serviceId
    // -----------------------------------------------------------------------

    function test_updateUnknownService() public {
        vm.expectRevert(PayPerCall.UnknownService.selector);
        vm.prank(provider);
        ppc.updateService(99, operator, PRICE, 600, 0, true);
    }
}
