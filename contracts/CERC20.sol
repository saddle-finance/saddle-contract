pragma solidity 0.5.17;

interface CERC20 {
    function mint(uint256) external returns (uint256);
    function exchangeRateCurrent() external returns (uint256);
    function supplyRatePerBlock() external returns (uint256);
    function redeem(uint) external returns (uint);
    function redeemUnderlying(uint) external returns (uint);
    function balanceOfUnderlying(address account) external view returns (uint);
}

library CERC20Utils {
    function getUnderlyingBalances(address[] storage cTokens, address account) external view returns (uint256[] memory) {
        require(account != address(0), "account == address(0)");
        uint256[] memory balances = new uint256[](cTokens.length);
        for (uint i = 0; i<balances.length; i++) {
            if (cTokens[i] != address(0)) {
                balances[i] = CERC20(cTokens[i]).balanceOfUnderlying(account);
            }
        }
        return balances;
    }
}
