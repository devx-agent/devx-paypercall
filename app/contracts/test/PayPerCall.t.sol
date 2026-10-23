// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayPerCall} from "../PayPerCall.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract PayPerCallTest is Test {
    PayPerCall ppc;
    MockUSDC usdc;
    address provider = address(0xA11CE);
    address operator = address(0x0BE);
    address referrer = address(0xBEEF);
    uint256 payerPk = 0xA9E17;
    address payer;
    uint96 constant PRICE = 10_000; // $0.01
    uint32 sid;
    string constant REQS = "base:0x4200000000000000000000000000000000000006";
    bytes32 constant REQ = keccak256(bytes(REQS));

    function setUp() public {
        payer = vm.addr(payerPk);
        usdc = new MockUSDC();
        ppc = new PayPerCall(address(usdc));
        vm.prank(provider);
        sid = ppc.registerService("DevX Token Check", "https://tokencheck.madebydevx.com", operator, PRICE, 600, 1_000);
        usdc.mint(payer, 1_000_000);
        vm.prank(payer);
        usdc.approve(address(ppc), type(uint256).max);
    }

    function _req() internal returns (uint256 id) {
        vm.prank(payer);
        id = ppc.requestCall(sid, REQS, referrer, PRICE);
    }

    function test_register() public view {
        PayPerCall.Service memory s = ppc.getService(sid);
        assertEq(s.provider, provider);
        assertEq(s.operator, operator);
        assertEq(uint256(s.price), PRICE);
        assertTrue(s.active);
        assertEq(ppc.serviceCount(), 1);
    }

    function test_registerRejectsBadParams() public {
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.registerService("x", "y", address(0), PRICE, 600, 0);
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.registerService("x", "y", operator, 0, 600, 0);
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.registerService("x", "y", operator, PRICE, 10, 0);
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.registerService("x", "y", operator, PRICE, 600, 5_001);
    }

    function test_requestEscrows() public {
        uint256 id = _req();
        assertEq(usdc.balanceOf(address(ppc)), PRICE);
        assertEq(usdc.balanceOf(payer), 1_000_000 - PRICE);
        PayPerCall.Call memory c = ppc.getCall(id);
        assertEq(c.payer, payer);
        assertEq(uint256(c.status), uint256(PayPerCall.Status.Open));
        assertEq(c.requestHash, REQ);
        assertEq(uint256(c.deadline), block.timestamp + 600);
    }

    function test_fulfillSplits() public {
        uint256 id = _req();
        vm.prank(operator);
        ppc.fulfill(id, keccak256("verdict"), "https://tokencheck.madebydevx.com/v/abc");
        assertEq(usdc.balanceOf(provider), 9_000);
        assertEq(usdc.balanceOf(referrer), 1_000);
        assertEq(usdc.balanceOf(address(ppc)), 0);
        assertEq(uint256(ppc.getCall(id).status), uint256(PayPerCall.Status.Fulfilled));
        assertEq(ppc.getCall(id).resultHash, keccak256("verdict"));
    }

    function test_fulfillNoReferrerAllToProvider() public {
        vm.prank(payer);
        uint256 id = ppc.requestCall(sid, REQS, address(0), PRICE);
        vm.prank(provider); // provider may also fulfill
        ppc.fulfill(id, keccak256("v"), "");
        assertEq(usdc.balanceOf(provider), PRICE);
    }

    function test_onlyOperatorCanSettle() public {
        uint256 id = _req();
        vm.expectRevert(PayPerCall.NotOperator.selector);
        vm.prank(payer);
        ppc.fulfill(id, keccak256("v"), "");
        vm.expectRevert(PayPerCall.NotOperator.selector);
        ppc.reject(id, "nope");
    }

    function test_noDoubleSettle() public {
        uint256 id = _req();
        vm.prank(operator);
        ppc.fulfill(id, keccak256("v"), "");
        vm.expectRevert(PayPerCall.NotOpen.selector);
        vm.prank(operator);
        ppc.fulfill(id, keccak256("v"), "");
        vm.expectRevert(PayPerCall.NotOpen.selector);
        vm.prank(operator);
        ppc.reject(id, "late");
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(PayPerCall.NotOpen.selector);
        ppc.refundExpired(id);
    }

    function test_rejectRefunds() public {
        uint256 id = _req();
        vm.prank(operator);
        ppc.reject(id, "invalid token address");
        assertEq(usdc.balanceOf(payer), 1_000_000);
        assertEq(uint256(ppc.getCall(id).status), uint256(PayPerCall.Status.Refunded));
    }

    function test_refundExpired() public {
        uint256 id = _req();
        vm.expectRevert(PayPerCall.DeadlineNotReached.selector);
        ppc.refundExpired(id);
        vm.warp(block.timestamp + 601);
        vm.expectRevert(PayPerCall.DeadlinePassed.selector);
        vm.prank(operator);
        ppc.fulfill(id, keccak256("v"), "");
        ppc.refundExpired(id); // anyone
        assertEq(usdc.balanceOf(payer), 1_000_000);
    }

    function test_priceGuard() public {
        vm.prank(provider);
        ppc.updateService(sid, operator, PRICE * 2, 600, 1_000, true);
        vm.expectRevert(abi.encodeWithSelector(PayPerCall.PriceAboveMax.selector, PRICE * 2, PRICE));
        vm.prank(payer);
        ppc.requestCall(sid, REQS, referrer, PRICE);
    }

    function test_inactiveAndUnknown() public {
        vm.prank(provider);
        ppc.updateService(sid, operator, PRICE, 600, 1_000, false);
        vm.expectRevert(PayPerCall.ServiceInactive.selector);
        vm.prank(payer);
        ppc.requestCall(sid, REQS, referrer, PRICE);
        vm.expectRevert(PayPerCall.UnknownService.selector);
        vm.prank(payer);
        ppc.requestCall(7, REQS, referrer, PRICE);
    }

    function test_onlyProviderUpdates() public {
        vm.expectRevert(PayPerCall.NotProvider.selector);
        vm.prank(operator);
        ppc.updateService(sid, operator, 1, 600, 0, true);
    }

    function test_requestLengthBounds() public {
        vm.startPrank(payer);
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.requestCall(sid, "", referrer, PRICE);
        bytes memory big = new bytes(257);
        vm.expectRevert(PayPerCall.BadParam.selector);
        ppc.requestCall(sid, string(big), referrer, PRICE);
        vm.stopPrank();
    }

    function test_selfReferralBlocked() public {
        vm.expectRevert(PayPerCall.BadParam.selector);
        vm.prank(payer);
        ppc.requestCall(sid, REQS, payer, PRICE);
    }

    function test_blocklistedProviderCannotDrainButPayerCanRecover() public {
        uint256 id = _req();
        usdc.setBlocked(provider, true);
        vm.expectRevert(bytes("blocklisted"));
        vm.prank(operator);
        ppc.fulfill(id, keccak256("v"), "");
        vm.warp(block.timestamp + 601);
        ppc.refundExpired(id);
        assertEq(usdc.balanceOf(payer), 1_000_000);
    }

    // ---------------------------------------------------------------- EIP-3009 path
    function _sign(uint256 value, bytes32 nonce, uint256 vb) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 d = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), payer, address(ppc), value, uint256(0), vb, nonce))));
        (v, r, s) = vm.sign(payerPk, d);
    }

    function test_authorizationPath() public {
        bytes32 nonce = ppc.authNonce(sid, REQ, referrer, payer, PRICE);
        uint256 vb = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _sign(PRICE, nonce, vb);
        vm.prank(address(0xD00D)); // relayer pays gas
        uint256 id = ppc.requestCallWithAuthorization(sid, REQS, referrer, payer, 0, vb, nonce, v, r, s);
        assertEq(ppc.getCall(id).payer, payer);
        assertEq(usdc.balanceOf(address(ppc)), PRICE);
        // replay fails
        vm.expectRevert(PayPerCall.BadNonce.selector);
        ppc.requestCallWithAuthorization(sid, "base:0xother", referrer, payer, 0, vb, nonce, v, r, s);
        vm.expectRevert(bytes("auth used"));
        ppc.requestCallWithAuthorization(sid, REQS, referrer, payer, 0, vb, nonce, v, r, s);
    }

    function test_authorizationCannotBeRepointed() public {
        bytes32 nonce = ppc.authNonce(sid, REQ, referrer, payer, PRICE);
        uint256 vb = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _sign(PRICE, nonce, vb);
        // attacker swaps the referrer to themselves
        vm.expectRevert(PayPerCall.BadNonce.selector);
        ppc.requestCallWithAuthorization(sid, REQS, address(0xBAD), payer, 0, vb, nonce, v, r, s);
    }

    // ---------------------------------------------------------------- fuzz: conservation of USDC
    function testFuzz_conservation(uint96 price, uint16 bps, uint8 n, uint256 seed) public {
        price = uint96(bound(price, 1, 1e12));
        bps = uint16(bound(bps, 0, 5_000));
        n = uint8(bound(n, 1, 20));
        vm.prank(provider);
        uint32 id2 = ppc.registerService("F", "f", operator, price, 600, bps);
        usdc.mint(payer, uint256(price) * n);
        uint256 total = usdc.balanceOf(payer) + usdc.balanceOf(provider) + usdc.balanceOf(referrer);
        uint256 open;
        for (uint256 i; i < n; i++) {
            vm.prank(payer);
            uint256 cid = ppc.requestCall(id2, vm.toString(i), (seed >> i) & 1 == 1 ? referrer : address(0), price);
            uint256 action = (seed >> (i + 32)) % 3;
            if (action == 0) { vm.prank(operator); ppc.fulfill(cid, keccak256("r"), ""); }
            else if (action == 1) { vm.prank(operator); ppc.reject(cid, "x"); }
            else open += price;
        }
        assertEq(usdc.balanceOf(address(ppc)), open);
        assertEq(usdc.balanceOf(payer) + usdc.balanceOf(provider) + usdc.balanceOf(referrer) + open, total);
    }
}
