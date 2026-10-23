// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test double: 6-decimal ERC-20 with EIP-3009 receiveWithAuthorization (same typehash as Circle FiatToken v2).
contract MockUSDC {
    string public constant name = "USDC";
    string public constant version = "2";
    uint8 public constant decimals = 6;
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    mapping(address => bool) public blocked;

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(this)));
    }
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setBlocked(address a, bool b) external { blocked[a] = b; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { _move(msg.sender, to, a); return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance"); allowance[f][msg.sender] -= a; _move(f, to, a); return true;
    }
    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore,
        bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        require(to == msg.sender, "caller must be the payee");
        require(block.timestamp > validAfter && block.timestamp < validBefore, "auth time");
        require(!authorizationState[from][nonce], "auth used");
        bytes32 d = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), keccak256(abi.encode(
            RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce))));
        require(ecrecover(d, v, r, s) == from, "bad sig");
        authorizationState[from][nonce] = true;
        _move(from, to, value);
    }
    function _move(address f, address t, uint256 a) internal {
        require(!blocked[f] && !blocked[t], "blocklisted");
        require(t != address(0), "zero");
        require(balanceOf[f] >= a, "balance"); balanceOf[f] -= a; balanceOf[t] += a;
    }
}
