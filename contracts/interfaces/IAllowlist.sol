pragma solidity 0.5.17;

interface IAllowlist {
    function getAllowedAmount(address poolAddress, address user) external view returns (uint256);
    function getPoolCap(address poolAddress) external view returns (uint256);
}
