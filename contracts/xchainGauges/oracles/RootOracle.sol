// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";

/// @notice Point struct is used to store the veSDL data from the parent chain
/// @param bias Bias of the amount at the time of the update
/// @param slope Slope of amount per second that should be reduced
/// @param ts Timestamp of the update
struct Point {
    int128 bias;
    int128 slope;
    uint256 ts;
}

// Interface compatible with AnyCall contract
interface ICallProxy {
    function anyCall(
        address _to,
        bytes calldata _data,
        address _fallback,
        uint256 _toChainId,
        uint256 _flags
    ) external;
}

// Inteface compatible with RootGaugeFactory
interface Factory {
    function get_bridger(uint256 _chain_id) external view returns (address);
}

// Inteface compatible with VotingEscrow
interface votingEscrow {
    function epoch() external view returns (uint256);

    function point_history(uint256 _idx) external view returns (Point memory);

    function user_point_epoch(address _user) external view returns (uint256);

    function user_point_history(address _user, uint256 _idx)
        external
        view
        returns (Point memory);
}

/// @title Root Oracle contract
/// @notice RootOracle contract is responsible for reading veSDL data from this chain
/// and sending it to the child chains
contract RootOracle {
    // consts
    // RootGaugeFactory contract address
    address public immutable FACTORY;
    // VotingEscrow contract address
    address public immutable VE;

    // events
    /// @notice Emitted when ownership is transferred
    /// @param oldOwner Previous owner of the contract
    /// @param newOwner New owner of the contract
    event TransferOwnership(address oldOwner, address newOwner);

    /// @notice Emitted when call proxy address is updated
    /// @param oldCallProxy Previous call proxy address
    /// @param newCallProxy New call proxy address
    event UpdateCallProxy(address oldCallProxy, address newCallProxy);

    // address for call proxy contract that is responsible for bridging the data
    address public callProxy;
    // address of the owner of the contract
    address public owner;
    // address of the future owner of the contract
    address public futureOwner;

    /// @notice Constructor for RootOracle contract
    /// @param _factory RootGaugeFactory contract address
    /// @param _ve VotingEscrow contract address
    /// @param _callProxy CallProxy contract address. This should be set to AnyCallTranslator.
    constructor(
        address _factory,
        address _ve,
        address _callProxy
    ) {
        FACTORY = _factory;
        VE = _ve;

        callProxy = _callProxy;
        emit UpdateCallProxy(address(0), _callProxy);

        owner = msg.sender;
        emit TransferOwnership(address(0), msg.sender);
    }

    /// @notice Push the veSDL data of the caller to the child chain
    /// @dev This will be reverted if caller doesn't have any veSDL balance
    /// @param _chainId Chain ID of the child chain to push the data
    function push(uint256 _chainId) external {
        address user = msg.sender;
        require(
            Factory(FACTORY).get_bridger(_chainId) != address(0),
            "Bridger not found"
        );

        require(IERC20(VE).balanceOf(user) != 0, "No ve balance");
        Point memory userPoint = votingEscrow(VE).user_point_history(
            user,
            votingEscrow(VE).user_point_epoch(user)
        );
        Point memory globalPoint = votingEscrow(VE).point_history(
            votingEscrow(VE).epoch()
        );
        ICallProxy(callProxy).anyCall(
            address(this),
            abi.encodeWithSelector(
                bytes4(
                    keccak256(
                        "receive((int128,int128,uint256),(int128,int128,uint256),address)"
                    )
                ),
                userPoint,
                globalPoint,
                user
            ),
            address(0),
            _chainId,
            0
        );
    }

    /// @notice Push the veSDL data of an account to the child chain
    /// @dev This will be reverted if user doesn't have any veSDL balance
    /// @param _chainId Chain ID of the child chain to push the data
    /// @param _user Address of the account to push the data for
    function push(uint256 _chainId, address _user) external {
        require(
            Factory(FACTORY).get_bridger(_chainId) != address(0),
            "Bridger not found"
        );
        require(IERC20(VE).balanceOf(_user) != 0, "No ve balance");
        Point memory userPoint = votingEscrow(VE).user_point_history(
            _user,
            votingEscrow(VE).user_point_epoch(_user)
        );
        Point memory globalPoint = votingEscrow(VE).point_history(
            votingEscrow(VE).epoch()
        );
        ICallProxy(callProxy).anyCall(
            address(this),
            abi.encodeWithSelector(
                bytes4(
                    keccak256(
                        "receive((int128,int128,uint256),(int128,int128,uint256),address)"
                    )
                ),
                userPoint,
                globalPoint,
                _user
            ),
            address(0),
            _chainId,
            0
        );
    }

    /// @notice Set the call proxy address
    /// @dev This can only be called by the owner of the contract
    /// @param _newCallProxy Address of the new call proxy
    function setCallProxy(address _newCallProxy) external {
        require(msg.sender == owner, "not owner");
        emit UpdateCallProxy(callProxy, _newCallProxy);
        callProxy = _newCallProxy;
    }

    /// @notice Commit to transfer of the ownership of the contract
    /// @dev This can only be called by the owner of the contract
    /// @param _futureOwner Address of the new owner
    function commitTransferOwnership(address _futureOwner) external {
        require(msg.sender == owner);
        futureOwner = _futureOwner;
    }

    /// @notice Accept the ownership of the contract
    /// @dev This can only be called by the future owner of the contract
    function acceptTransferOwnership() external {
        require(msg.sender == futureOwner);
        emit TransferOwnership(owner, msg.sender);
        owner = msg.sender;
    }
}
