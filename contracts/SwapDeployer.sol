// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/ISwap.sol";
import "./interfaces/IMetaSwap.sol";

contract SwapDeployer is Ownable {
    event NewSwapPool(
        address indexed deployer,
        address swapAddress,
        IERC20[] pooledTokens
    );
    event NewClone(address indexed target, address cloneAddress);

    constructor() public Ownable() {}

    function clone(address target) external returns (address) {
        address newClone = _clone(target);
        emit NewClone(target, newClone);

        return newClone;
    }

    function _clone(address target) internal returns (address) {
        return Clones.clone(target);
    }

    function deploy(
        address swapAddress,
        IERC20[] memory _pooledTokens,
        uint8[] memory decimals,
        string memory lpTokenName,
        string memory lpTokenSymbol,
        uint256 _a,
        uint256 _fee,
        uint256 _adminFee,
        address lpTokenTargetAddress
    ) external returns (address) {
        address swapClone = _clone(swapAddress);
        ISwap(swapClone).initialize(
            _pooledTokens,
            decimals,
            lpTokenName,
            lpTokenSymbol,
            _a,
            _fee,
            _adminFee,
            lpTokenTargetAddress
        );
        Ownable(swapClone).transferOwnership(owner());
        emit NewSwapPool(msg.sender, swapClone, _pooledTokens);
        return swapClone;
    }

    function deployMetaSwap(
        address metaSwapAddress,
        IERC20[] memory _pooledTokens,
        uint8[] memory decimals,
        string memory lpTokenName,
        string memory lpTokenSymbol,
        uint256 _a,
        uint256 _fee,
        uint256 _adminFee,
        address lpTokenTargetAddress,
        ISwap baseSwap
    ) external returns (address) {
        address metaSwapClone = _clone(metaSwapAddress);
        IMetaSwap(metaSwapClone).initializeMetaSwap(
            _pooledTokens,
            decimals,
            lpTokenName,
            lpTokenSymbol,
            _a,
            _fee,
            _adminFee,
            lpTokenTargetAddress,
            baseSwap
        );
        Ownable(metaSwapClone).transferOwnership(owner());
        emit NewSwapPool(msg.sender, metaSwapClone, _pooledTokens);
        return metaSwapClone;
    }
}
