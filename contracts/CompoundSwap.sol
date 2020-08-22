pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./Swap.sol";
import "./CERC20.sol";

// TODO fee model - make earnings from Compound fee-free, but liquidity rewards have a % taken for admins
// TODO make sure it's compatible with withdrawAdminFees
// TODO mint CWBY and lock until the "switch is flipped"
// TODO governance - _A, reblanceThreshold, reserveRatio
// TODO withdrawAdminFees
// TODO calculate profits? getVirtualPrice doesn't cover liquidity rewards
// TODO note that interest in Compound isn't used to calculate the invariant
// as this would open up (even more) attacks

/**
 * @title CompoundSwap
 * @notice A `Swap` extension that wraps and unwraps pooled tokens in cTokens,
 *         enabling LPs to earn interest on Compound as well as trading fees.
 */
contract CompoundSwap is Swap {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using Math for uint256;

    uint256 public reserveRatio;
    uint256 public rebalanceThreshold;
    uint256 constant RESERVE_RATIO_DENOMINATOR = 10000;

    CERC20[] public cTokens;
    uint256[] public underlyingBalances;

    // TODO redeem and mint events with token index
    // TODO consider events for rebalancing

    /**
     * @dev Construct a new Swap that stores some of the backing tokens in
     *      Compound to generate interest.
     * @param _pooledTokens see `Swap`
     * @param precisions see `Swap`
     * @param _cTokens an array of Compound cERC20 contracts mapping to each
     *        pooled asset
     * @param _reserveRatio a target ratio of pooled tokens to leave unwrapped.
     *        Divided by RESERVE_RATIO_DENOMINATOR to calculate rebalances
     * @param lpTokenName see `Swap`
     * @param lpTokenSymbol see `Swap`
     * @param _A see `Swap`
     * @param _fee see `Swap`
     */
    constructor(
        IERC20[] memory _pooledTokens, uint256[] memory precisions,
		CERC20[] memory _cTokens, uint256 _reserveRatio,
        string memory lpTokenName, string memory lpTokenSymbol,
        uint256 _A, uint256 _fee
    ) public Swap(_pooledTokens, precisions, lpTokenName, lpTokenSymbol, _A, _fee) {
        require(
            _cTokens.length == _pooledTokens.length,
            "Each pooled token needs a specified cERC20 or the 0 address"
        );
        require(
            _cTokens.length == _pooledTokens.length,
            "Each pooled token needs a specified cERC20 or the 0 address"
        );
        cTokens = _cTokens;
        underlyingBalances = new uint256[](_cTokens.length);
        reserveRatio = _reserveRatio;
    }

    /**
     * @notice Rebalance the assets in reserve versus at risk by minting and
     *         redeeming cTokens, targeting `reserveRatio`.
     */
    function rebalance() public nonReentrant onlyUnpaused {
        // pull interest into pool and increase balances
        uint256[] memory updatedBalances = totalAssets();
        for (uint i = 0; i < swapStorage.balances.length; i++) {
            // TODO if this invariant doesn't hold, there's a bug in one
            // of the cToken contracts or contract assets have been seized
            if (updatedBalances[i] >= swapStorage.balances[i]) {
                underlyingBalances[i] = underlyingBalances[i].add(
                    updatedBalances[i].sub(swapStorage.balances[i]));
                swapStorage.balances[i] = updatedBalances[i];
            }
        }
        (
            uint256[] memory toSupply,
            uint256[] memory toRedeem
        ) = calculateRebalanceAmounts();

        for (uint i = 0; i < swapStorage.balances.length; i++) {
            if (toRedeem[i] > 0) {
                uint success = cTokens[i].redeemUnderlying(toRedeem[i]);
                require(
                    success == 0,
                    "Something went wrong redeeming a cToken"
                );
            } else if (toSupply[i] > 0) {
                swapStorage.pooledTokens[i].approve(
                    address(cTokens[i]),
                    toSupply[i]
                );
                cTokens[i].mint(toSupply[i]);
            }
        }
    }

    /**
     * @notice Calculate the pool's risked assets by checking each cToken's
     *         underlying balance
     * @return an array of amounts correspondng to each token's underlying
     *         balance in Compound. Tokens without a cToken contract won't
     *         have assets at risk.
     */
    function riskedAssets() public view returns (uint256[] memory) {
        uint256[] memory assets = new uint256[](
            swapStorage.pooledTokens.length);
        for (uint i = 0; i < swapStorage.pooledTokens.length; i++) {
            if (address(cTokens[i]) != address(0)) {
                uint256 cBalance = cTokens[i].balanceOfUnderlying(
                    address(this));
                assets[i] = swapStorage.balances[i].sub(
                    underlyingBalances[i]).add(cBalance);
            }
        }
        return assets;
    }

    /**
     * @notice Calculate the pool's total assets, including cToken underlying
     *         balances.
     * @return an array of amounts correspondng to each token's liquid reserve
     *         plus their balance at risk on Compound.
     */
    function totalAssets() public view returns (uint256[] memory) {
        uint256[] memory assets = riskedAssets();
        for (uint i = 0; i < swapStorage.balances.length; i++) {
            assets[i] = swapStorage.balances[i].add(assets[i]);
        }
        return assets;
    }

    /**
     * @notice Calculate the cToken supply and redemption necessary to bring all
     *         assets back to the `reserveRatio`.
     * @return two arrays corresponding to pooled tokens. The first are amounts
     *         to supply to Compound / mint as cTokens, the second are the
     *         amounts to redeem.
     */
    function calculateRebalanceAmounts()
        internal view returns (uint256[] memory, uint256[] memory) {
        uint256[] memory toSupply = new uint256[](
            swapStorage.pooledTokens.length
        );
        uint256[] memory toRedeem = new uint256[](
            swapStorage.pooledTokens.length
        );

        for (uint i = 0; i < swapStorage.pooledTokens.length; i++) {
            if (address(0) == address(cTokens[i])) {
                continue;
            }
            uint256 reserveTarget = swapStorage.balances[i].mul(
                reserveRatio).div(RESERVE_RATIO_DENOMINATOR);
            uint256 reserveRecorded = swapStorage.balances[i].sub(
                underlyingBalances[i]);
            if (reserveTarget > reserveRecorded) {
                toRedeem[i] = reserveTarget.sub(reserveRecorded);
            } else {
                toSupply[i] = reserveRecorded.sub(reserveTarget);
            }
        }

        return (toSupply, toRedeem);
    }

    /**
     * @notice Return the unwrapped balance for a particular token.
     * @return a uint at the same precision as the pooled token (not cToken)
     */
    function amountAvailable(uint256 tokenIndex) public view returns (uint256) {
        require(
            tokenIndex < swapStorage.pooledTokens.length,
            "Token isn't in pool!"
        );
        return swapStorage.balances[tokenIndex].sub(underlyingBalances[tokenIndex]);
    }

    /**
     * @notice Ensure there's at least `amounts` of each token unwrapped from
     *         cTokens, otherwise redeem what's necessary to get there.
     * @dev Reverts if impossible to ensure
     * @param amounts an array mapping to tokens. Accepts shorter arrays for gas
     *        reasons. Arrays longer than the number of token contracts
     *        supported will have the extra amounts at the end ignored.
     */
    function ensureAmountsAvailable(uint256[] memory amounts) internal {
        uint minLength = amounts.length.min(swapStorage.pooledTokens.length);
        for (uint i = 0; i < minLength; i++) {
            uint256 avail = amountAvailable(i);
            if (avail < amounts[i] && address(cTokens[i]) != address(0)) {
                uint256 code = cTokens[i].redeemUnderlying(
                    amounts[i].sub(avail));
                require(code == 0, "Something went wrong redeeming a cToken");
            }
        }
    }

    /**
     * @notice Ensure there's at least `amounts` of each token minted as
     *         cTokens, otherwise mint what's necessary to get there.
     * @dev Reverts if impossible to ensure
     * @param amounts an array mapping to tokens. Accepts shorter arrays for gas
     *        reasons. Arrays longer than the number of token contracts
     *        supported will have the extra amounts at the end ignored.
     */
    function ensureAmountsSupplied(uint256[] memory amounts) internal {
        uint minLength = amounts.length.min(swapStorage.pooledTokens.length);
        for (uint i = 0; i < minLength; i++) {
            uint256 supplied = swapStorage.balances[i].sub(amountAvailable(i));
            if (supplied < amounts[i] && address(cTokens[i]) != address(0)) {
                uint256 toSupply = amounts[i].sub(supplied);
                // Approve transfer on the ERC20 contract
                swapStorage.pooledTokens[i].approve(
                    address(cTokens[i]),
                    toSupply
                );
                uint256 code = cTokens[i].redeemUnderlying(toSupply);
                require(code == 0, "Something went wrong minting cTokens");
            }
        }
    }

    /**
     * @notice Update balances and underlyingBalances to account for earnings
     *         from Compound.
     */
    function updateUnderlyingBalances() internal {
        for (uint i = 0; i < swapStorage.balances.length; i++) {
            if (address(cTokens[i]) != address(0)) {
                uint256 oldUnderlying = underlyingBalances[i];
                underlyingBalances[i] = cTokens[i].balanceOfUnderlying(
                    address(this));
                // NB if this number has gone down, the Compound invariant
                // has failed
                swapStorage.balances[i] = swapStorage.balances[i].sub(
                    oldUnderlying).add(underlyingBalances[i]);
            }
        }
    }

    /**
     * @notice Burn LP tokens and remove liquidity, unwrapping any pooled tokens
     *         necessary.
     * @param amount see `Swap`
     * @param minAmounts see `Swap`
     */
    function removeLiquidity(uint256 amount, uint256[] memory minAmounts)
        public override nonReentrant onlyUnpaused {

        uint256[] memory toRemove = swapStorage.calculateRemoveLiquidity(amount);

        ensureAmountsAvailable(toRemove);

        super.removeLiquidity(amount, minAmounts);
    }


    /**
     * @notice Remove liquidity from the pool, weighted differently than the
     *         pool's current balances. Unwrap any pooled tokens necessary.
     * @param amounts see `Swap`
     * @param maxBurnAmount see `Swap`
     */
    function removeLiquidityImbalance(
        uint256[] memory amounts, uint256 maxBurnAmount
    ) public override nonReentrant onlyUnpaused {

        ensureAmountsAvailable(amounts);

        super.removeLiquidityImbalance(amounts, maxBurnAmount);
    }


    /**
     * @notice Remove liquidity from the pool all in one token.
     * @param tokenAmount the amount of the token you want to receive
     * @param tokenIndex the index of the token you want to receive
     * @param minAmount the minimum amount to withdraw, otherwise revert
     */
    function removeLiquidityOneToken(
        uint256 tokenAmount, uint8 tokenIndex, uint256 minAmount
    ) public override nonReentrant onlyUnpaused {
        require(
            tokenIndex < swapStorage.pooledTokens.length,
            "Token isn't in pool!"
        );
        require(
            tokenAmount <= swapStorage.balances[tokenIndex],
            "Not enough liquidity!"
        );

        uint256[] memory amounts = new uint256[](
            swapStorage.pooledTokens.length);
        amounts[tokenIndex] = tokenAmount;

        ensureAmountsAvailable(amounts);

        super.removeLiquidityOneToken(tokenAmount, tokenIndex, minAmount);
    }

    /**
     * @notice Add liquidity and mint LP tokens, then rebalance token reserves.
     * @param amounts see `Swap`
     * @param minToMint see `Swap`
     */
    function addLiquidity(uint256[] memory amounts, uint256 minToMint
    ) public override nonReentrant onlyUnpaused {
        super.addLiquidity(amounts, minToMint);
        rebalance();
    }


    function swap(
        uint8 tokenIndexFrom, uint8 tokenIndexTo, uint256 dx, uint256 minDy
    ) public override nonReentrant onlyUnpaused {
        // if there's not enough in our reserves, unwrap enough to settle
        // this swap's min + get us back to the right reserve
        uint256[] memory amounts = new uint256[](swapStorage.balances.length);
        amounts[tokenIndexTo] = swapStorage.balances[tokenIndexTo].mul(
            reserveRatio).div(RESERVE_RATIO_DENOMINATOR).add(minDy);
        ensureAmountsAvailable(amounts);
        super.swap(tokenIndexFrom, tokenIndexTo, dx, minDy);
    }

}
