// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";

interface IGauge {
    function deposit_reward_token(address _reward_token, uint256 amount) external view; // nonpayable
    }


contract RewardForwarder {

    // consts
    address immutable GAUGE;

    constructor(address _gauge) {
        GAUGE = _gauge;
    }

    function depositRewardToken (address _rewardToken) external view { //can this really be a view? Is recommened to be
        IGauge(GAUGE).deposit_reward_token(_rewardToken, IERC20(_rewardToken).balanceOf(address(this)));
    }

    // function allow(address _rewardToken) external {
    //  response: Bytes[32] = raw_call(
    //     _reward_token,
    //     _abi_encode(GAUGE, MAX_UINT256, method_id=method_id("approve(address,uint256)")),
    //     max_outsize=32,
    // )
    // if len(response) != 0:
    //     assert convert(response, bool)  
    //}

    function gauge() external view returns(address) {
        return(GAUGE);
    }
}
