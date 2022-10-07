// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.4.0/access/Ownable.sol";
import "@openzeppelin/contracts-4.4.0/token/ERC20/utils/SafeERC20.sol";
import "./Bridger.sol";

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

    function cost() external pure override returns (uint256) {
        return 0;
    }

    function check(address) external pure override returns (bool) {
        return true;
    }

    function setGasLimit(uint32 _gasLimit) external onlyOwner {
        emit UpdateGasLimit(gasLimit, _gasLimit);
        gasLimit = _gasLimit;
    }

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

    receive() external payable override {}
}
