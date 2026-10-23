// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PayPerCall} from "../src/PayPerCall.sol";

/// Deploys PayPerCall and registers DevX Token Check as service #0.
/// env: PRIVATE_KEY (ops key, becomes provider + operator), USDC (default Arc 0x3600…), PRICE (default 10000 = $0.01),
///      TIMEOUT (default 600 s), REFERRER_BPS (default 1000 = 10%).
contract Deploy is Script {
    function run() external returns (PayPerCall ppc, uint32 sid) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envOr("USDC", address(0x3600000000000000000000000000000000000000));
        uint96 price = uint96(vm.envOr("PRICE", uint256(10_000)));
        uint32 timeout = uint32(vm.envOr("TIMEOUT", uint256(600)));
        uint16 bps = uint16(vm.envOr("REFERRER_BPS", uint256(1_000)));
        address ops = vm.addr(pk);
        vm.startBroadcast(pk);
        ppc = new PayPerCall(usdc);
        sid = ppc.registerService("DevX Token Check", "https://tokencheck.madebydevx.com/v1/token/verdict", ops, price, timeout, bps);
        vm.stopBroadcast();
        console2.log("PayPerCall", address(ppc));
        console2.log("serviceId", uint256(sid));
        console2.log("provider/operator", ops);
    }
}
