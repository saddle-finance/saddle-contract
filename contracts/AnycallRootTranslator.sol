// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

interface I_CallProxy {
    function anyCall(address _to, bytes calldata  _data, address _fallback, uint256 _toChainId) external ; // nonpayable
    } 


contract AnyCallRootTranslator {

    // consts
    address public owner;
    address private anycall;
    uint256 private constant MAX_UINT256 = 2**256 - 1;
    address private constant ZERO_ADDRESS = 0x0000000000000000000000000000000000000000;

    constructor(address _owner) {
        // multisig
        owner = _owner;
    }

    function setAnycallImplementation(address _anycall) external {
        assert(msg.sender == owner);
        anycall = _anycall;
    }
    
    function deployChildGauge(uint256 _chainId, address _lpToken, bytes memory _salt, address _manager) external {
        // TODO: confirm this abi.encode is correct
        CallProxy(anycall).anyCall(address(this), abi.encode(_lpToken, _salt, _manager, "deploy_gauge(address,bytes32,address)"), ZERO_ADDRESS, _chainId);
    }
    // def deploy_child_gauge(_chain_id: uint256, _lp_token: address, _salt: bytes32, _manager: address = msg.sender):
    // bridger: address = self.get_bridger[_chain_id]
    // assert bridger != ZERO_ADDRESS  # dev: chain id not supported

    // CallProxy(self.call_proxy).anyCall(
    //     self,
    //     _abi_encode(
    //         _lp_token,
    //         _salt,
    //         _manager,
    //         method_id=method_id("deploy_gauge(address,bytes32,address)")
    //     ),
    //     ZERO_ADDRESS,
    //     _chain_id
    // )
}
