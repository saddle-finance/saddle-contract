pragma solidity 0.5.17;

interface ICERC20 {
    function mint(uint256) external returns (uint256);
    function exchangeRateCurrent() external returns (uint256);
    function supplyRatePerBlock() external returns (uint256);
    function redeem(uint) external returns (uint);
    function redeemUnderlying(uint) external returns (uint);
    function balanceOfUnderlying(address account) external view returns (uint);
}
