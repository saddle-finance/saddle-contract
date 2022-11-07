// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/access/Ownable.sol";
import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";
import "./Bridger.sol";

/// @notice Interface for the official Optimism Bridge contract
interface IOptimismStandardBridge {
    function depositERC20To(
        address _l1token,
        address _l2token,
        address _to,
        uint256 _amount,
        uint32 l2Gas,
        bytes calldata _data
    ) external payable;
}

/// @title Optimism bridger contract
/// @notice This contract is used to bridge tokens to Optimism network
/// @dev Since Optimism bridge reequires manually providing the L2 token address,
/// the contract owner must set the L2 token address before bridging.
contract OptimismBridger is Bridger {
    using SafeERC20 for IERC20;

    // consts
    address private immutable SDL;
    address private constant OPTIMISM_L1_STANDARD_BRIDGE =
        0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1;

    // vars
    uint32 private gasLimit;
    mapping(address => address) public l2AddrMap;

    event UpdateGasLimit(uint32 oldGasLimit, uint32 newGasLimit);
    event UpdateTokenMapping(
        address indexed l1Token,
        address oldL2Token,
        address newL2Token
    );

    /// @notice This contract is used to bridge tokens to Arbitrum
    /// @dev Arbitrum bridge requires base fee for the fee calculation therefore
    /// the function may revert on evm implementations that do not support base fee
    /// @param _gasLimit Gas limit for the L2 transaction
    /// @param _SDL SDL token address on this chain
    /// @param _OP_SDL SDL token address on Optimism chain
    constructor(
        uint32 _gasLimit,
        address _SDL,
        address _OP_SDL
    ) {
        SDL = _SDL;
        gasLimit = _gasLimit;
        emit UpdateGasLimit(uint32(0), _gasLimit);

        l2AddrMap[_SDL] = _OP_SDL;
        // approve token transfer to gateway
        IERC20(_SDL).safeApprove(
            OPTIMISM_L1_STANDARD_BRIDGE,
            type(uint256).max
        );
    }

    /// @notice Bridge given token to Optimism network
    /// @dev The function will revert if the L2 token address is not set
    /// @param _token token address on this chain
    /// @param _to destination address on Optimism chain
    /// @param _amount amount of tokens to bridge
    function bridge(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override whenNotPaused {
        // Transfer token to this contract from msg.sender
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        // Ensure token has l2 token pair
        address l2Token = l2AddrMap[_token];
        require(l2Token != address(0), "L2 token not set");

        // Trigger deposit to optimism
        IOptimismStandardBridge(OPTIMISM_L1_STANDARD_BRIDGE).depositERC20To(
            _token,
            l2Token,
            _to,
            _amount,
            gasLimit,
            ""
        );
    }

    /// @notice Get the network cost for bridging tokens to Optimism
    /// @dev The gas cost for bridging is 0 on Ethereum mainnet
    /// @return The cost of bridging tokens
    function cost() external pure override returns (uint256) {
        return 0;
    }

    /// @notice Check if this bridge can be used
    /// @return True if the bridger is active
    function check(address) external pure override returns (bool) {
        return true;
    }

    /// @notice Set gas limit to use for bridging
    /// @dev The function can only be called by the contract owner
    /// @param _gasLimit New gas limit
    function setGasLimit(uint32 _gasLimit) external onlyOwner {
        emit UpdateGasLimit(gasLimit, _gasLimit);
        gasLimit = _gasLimit;
    }

    /// @notice Set L2 token address for the given L1 token and approve
    /// the bridge to transfer the L1 token
    /// @dev The function can only be called by the contract owner
    /// @param _l1Token L1 token address
    /// @param _l2Token L2 token address on Optimism
    function setL2TokenPair(address _l1Token, address _l2Token)
        external
        onlyOwner
    {
        // If l2 token is zero address, remove any approval for the l1 token
        // Else set approval to max for the l1 token
        uint256 approveAmount = 0;
        if (_l2Token != address(0)) {
            approveAmount = type(uint256).max;
        }
        IERC20(_l1Token).safeApprove(
            OPTIMISM_L1_STANDARD_BRIDGE,
            approveAmount
        );

        emit UpdateTokenMapping(_l1Token, l2AddrMap[_l1Token], _l2Token);
        l2AddrMap[_l1Token] = _l2Token;
    }
}
