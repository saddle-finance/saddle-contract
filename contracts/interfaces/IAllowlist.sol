pragma solidity 0.7.6;

interface IAllowlist {
    function getAllowedAmount(address poolAddress, address user) external view returns (uint256);
    function getPoolCap(address poolAddress) external view returns (uint256);
}
