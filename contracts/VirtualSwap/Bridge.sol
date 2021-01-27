pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "synthetix/contracts/interfaces/IAddressResolver.sol";
import "synthetix/contracts/interfaces/ISynthetix.sol";
import "synthetix/contracts/interfaces/IVirtualSynth.sol";
import "synthetix/contracts/interfaces/IExchanger.sol";
import "synthetix/contracts/interfaces/IExchangeRates.sol";
import "./VirtualTokenNFT.sol";
import "../interfaces/IVirtualLike.sol";
import "../interfaces/ISwap.sol";

import "hardhat/console.sol";
import "./SynthSwapper.sol";

contract Proxy {
    address public target;
}

contract Target {
    address public proxy;
}

// TODO Add NatSpec tags
contract Bridge is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event SynthIndex(
        address indexed swap,
        uint8 synthIndex,
        bytes32 currencyKey
    );
    event TokenToSynth(
        address indexed requester,
        ISwap swapPool,
        IERC20 tokenFrom,
        uint256 tokenFromInAmount,
        uint256 vSynthToOutAmount,
        uint256 queueId
    );
    event SynthToToken(
        address indexed requester,
        ISwap swapPool,
        IERC20 synthFrom,
        uint256 synthFromInAmount,
        uint256 vTokenToOutAmount,
        uint256 queueId
    );
    event TokenToToken(
        address indexed requester,
        ISwap[2] swapPools,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256[2] minAmounts,
        uint256 queueId
    );

    // Mainnet Synthetix contracts
    IAddressResolver constant SYNTHETIX_RESOLVER =
        IAddressResolver(0x4E3b31eB0E5CB73641EE1E65E7dCEFe520bA3ef2);
    ISynthetix constant SYNTHETIX =
        ISynthetix(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    IExchanger EXCHANGER;

    uint256 constant MAX_UINT256 = 2**256 - 1;
    uint8 constant MAX_UINT8 = 2**8 - 1;
    bytes32 constant EXCHANGE_RATES_NAME = "ExchangeRates";

    mapping(uint256 => PendingSynthToTokenSettlement)
        public pendingSynthToTokenSettlement;
    mapping(uint256 => PendingSynthSettlement) public pendingSynthSettlement;
    uint256 public settlementLength;

    // Maps swap address to its index + 1
    mapping(address => uint8) public synthIndexesPlusOne;
    // Maps swap address to the synth address the swap pool contains
    mapping(address => address) public synthAddresses;
    mapping(address => bytes32) public synthKeys;

    struct PendingSynthSettlement {
        SynthSwapper ss;
        bytes32 synthKey;
        address recipient;
        bool settled;
    }

    // Settlement queue
    struct PendingSynthToTokenSettlement {
        SynthSwapper ss;
        bytes32 synthKey;
        address recipient;
        ISwap swap;
        uint8 tokenToIndex;
        uint256 minAmount;
        bool settled;
    }

    struct TokenToSynthInfo {
        IERC20 tokenFrom;
        uint8 synthIndex;
        uint256 mediumSynthAmount;
        uint256 destSynthAmount;
        SynthSwapper synthSwapper;
        uint256 queueId;
    }

    struct SynthToTokenInfo {
        bytes32 mediumSynthKey;
        SynthSwapper synthSwapper;
        uint8 mediumSynthIndex;
    }

    struct TokenToTokenInfo {
        SynthSwapper synthSwapper;
        bytes32 secondSynthKey;
    }

    constructor() public {
        EXCHANGER = IExchanger(
            SYNTHETIX_RESOLVER.getAddress(
                0x45786368616e6765720000000000000000000000000000000000000000000000
            )
        );
    }

    function maxSecsLeftInWaitingPeriod(uint256 queueId)
        external
        view
        returns (uint256)
    {
        PendingSynthSettlement memory pss = pendingSynthSettlement[queueId];
        address synthSwapper;
        bytes32 synthKey;

        if (address(pss.ss) != address(0)) {
            synthSwapper = address(pss.ss);
            synthKey = pss.synthKey;
        } else {
            PendingSynthToTokenSettlement memory pstts =
                pendingSynthToTokenSettlement[queueId];
            synthSwapper = address(pstts.ss);
            synthKey = pstts.synthKey;
        }

        return EXCHANGER.maxSecsLeftInWaitingPeriod(synthSwapper, synthKey);
    }

    function settled(uint256 queueId) external view returns (bool) {
        require(queueId < settlementLength, "queueId is not recognized");
        return
            pendingSynthSettlement[queueId].settled ||
            pendingSynthToTokenSettlement[queueId].settled;
    }

    function _getCurrencyKeyFromProxy(address proxyAddress)
        internal
        view
        returns (bytes32)
    {
        return ISynth(Proxy(proxyAddress).target()).currencyKey();
    }

    function settle(uint256 queueId) external {
        _settle(queueId);
    }

    function _settle(uint256 queueId) internal {
        require(queueId < settlementLength, "queueId is not recognized");

        if (address(pendingSynthSettlement[queueId].ss) != address(0)) {
            PendingSynthSettlement memory pss = pendingSynthSettlement[queueId];
            require(
                EXCHANGER.maxSecsLeftInWaitingPeriod(
                    address(pss.ss),
                    pss.synthKey
                ) == 0
            );
            EXCHANGER.settle(address(pss.ss), pss.synthKey);
            IERC20 synth =
                IERC20(
                    Target(SYNTHETIX_RESOLVER.getSynth(pss.synthKey)).proxy()
                );
            pss.ss.withdraw(
                synth,
                pss.recipient,
                synth.balanceOf(address(pss.ss))
            );
            pendingSynthSettlement[queueId].settled = true;
        } else {
            PendingSynthToTokenSettlement memory pstts =
                pendingSynthToTokenSettlement[queueId];
            require(
                EXCHANGER.maxSecsLeftInWaitingPeriod(
                    address(pstts.ss),
                    pstts.synthKey
                ) == 0
            );
            EXCHANGER.settle(address(pstts.ss), pstts.synthKey);
            IERC20 synth =
                IERC20(
                    Target(SYNTHETIX_RESOLVER.getSynth(pstts.synthKey)).proxy()
                );
            uint256 synthBalance = synth.balanceOf(address(pstts.ss));
            pstts.ss.withdraw(synth, address(this), synthBalance);

            synth.approve(address(pstts.swap), synthBalance);
            try
                pstts.swap.swap(
                    _getSynthIndex(pstts.swap),
                    pstts.tokenToIndex,
                    synthBalance,
                    pstts.minAmount,
                    block.timestamp
                )
            returns (uint256 tokenToAmount) {
                IERC20 tokenTo = pstts.swap.getToken(pstts.tokenToIndex);
                tokenTo.safeTransfer(pstts.recipient, tokenToAmount);
            } catch {
                synth.safeTransfer(pstts.recipient, synthBalance);
            }
            pendingSynthToTokenSettlement[queueId].settled = true;
        }
    }

    function settleRange(uint256 min, uint256 max) external {
        // Limit range to 25
        require(max.sub(min) < 26, "Range must be lower than 26");

        // Limit queuePos + range from exceeding queueSize
        if (max > settlementLength) {
            max = settlementLength;
        }

        // Iterate through queueData and call settle()
        for (uint256 i = min; i < max; i++) {
            _settle(i);
        }
    }

    function _addToPendingSynthSettlementQueue(
        PendingSynthSettlement memory pss
    ) internal returns (uint256) {
        require(
            settlementLength < MAX_UINT256,
            "settlementLength reached max size"
        );
        pendingSynthSettlement[settlementLength] = pss;
        return settlementLength++;
    }

    function _addToPendingSynthToTokenSettlementQueue(
        PendingSynthToTokenSettlement memory pstts
    ) internal returns (uint256) {
        require(
            settlementLength < MAX_UINT256,
            "settlementLength reached max size"
        );
        pendingSynthToTokenSettlement[settlementLength] = pstts;
        return settlementLength++;
    }

    function calcTokenToSynth(
        ISwap swap,
        uint8 tokenFromIndex,
        bytes32 synthOutKey,
        uint256 tokenInAmount
    ) external view returns (uint256) {
        uint8 mediumSynthIndex = _getSynthIndex(swap);
        uint256 expectedMediumSynthAmount =
            swap.calculateSwap(tokenFromIndex, mediumSynthIndex, tokenInAmount);
        bytes32 mediumSynthKey =
            _getCurrencyKeyFromProxy(_getSynthAddress(swap));

        IExchangeRates exchangeRates =
            IExchangeRates(SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME));
        return
            exchangeRates.effectiveValue(
                mediumSynthKey,
                expectedMediumSynthAmount,
                synthOutKey
            );
    }

    // Swaps a token from a Saddle's pool to any virtual synth
    function tokenToSynth(
        ISwap swap,
        uint8 tokenFromIndex,
        bytes32 synthOutKey,
        uint256 tokenInAmount,
        uint256 minAmount,
        address recipient
    ) external returns (uint256) {
        // Struct to hold data for this function
        TokenToSynthInfo memory v =
            TokenToSynthInfo(IERC20(0), 0, 0, 0, SynthSwapper(0), 0);

        if (recipient == address(0)) {
            recipient = msg.sender;
        }

        // Transfer token from msg.sender
        v.tokenFrom = swap.getToken(tokenFromIndex); // revert when token not found in swap pool
        v.tokenFrom.safeTransferFrom(msg.sender, address(this), tokenInAmount);
        tokenInAmount = v.tokenFrom.balanceOf(address(this));
        v.tokenFrom.approve(address(swap), tokenInAmount);

        // Swaps token to the supported synth in the pool (sETH, sBTC, or sUSD depending on the pool)
        v.synthIndex = _getSynthIndex(swap); // revert when synth index is not set for given swap address
        v.mediumSynthAmount = swap.swap(
            tokenFromIndex,
            v.synthIndex,
            tokenInAmount,
            0,
            block.timestamp
        );

        IERC20 mediumSynth = IERC20(_getSynthAddress(swap));
        v.synthSwapper = new SynthSwapper();
        mediumSynth.transfer(address(v.synthSwapper), v.mediumSynthAmount);

        // Swap synths
        v.destSynthAmount = v.synthSwapper.swapSynth(
            SYNTHETIX,
            _getSynthKey(swap),
            v.mediumSynthAmount,
            synthOutKey
        );
        require(v.destSynthAmount >= minAmount, "Insufficient output");

        // Add virtual synth to settle queue with a list of accounts to settle to
        v.queueId = _addToPendingSynthSettlementQueue(
            PendingSynthSettlement(
                v.synthSwapper,
                synthOutKey,
                recipient,
                false
            )
        );

        // Emit TokenToVSynth event with relevant data
        emit TokenToSynth(
            msg.sender,
            swap,
            v.tokenFrom,
            tokenInAmount,
            v.destSynthAmount,
            v.queueId
        );

        return (v.queueId);
    }

    function calcSynthToToken(
        ISwap swap,
        bytes32 synthInKey,
        uint8 tokenToIndex,
        uint256 synthInAmount
    ) external view returns (uint256) {
        IExchangeRates exchangeRates =
            IExchangeRates(SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME));

        uint8 mediumSynthIndex = _getSynthIndex(swap);
        bytes32 mediumSynthKey = _getSynthKey(swap);
        require(synthInKey != mediumSynthKey, "use normal swap");

        uint256 expectedMediumSynthAmount =
            exchangeRates.effectiveValue(
                synthInKey,
                synthInAmount,
                mediumSynthKey
            );

        return
            swap.calculateSwap(
                mediumSynthIndex,
                tokenToIndex,
                expectedMediumSynthAmount
            );
    }

    // Swaps any synth to a token that Saddle's pools support
    function synthToToken(
        ISwap swap,
        bytes32 synthInKey,
        uint8 tokenToIndex,
        uint256 synthInAmount,
        uint256 minAmount,
        address recipient
    ) external returns (uint256) {
        SynthToTokenInfo memory v = SynthToTokenInfo(0, SynthSwapper(0), 0);

        if (recipient == address(0)) {
            recipient = msg.sender;
        }

        // Recieve synth from the user
        IERC20 synthFrom =
            IERC20(Target(SYNTHETIX_RESOLVER.getSynth(synthInKey)).proxy());
        synthFrom.safeTransferFrom(msg.sender, address(this), synthInAmount);

        v.mediumSynthKey = _getSynthKey(swap);
        v.mediumSynthIndex = _getSynthIndex(swap);
        require(
            synthInKey != v.mediumSynthKey,
            "synth is supported via normal swap"
        );

        // Create new SynthSwapper contract then commit swap
        v.synthSwapper = new SynthSwapper();
        synthFrom.transfer(address(v.synthSwapper), synthInAmount);
        v.synthSwapper.swapSynth(
            SYNTHETIX,
            synthInKey,
            synthInAmount,
            v.mediumSynthKey
        );

        // Add virtual token to settle queue with a list of accounts to settle to
        uint256 queueId =
            _addToPendingSynthToTokenSettlementQueue(
                PendingSynthToTokenSettlement(
                    v.synthSwapper,
                    v.mediumSynthKey,
                    recipient,
                    swap,
                    tokenToIndex,
                    minAmount,
                    false
                )
            );

        // Emit TokenToVSynth event with relevant data
        emit SynthToToken(
            msg.sender,
            swap,
            synthFrom,
            synthInAmount,
            minAmount,
            queueId
        );

        return (queueId);
    }

    function calcTokenToToken(
        ISwap[2] calldata swaps,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount
    ) external view returns (uint256, uint256) {
        IExchangeRates exchangeRates =
            IExchangeRates(SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME));

        uint256 firstSynthAmount =
            swaps[0].calculateSwap(
                tokenFromIndex,
                _getSynthIndex(swaps[0]),
                tokenFromAmount
            );

        uint256 secondSynthAmount =
            exchangeRates.effectiveValue(
                _getSynthKey(swaps[0]),
                firstSynthAmount,
                _getSynthKey(swaps[1])
            );

        return (
            firstSynthAmount,
            swaps[1].calculateSwap(
                _getSynthIndex(swaps[1]),
                tokenToIndex,
                secondSynthAmount
            )
        );
    }

    function tokenToToken(
        ISwap[2] calldata swaps,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256[2] calldata minAmounts,
        address recipient
    ) external returns (uint256) {
        if (recipient == address(0)) {
            recipient = msg.sender;
        }

        TokenToTokenInfo memory v = TokenToTokenInfo(SynthSwapper(0), 0);

        // Receive token from the user
        ISwap swap = swaps[0];
        {
            IERC20 tokenFrom = swap.getToken(tokenFromIndex);
            tokenFrom.safeTransferFrom(
                msg.sender,
                address(this),
                tokenFromAmount
            );
            tokenFrom.approve(address(swap), tokenFromAmount);
        }

        uint256 firstSynthAmount =
            swap.swap(
                tokenFromIndex,
                _getSynthIndex(swap),
                tokenFromAmount,
                minAmounts[0],
                block.timestamp
            );

        {
            IERC20 synthFrom = IERC20(_getSynthAddress(swap));
            v.synthSwapper = new SynthSwapper();
            v.secondSynthKey = _getSynthKey(swaps[1]);
            synthFrom.transfer(address(v.synthSwapper), firstSynthAmount);
            v.synthSwapper.swapSynth(
                SYNTHETIX,
                _getSynthKey(swap),
                firstSynthAmount,
                v.secondSynthKey
            );
        }

        // Add virtual token to settle queue with a list of accounts to settle to
        uint256 queueId =
            _addToPendingSynthToTokenSettlementQueue(
                PendingSynthToTokenSettlement(
                    v.synthSwapper,
                    v.secondSynthKey,
                    recipient,
                    swaps[1],
                    tokenToIndex,
                    minAmounts[1],
                    false
                )
            );

        // Emit TokenToVSynth event with relevant data
        emit TokenToToken(
            msg.sender,
            swaps,
            tokenFromIndex,
            tokenToIndex,
            tokenFromAmount,
            minAmounts,
            queueId
        );

        return (queueId);
    }

    // Management

    function setSynthIndex(
        ISwap swap,
        uint8 synthIndex,
        bytes32 currencyKey
    ) external {
        // Ensure that at given `synthIndex`, there exists the synth with same currency key.
        IERC20 synth = swap.getToken(synthIndex);
        require(
            _getCurrencyKeyFromProxy(address(synth)) == currencyKey,
            "currencyKey does not match"
        );
        require(synthIndex < MAX_UINT8, "index is too large");
        synthIndexesPlusOne[address(swap)] = synthIndex + 1;
        synthAddresses[address(swap)] = address(synth);
        synthKeys[address(swap)] = currencyKey;
        emit SynthIndex(address(swap), synthIndex, currencyKey);
    }

    function getSynthIndex(ISwap swap) external view returns (uint8) {
        return _getSynthIndex(swap);
    }

    function _getSynthIndex(ISwap swap) internal view returns (uint8) {
        uint8 synthIndexPlusOne = synthIndexesPlusOne[address(swap)];
        require(synthIndexPlusOne > 0, "synth index not found for given pool");
        return synthIndexPlusOne - 1;
    }

    function getSynthAddress(ISwap swap) external view returns (address) {
        return _getSynthAddress(swap);
    }

    function _getSynthAddress(ISwap swap) internal view returns (address) {
        address synthAddress = synthAddresses[address(swap)];
        require(
            synthAddress != address(0),
            "synth addr not found for given pool"
        );
        return synthAddress;
    }

    function _getSynthKey(ISwap swap) internal view returns (bytes32) {
        bytes32 synthKey = synthKeys[address(swap)];
        require(synthKey != 0x0, "synth key not found for given pool");
        return synthKey;
    }
}
