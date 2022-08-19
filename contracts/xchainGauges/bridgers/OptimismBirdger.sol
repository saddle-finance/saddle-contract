// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";

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

contract ArbitrumBridger {
    // consts
    address private SDL;
    address private OP_SDL;
    address private constant OPTIMISM_L1_STANDARD_BRIDGE =
        0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1;
    address private constant OPTIMISM_L2_STANDARD_BRIDGE =
        0x4200000000000000000000000000000000000010;
    uint256 private constant MAX_UINT256 = 2**256 - 1;
    address private constant ZERO_ADDRESS =
        0x0000000000000000000000000000000000000000;
    // vars
    uint32 private gasLimit;

    mapping(address => bool) public approved;

    // owner
    address public owner;
    address public futureOwner;

    using SafeERC20 for IERC20;

    event TransferOwnership(address oldOwner, address newOwner);

    event UpdateGasLimit(
        uint32 oldGasLimit,
        uint32 newGasLimit
    );

    constructor(
        uint32 _gasLimit,
        address _SDL,
        address _OP_SDL
    ) {
        SDL = _SDL;
        OP_SDL = _OP_SDL;
        gasLimit = _gasLimit;
        emit UpdateGasLimit(
            uint32(0),
            gasLimit
        );

        // approve token transfer to gateway
        IERC20 sdlToken = IERC20(SDL);
        // TODO: doesn't allow for safeApprove?
        assert(sdlToken.approve(OPTIMISM_L1_STANDARD_BRIDGE, MAX_UINT256));
        approved[SDL] = true;
        owner = msg.sender;
        emit TransferOwnership(ZERO_ADDRESS, msg.sender);
    }

    function bridge(
        address _token,
        address _to,
        uint256 _amount
    ) external payable {

        // TODO: doesn't allow for safeTransferFrom?
        assert(IERC20(_token).transferFrom(msg.sender, address(this), _amount));
        if (_token != SDL && !approved[_token]) {
            // TODO: doesn't allow for safeApprove?
            assert(
                IERC20(_token).approve(
                    OPTIMISM_L1_STANDARD_BRIDGE,
                    MAX_UINT256
                )
            );
            approved[_token] = true;
        }
        IOptimismStandardBridge(OPTIMISM_L1_STANDARD_BRIDGE).depositERC20To(
        SDL,   
        OP_SDL,      
        _to, 
        _amount,                 
        2000000,                                   
        "0x");
    }

    function cost() external view returns (uint256) {
        return (gasLimit );
    }

    function setGasLimit(
        uint32 _gasLimit
    ) external {
        require(msg.sender == owner, "error msg");
        emit UpdateGasLimit(
            gasLimit,
            _gasLimit
        );
        gasLimit = _gasLimit;
    }

    function commitTransferOwnership(address _futureOwner) external {
        require(msg.sender == owner);
        futureOwner = _futureOwner;
    }

    function acceptTransferOwnership() external {
        require(msg.sender == futureOwner);
        emit TransferOwnership(owner, msg.sender);
        owner = msg.sender;
    }
}