// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IAnyCallTranslator {
    function anyExecute(bytes calldata _data)
        external
        returns (bool success, bytes memory result);
}

contract MockAnyCall {
    address public anyCallTranslator;

    event successMsg(bool);
    event resultMsg(bytes);
    event AnyCallMessage(
        address to,
        bytes data,
        address _fallback,
        uint256 chainId,
        uint256 flags
    );

    /**
     * Mimics the source chain of AnyCall messaging system.
     * @param _to The address of the contract to call
     * @param _data The data to send to the contract
     * @param _fallback The fallback address to call
     * @param _to_chain_id The chainId of the destination chain
     * @param _flags The flags for who is paying for the tx.
     */
    function anyCall(
        address _to,
        bytes memory _data,
        address _fallback,
        uint256 _to_chain_id,
        uint256 _flags
    ) external payable {
        emit AnyCallMessage(_to, _data, _fallback, _to_chain_id, _flags);
    }

    function setanyCallTranslator(address _anyCallTranslator) external {
        anyCallTranslator = _anyCallTranslator;
    }

    /**
     * Mimics the destination chain of AnyCall messaging system.
     * When the destination chain detects incoming message, it will process it
     * by calling `anyExecute` on the to address.
     * @param _to address of the contract to call
     * @param _data bytes of the data to send to the contract
     */
    function callAnyExecute(address _to, bytes calldata _data)
        external
        returns (bool success, bytes memory result)
    {
        (success, result) = IAnyCallTranslator(_to).anyExecute(_data);
        emit successMsg(success);
        emit resultMsg(result);
    }

    function context()
        external
        view
        returns (
            address from,
            uint256 fromChainID,
            uint256 nonce
        )
    {
        return (anyCallTranslator, 1, 0);
    }

    function executor() external view returns (address _executor) {
        return (address(this));
    }

    function withdraw(uint256 _amount) external {
        require(_amount <= address(this).balance, "Not enough balance");
        payable(msg.sender).transfer(_amount);
    }

    // Fallback function to receive ETH
    receive() external payable {}
}
