// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";

/// @title Child Oracle contract
/// @notice ChildOracle contract is responsible for receiving data from the parent chain
contract ChildOracle {
    // address for call proxy contract that is responsible for calling the oracle
    address public callProxy;
    // address of the owner of the contract
    address public owner;
    // address of the future owner of the contract
    address public futureOwner;

    // mapping of user address to the Point data that is received from the parent chain
    mapping(address => Point) public userPoints;
    // total supply data that is received from the parent chain
    Point public globalPoint;

    /// @notice Point struct is used to store the veSDL data from the parent chain
    /// @param bias Bias of the amount at the time of the update
    /// @param slope Slope of amount per second that should be reduced
    /// @param ts Timestamp of the update
    struct Point {
        int128 bias;
        int128 slope;
        uint256 ts;
    }

    /// @notice Emitted when ownership is transferred
    /// @param oldOwner Previous owner of the contract
    /// @param newOwner New owner of the contract
    event TransferOwnership(address oldOwner, address newOwner);

    /// @notice Emitted when call proxy address is updated
    /// @param oldCallProxy Previous call proxy address
    /// @param newCallProxy New call proxy address
    event UpdateCallProxy(address oldCallProxy, address newCallProxy);

    /// @notice Emitted when this contract receives data from the parent chain
    /// @param userPoint Point data of the user
    /// @param globalPoint Point data of the total supply
    /// @param user User address
    event Receive(Point userPoint, Point globalPoint, address user);

    /// @notice Constructor for ChildOracle contract
    /// @dev Sets the owner as the deployer of the contract
    /// @param _callProxy CallProxy contract address. This should be set to AnyCallTranslator.
    constructor(address _callProxy) {
        callProxy = _callProxy;
        emit UpdateCallProxy(address(0), _callProxy);
        owner = msg.sender;
        emit TransferOwnership(address(0), msg.sender);
    }

    /// @notice Read the stored veSDL balance of the user
    /// @param _user User address
    /// @return veSDL balance of the user
    function balanceOf(address _user) external view returns (uint256) {
        Point memory lastPoint = userPoints[_user];
        lastPoint.bias -=
            lastPoint.slope *
            int128(int256(block.timestamp - lastPoint.ts));
        if (lastPoint.bias < 0) {
            lastPoint.bias = 0;
        }
        return (uint256(uint128(lastPoint.bias)));
    }

    /// @notice Read the stored veSDL total supply
    /// @return veSDL total supply
    function totalSupply() external view returns (uint256) {
        Point memory lastPoint = globalPoint;
        lastPoint.bias -=
            lastPoint.slope *
            int128(int256(block.timestamp - lastPoint.ts));
        if (lastPoint.bias < 0) {
            lastPoint.bias = 0;
        }
        return (uint256(uint128(lastPoint.bias)));
    }

    /// @notice Receive data from the parent chain for a user account
    /// @dev This function can only be called by the callProxy contract.
    /// Until this data is received, the user's veSDL balance will be treated as 0.
    /// @param _userPoint veSDL balance data of the user
    /// @param _globalPoint veSDl total supply data
    /// @param _user User address
    function receive(
        Point memory _userPoint,
        Point memory _globalPoint,
        address _user
    ) external {
        require(msg.sender == callProxy, "not translator");
        Point storage prevUserPoint = userPoints[_user];
        if (_userPoint.ts > prevUserPoint.ts) {
            userPoints[_user] = _userPoint;
        }

        Point memory prevGlobalPoint = globalPoint;
        if (_globalPoint.ts > prevGlobalPoint.ts) {
            globalPoint = _globalPoint;
        }

        emit Receive(_userPoint, _globalPoint, _user);
    }

    /// @notice Set the callProxy contract address
    /// @dev callProxy contract address should be set to AnyCallTranslator.
    /// @param _newCallProxy CallProxy contract address
    function setCallProxy(address _newCallProxy) external {
        require(msg.sender == owner, "not owner");
        emit UpdateCallProxy(callProxy, _newCallProxy);
        callProxy = _newCallProxy;
    }

    /// @notice Commit to transfer ownership of the contract
    /// @param _futureOwner Address of the new owner
    function commitTransferOwnership(address _futureOwner) external {
        require(msg.sender == owner);
        futureOwner = _futureOwner;
    }

    /// @notice Accept the transfer of ownership of the contract
    /// @dev Must be called by the futureOwner
    function acceptTransferOwnership() external {
        require(msg.sender == futureOwner);
        emit TransferOwnership(owner, msg.sender);
        owner = msg.sender;
    }
}
