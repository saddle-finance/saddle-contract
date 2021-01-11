pragma solidity 0.6.12;

interface ICERC20 {
    function mint(uint256) external returns (uint256);
    function exchangeRateCurrent() external returns (uint256);
    function supplyRatePerBlock() external returns (uint256);
    function redeem(uint256) external returns (uint256);
    function redeemUnderlying(uint256) external returns (uint256);
    function balanceOfUnderlying(address account) external view returns (uint256);
}
