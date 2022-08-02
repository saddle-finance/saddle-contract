// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

interface I_CallProxy {
    function anyCall(
        address _to,
        bytes calldata _data,
        address _fallback,
        uint256 _toChainId
    ) external; // nonpayable
}

contract AnyCallTranslator {
    // consts
    address public owner;
    address private anycall;
    uint256 private constant MAX_UINT256 = 2**256 - 1;
    address private constant ZERO_ADDRESS =
        0x0000000000000000000000000000000000000000;

    constructor(address _owner) {
        // Root | Child Gauge Factory
        owner = _owner;
    }

    function setAnycallImplementation(address _anycall) external {
        require(msg.sender == owner);
        anycall = _anycall;
    }

    function updateOwnership(address _newOwner) external {
        require(msg.sender == owner);
        owner = _newOwner;
    }

    function anyCalls(
        address _to,
        bytes memory _data,
        address _fallback,
        uint256 _toChainId
    ) external {
        require(msg.sender == owner);
        I_CallProxy(anycall).anyCall(_to, _data, _fallback, _toChainId);
    }
}
