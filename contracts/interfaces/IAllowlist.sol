pragma solidity 0.6.12;

interface IAllowlist {
    function getAllowedAmount(address poolAddress, address user)
        external
        view
        returns (uint256);

    function getPoolCap(address poolAddress) external view returns (uint256);
}
