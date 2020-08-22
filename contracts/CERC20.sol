pragma solidity ^0.6.12;

interface CERC20 {
    function mint(uint256) external returns (uint256);
    function exchangeRateCurrent() external returns (uint256);
    function supplyRatePerBlock() external returns (uint256);
    function redeem(uint) external returns (uint);
    function redeemUnderlying(uint) external returns (uint);
    function balanceOfUnderlying(address account) external view returns (uint);
}

library CERC20Utils {
    function getUnderlyingBalances(address[] memory cTokens, address account) public view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](cTokens.length);
        for (uint i = 0; i<balances.length; i++) {
            if (cTokens[i] != address(0)) {
                balances[i] = CERC20(cTokens[i]).balanceOfUnderlying(account);
            }
        }
        return balances;
    }
}
