// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts-4.4.0/token/ERC20/IERC20.sol";

interface IVotingEscrow is IERC20 {
    struct LockedBalance {
        int128 amount;
        uint256 end;
    }

    function balanceOf(address) external view override returns (uint256);

    function totalSupply() external view override returns (uint256);

    function locked__end(address) external view returns (uint256);

    function locked(address) external view returns (LockedBalance memory);

    function deposit_for(address, uint256) external;

    function is_unlocked() external view returns (bool);
}
