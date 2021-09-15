// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "synthetix/contracts/interfaces/IAddressResolver.sol";
import "synthetix/contracts/interfaces/IExchanger.sol";
import "synthetix/contracts/interfaces/IExchangeRates.sol";
import "../interfaces/ISwap.sol";
import "./SynthSwapper.sol";

contract Proxy {
    address public target;
}

contract Target {
    address public proxy;
}

/**
 * @title Bridge
 * @notice This contract is responsible for cross-asset swaps using the Synthetix protocol as the bridging exchange.
 * There are three types of supported cross-asset swaps, tokenToSynth, synthToToken, and tokenToToken.
 *
 * 1) tokenToSynth
 * Swaps a supported token in a saddle pool to any synthetic asset (e.g. tBTC -> sAAVE).
 *
 * 2) synthToToken
 * Swaps any synthetic asset to a suported token in a saddle pool (e.g. sDEFI -> USDC).
 *
 * 3) tokenToToken
 * Swaps a supported token in a saddle pool to one in another pool (e.g. renBTC -> DAI).
 *
 * Due to the settlement periods of synthetic assets, the users must wait until the trades can be completed.
 * Users will receive an ERC721 token that represents pending cross-asset swap. Once the waiting period is over,
 * the trades can be settled and completed by calling the `completeToSynth` or the `completeToToken` function.
 * In the cases of pending `synthToToken` or `tokenToToken` swaps, the owners of the pending swaps can also choose
 * to withdraw the bridging synthetic assets instead of completing the swap.
 */
contract Bridge is ERC721 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event SynthIndex(
        address indexed swap,
        uint8 synthIndex,
        bytes32 currencyKey,
        address synthAddress
    );
    event TokenToSynth(
        address indexed requester,
        uint256 indexed itemId,
        ISwap swapPool,
        uint8 tokenFromIndex,
        uint256 tokenFromInAmount,
        bytes32 synthToKey
    );
    event SynthToToken(
        address indexed requester,
        uint256 indexed itemId,
        ISwap swapPool,
        bytes32 synthFromKey,
        uint256 synthFromInAmount,
        uint8 tokenToIndex
    );
    event TokenToToken(
        address indexed requester,
        uint256 indexed itemId,
        ISwap[2] swapPools,
        uint8 tokenFromIndex,
        uint256 tokenFromAmount,
        uint8 tokenToIndex
    );
    event Settle(
        address indexed requester,
        uint256 indexed itemId,
        IERC20 settleFrom,
        uint256 settleFromAmount,
        IERC20 settleTo,
        uint256 settleToAmount,
        bool isFinal
    );
    event Withdraw(
        address indexed requester,
        uint256 indexed itemId,
        IERC20 synth,
        uint256 synthAmount,
        bool isFinal
    );

    // The addresses for all Synthetix contracts can be found in the below URL.
    // https://docs.synthetix.io/addresses/#mainnet-contracts
    //
    // Since the Synthetix protocol is upgradable, we must use the proxy pairs of each contract such that
    // the composability is not broken after the protocol upgrade.
    //
    // SYNTHETIX_RESOLVER points to `ReadProxyAddressResolver` (0x4E3b31eB0E5CB73641EE1E65E7dCEFe520bA3ef2).
    // This contract is a read proxy of `AddressResolver` which is responsible for storing the addresses of the contracts
    // used by the Synthetix protocol.
    IAddressResolver public constant SYNTHETIX_RESOLVER =
        IAddressResolver(0x4E3b31eB0E5CB73641EE1E65E7dCEFe520bA3ef2);

    // EXCHANGER points to `Exchanger`. There is no proxy pair for this contract so we need to update this variable
    // when the protocol is upgraded. This contract is used to settle synths held by SynthSwapper.
    IExchanger public exchanger;

    // CONSTANTS

    // Available types of cross-asset swaps
    enum PendingSwapType {
        Null,
        TokenToSynth,
        SynthToToken,
        TokenToToken
    }

    uint256 public constant MAX_UINT256 = 2**256 - 1;
    uint8 public constant MAX_UINT8 = 2**8 - 1;
    bytes32 public constant EXCHANGE_RATES_NAME = "ExchangeRates";
    bytes32 public constant EXCHANGER_NAME = "Exchanger";
    address public immutable SYNTH_SWAPPER_MASTER;

    // MAPPINGS FOR STORING PENDING SETTLEMENTS
    // The below two mappings never share the same key.
    mapping(uint256 => PendingToSynthSwap) public pendingToSynthSwaps;
    mapping(uint256 => PendingToTokenSwap) public pendingToTokenSwaps;
    uint256 public pendingSwapsLength;
    mapping(uint256 => PendingSwapType) private pendingSwapType;

    // MAPPINGS FOR STORING SYNTH INFO
    mapping(address => SwapContractInfo) private swapContracts;

    // Structs holding information about pending settlements
    struct PendingToSynthSwap {
        SynthSwapper swapper;
        bytes32 synthKey;
    }

    struct PendingToTokenSwap {
        SynthSwapper swapper;
        bytes32 synthKey;
        ISwap swap;
        uint8 tokenToIndex;
    }

    struct SwapContractInfo {
        // index of the supported synth + 1
        uint8 synthIndexPlusOne;
        // address of the supported synth
        address synthAddress;
        // bytes32 key of the supported synth
        bytes32 synthKey;
        // array of tokens supported by the contract
        IERC20[] tokens;
    }

    /**
     * @notice Deploys this contract and initializes the master version of the SynthSwapper contract. The address to
     * the Synthetix protocol's Exchanger contract is also set on deployment.
     */
    constructor(address synthSwapperAddress)
        public
        ERC721("Saddle Cross-Asset Swap", "SaddleSynthSwap")
    {
        SYNTH_SWAPPER_MASTER = synthSwapperAddress;
        updateExchangerCache();
    }

    /**
     * @notice Returns the address of the proxy contract targeting the synthetic asset with the given `synthKey`.
     * @param synthKey the currency key of the synth
     * @return address of the proxy contract
     */
    function getProxyAddressFromTargetSynthKey(bytes32 synthKey)
        public
        view
        returns (IERC20)
    {
        return IERC20(Target(SYNTHETIX_RESOLVER.getSynth(synthKey)).proxy());
    }

    /**
     * @notice Returns various information of a pending swap represented by the given `itemId`. Information includes
     * the type of the pending swap, the number of seconds left until it can be settled, the address and the balance
     * of the synth this swap currently holds, and the address of the destination token.
     * @param itemId ID of the pending swap
     * @return swapType the type of the pending virtual swap,
     * secsLeft number of seconds left until this swap can be settled,
     * synth address of the synth this swap uses,
     * synthBalance amount of the synth this swap holds,
     * tokenTo the address of the destination token
     */
    function getPendingSwapInfo(uint256 itemId)
        external
        view
        returns (
            PendingSwapType swapType,
            uint256 secsLeft,
            address synth,
            uint256 synthBalance,
            address tokenTo
        )
    {
        swapType = pendingSwapType[itemId];
        require(swapType != PendingSwapType.Null, "invalid itemId");

        SynthSwapper synthSwapper;
        bytes32 synthKey;

        if (swapType == PendingSwapType.TokenToSynth) {
            synthSwapper = pendingToSynthSwaps[itemId].swapper;
            synthKey = pendingToSynthSwaps[itemId].synthKey;
            synth = address(getProxyAddressFromTargetSynthKey(synthKey));
            tokenTo = synth;
        } else {
            PendingToTokenSwap memory pendingToTokenSwap = pendingToTokenSwaps[
                itemId
            ];
            synthSwapper = pendingToTokenSwap.swapper;
            synthKey = pendingToTokenSwap.synthKey;
            synth = address(getProxyAddressFromTargetSynthKey(synthKey));
            tokenTo = address(
                swapContracts[address(pendingToTokenSwap.swap)].tokens[
                    pendingToTokenSwap.tokenToIndex
                ]
            );
        }

        secsLeft = exchanger.maxSecsLeftInWaitingPeriod(
            address(synthSwapper),
            synthKey
        );
        synthBalance = IERC20(synth).balanceOf(address(synthSwapper));
    }

    // Settles the synth only.
    function _settle(address synthOwner, bytes32 synthKey) internal {
        // Settle synth
        exchanger.settle(synthOwner, synthKey);
    }

    /**
     * @notice Settles and withdraws the synthetic asset without swapping it to a token in a Saddle pool. Only the owner
     * of the ERC721 token of `itemId` can call this function. Reverts if the given `itemId` does not represent a
     * `synthToToken` or a `tokenToToken` swap.
     * @param itemId ID of the pending swap
     * @param amount the amount of the synth to withdraw
     */
    function withdraw(uint256 itemId, uint256 amount) external {
        address nftOwner = ownerOf(itemId);
        require(nftOwner == msg.sender, "not owner");
        require(
            pendingSwapType[itemId] > PendingSwapType.TokenToSynth,
            "invalid itemId"
        );
        PendingToTokenSwap memory pendingToTokenSwap = pendingToTokenSwaps[
            itemId
        ];
        _settle(
            address(pendingToTokenSwap.swapper),
            pendingToTokenSwap.synthKey
        );

        IERC20 synth = getProxyAddressFromTargetSynthKey(
            pendingToTokenSwap.synthKey
        );
        bool shouldDestroy;

        if (amount >= synth.balanceOf(address(pendingToTokenSwap.swapper))) {
            _burn(itemId);
            delete pendingToTokenSwaps[itemId];
            delete pendingSwapType[itemId];
            shouldDestroy = true;
        }

        pendingToTokenSwap.swapper.withdraw(
            synth,
            nftOwner,
            amount,
            shouldDestroy
        );
        emit Withdraw(msg.sender, itemId, synth, amount, shouldDestroy);
    }

    /**
     * @notice Completes the pending `tokenToSynth` swap by settling and withdrawing the synthetic asset.
     * Reverts if the given `itemId` does not represent a `tokenToSynth` swap.
     * @param itemId ERC721 token ID representing a pending `tokenToSynth` swap
     */
    function completeToSynth(uint256 itemId) external {
        address nftOwner = ownerOf(itemId);
        require(nftOwner == msg.sender, "not owner");
        require(
            pendingSwapType[itemId] == PendingSwapType.TokenToSynth,
            "invalid itemId"
        );

        PendingToSynthSwap memory pendingToSynthSwap = pendingToSynthSwaps[
            itemId
        ];
        _settle(
            address(pendingToSynthSwap.swapper),
            pendingToSynthSwap.synthKey
        );

        IERC20 synth = getProxyAddressFromTargetSynthKey(
            pendingToSynthSwap.synthKey
        );

        // Burn the corresponding ERC721 token and delete storage for gas
        _burn(itemId);
        delete pendingToTokenSwaps[itemId];
        delete pendingSwapType[itemId];

        // After settlement, withdraw the synth and send it to the recipient
        uint256 synthBalance = synth.balanceOf(
            address(pendingToSynthSwap.swapper)
        );
        pendingToSynthSwap.swapper.withdraw(
            synth,
            nftOwner,
            synthBalance,
            true
        );

        emit Settle(
            msg.sender,
            itemId,
            synth,
            synthBalance,
            synth,
            synthBalance,
            true
        );
    }

    /**
     * @notice Calculates the expected amount of the token to receive on calling `completeToToken()` with
     * the given `swapAmount`.
     * @param itemId ERC721 token ID representing a pending `SynthToToken` or `TokenToToken` swap
     * @param swapAmount the amount of bridging synth to swap from
     * @return expected amount of the token the user will receive
     */
    function calcCompleteToToken(uint256 itemId, uint256 swapAmount)
        external
        view
        returns (uint256)
    {
        require(
            pendingSwapType[itemId] > PendingSwapType.TokenToSynth,
            "invalid itemId"
        );

        PendingToTokenSwap memory pendingToTokenSwap = pendingToTokenSwaps[
            itemId
        ];
        return
            pendingToTokenSwap.swap.calculateSwap(
                getSynthIndex(pendingToTokenSwap.swap),
                pendingToTokenSwap.tokenToIndex,
                swapAmount
            );
    }

    /**
     * @notice Completes the pending `SynthToToken` or `TokenToToken` swap by settling the bridging synth and swapping
     * it to the desired token. Only the owners of the pending swaps can call this function.
     * @param itemId ERC721 token ID representing a pending `SynthToToken` or `TokenToToken` swap
     * @param swapAmount the amount of bridging synth to swap from
     * @param minAmount the minimum amount of the token to receive - reverts if this amount is not reached
     * @param deadline the timestamp representing the deadline for this transaction - reverts if deadline is not met
     */
    function completeToToken(
        uint256 itemId,
        uint256 swapAmount,
        uint256 minAmount,
        uint256 deadline
    ) external {
        require(swapAmount != 0, "amount must be greater than 0");
        address nftOwner = ownerOf(itemId);
        require(msg.sender == nftOwner, "must own itemId");
        require(
            pendingSwapType[itemId] > PendingSwapType.TokenToSynth,
            "invalid itemId"
        );

        PendingToTokenSwap memory pendingToTokenSwap = pendingToTokenSwaps[
            itemId
        ];

        _settle(
            address(pendingToTokenSwap.swapper),
            pendingToTokenSwap.synthKey
        );
        IERC20 synth = getProxyAddressFromTargetSynthKey(
            pendingToTokenSwap.synthKey
        );
        bool shouldDestroyClone;

        if (
            swapAmount >= synth.balanceOf(address(pendingToTokenSwap.swapper))
        ) {
            _burn(itemId);
            delete pendingToTokenSwaps[itemId];
            delete pendingSwapType[itemId];
            shouldDestroyClone = true;
        }

        // Try swapping the synth to the desired token via the stored swap pool contract
        // If the external call succeeds, send the token to the owner of token with itemId.
        (IERC20 tokenTo, uint256 amountOut) = pendingToTokenSwap
            .swapper
            .swapSynthToToken(
                pendingToTokenSwap.swap,
                synth,
                getSynthIndex(pendingToTokenSwap.swap),
                pendingToTokenSwap.tokenToIndex,
                swapAmount,
                minAmount,
                deadline,
                nftOwner
            );

        if (shouldDestroyClone) {
            pendingToTokenSwap.swapper.destroy();
        }

        emit Settle(
            msg.sender,
            itemId,
            synth,
            swapAmount,
            tokenTo,
            amountOut,
            shouldDestroyClone
        );
    }

    // Add the given pending synth settlement struct to the list
    function _addToPendingSynthSwapList(
        PendingToSynthSwap memory pendingToSynthSwap
    ) internal returns (uint256) {
        require(
            pendingSwapsLength < MAX_UINT256,
            "pendingSwapsLength reached max size"
        );
        pendingToSynthSwaps[pendingSwapsLength] = pendingToSynthSwap;
        return pendingSwapsLength++;
    }

    // Add the given pending synth to token settlement struct to the list
    function _addToPendingSynthToTokenSwapList(
        PendingToTokenSwap memory pendingToTokenSwap
    ) internal returns (uint256) {
        require(
            pendingSwapsLength < MAX_UINT256,
            "pendingSwapsLength reached max size"
        );
        pendingToTokenSwaps[pendingSwapsLength] = pendingToTokenSwap;
        return pendingSwapsLength++;
    }

    /**
     * @notice Calculates the expected amount of the desired synthetic asset the caller will receive after completing
     * a `TokenToSynth` swap with the given parameters. This calculation does not consider the settlement periods.
     * @param swap the address of a Saddle pool to use to swap the given token to a bridging synth
     * @param tokenFromIndex the index of the token to swap from
     * @param synthOutKey the currency key of the desired synthetic asset
     * @param tokenInAmount the amount of the token to swap form
     * @return the expected amount of the desired synth
     */
    function calcTokenToSynth(
        ISwap swap,
        uint8 tokenFromIndex,
        bytes32 synthOutKey,
        uint256 tokenInAmount
    ) external view returns (uint256) {
        uint8 mediumSynthIndex = getSynthIndex(swap);
        uint256 expectedMediumSynthAmount = swap.calculateSwap(
            tokenFromIndex,
            mediumSynthIndex,
            tokenInAmount
        );
        bytes32 mediumSynthKey = getSynthKey(swap);

        IExchangeRates exchangeRates = IExchangeRates(
            SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME)
        );
        return
            exchangeRates.effectiveValue(
                mediumSynthKey,
                expectedMediumSynthAmount,
                synthOutKey
            );
    }

    /**
     * @notice Initiates a cross-asset swap from a token supported in the `swap` pool to any synthetic asset.
     * The caller will receive an ERC721 token representing their ownership of the pending cross-asset swap.
     * @param swap the address of a Saddle pool to use to swap the given token to a bridging synth
     * @param tokenFromIndex the index of the token to swap from
     * @param synthOutKey the currency key of the desired synthetic asset
     * @param tokenInAmount the amount of the token to swap form
     * @param minAmount the amount of the token to swap form
     * @return ID of the ERC721 token sent to the caller
     */
    function tokenToSynth(
        ISwap swap,
        uint8 tokenFromIndex,
        bytes32 synthOutKey,
        uint256 tokenInAmount,
        uint256 minAmount
    ) external returns (uint256) {
        require(tokenInAmount != 0, "amount must be greater than 0");
        // Create a SynthSwapper clone
        SynthSwapper synthSwapper = SynthSwapper(
            Clones.clone(SYNTH_SWAPPER_MASTER)
        );
        synthSwapper.initialize();

        // Add the synthswapper to the pending settlement list
        uint256 itemId = _addToPendingSynthSwapList(
            PendingToSynthSwap(synthSwapper, synthOutKey)
        );
        pendingSwapType[itemId] = PendingSwapType.TokenToSynth;

        // Mint an ERC721 token that represents ownership of the pending synth settlement to msg.sender
        _mint(msg.sender, itemId);

        // Transfer token from msg.sender
        IERC20 tokenFrom = swapContracts[address(swap)].tokens[tokenFromIndex]; // revert when token not found in swap pool
        tokenFrom.safeTransferFrom(msg.sender, address(this), tokenInAmount);
        tokenInAmount = tokenFrom.balanceOf(address(this));

        // Swap the synth to the medium synth
        uint256 mediumSynthAmount = swap.swap(
            tokenFromIndex,
            getSynthIndex(swap),
            tokenInAmount,
            0,
            block.timestamp
        );

        // Swap synths via Synthetix network
        IERC20(getSynthAddress(swap)).safeTransfer(
            address(synthSwapper),
            mediumSynthAmount
        );
        require(
            synthSwapper.swapSynth(
                getSynthKey(swap),
                mediumSynthAmount,
                synthOutKey
            ) >= minAmount,
            "minAmount not reached"
        );

        // Emit TokenToSynth event with relevant data
        emit TokenToSynth(
            msg.sender,
            itemId,
            swap,
            tokenFromIndex,
            tokenInAmount,
            synthOutKey
        );

        return (itemId);
    }

    /**
     * @notice Calculates the expected amount of the desired token the caller will receive after completing
     * a `SynthToToken` swap with the given parameters. This calculation does not consider the settlement periods or
     * any potential changes of the `swap` pool composition.
     * @param swap the address of a Saddle pool to use to swap the given token to a bridging synth
     * @param synthInKey the currency key of the synth to swap from
     * @param tokenToIndex the index of the token to swap to
     * @param synthInAmount the amount of the synth to swap form
     * @return the expected amount of the bridging synth and the expected amount of the desired token
     */
    function calcSynthToToken(
        ISwap swap,
        bytes32 synthInKey,
        uint8 tokenToIndex,
        uint256 synthInAmount
    ) external view returns (uint256, uint256) {
        IExchangeRates exchangeRates = IExchangeRates(
            SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME)
        );

        uint8 mediumSynthIndex = getSynthIndex(swap);
        bytes32 mediumSynthKey = getSynthKey(swap);
        require(synthInKey != mediumSynthKey, "use normal swap");

        uint256 expectedMediumSynthAmount = exchangeRates.effectiveValue(
            synthInKey,
            synthInAmount,
            mediumSynthKey
        );

        return (
            expectedMediumSynthAmount,
            swap.calculateSwap(
                mediumSynthIndex,
                tokenToIndex,
                expectedMediumSynthAmount
            )
        );
    }

    /**
     * @notice Initiates a cross-asset swap from a synthetic asset to a supported token. The caller will receive
     * an ERC721 token representing their ownership of the pending cross-asset swap.
     * @param swap the address of a Saddle pool to use to swap the given token to a bridging synth
     * @param synthInKey the currency key of the synth to swap from
     * @param tokenToIndex the index of the token to swap to
     * @param synthInAmount the amount of the synth to swap form
     * @param minMediumSynthAmount the minimum amount of the bridging synth at pre-settlement stage
     * @return the ID of the ERC721 token sent to the caller
     */
    function synthToToken(
        ISwap swap,
        bytes32 synthInKey,
        uint8 tokenToIndex,
        uint256 synthInAmount,
        uint256 minMediumSynthAmount
    ) external returns (uint256) {
        require(synthInAmount != 0, "amount must be greater than 0");
        bytes32 mediumSynthKey = getSynthKey(swap);
        require(
            synthInKey != mediumSynthKey,
            "synth is supported via normal swap"
        );

        // Create a SynthSwapper clone
        SynthSwapper synthSwapper = SynthSwapper(
            Clones.clone(SYNTH_SWAPPER_MASTER)
        );
        synthSwapper.initialize();

        // Add the synthswapper to the pending synth to token settlement list
        uint256 itemId = _addToPendingSynthToTokenSwapList(
            PendingToTokenSwap(synthSwapper, mediumSynthKey, swap, tokenToIndex)
        );
        pendingSwapType[itemId] = PendingSwapType.SynthToToken;

        // Mint an ERC721 token that represents ownership of the pending synth to token settlement to msg.sender
        _mint(msg.sender, itemId);

        // Receive synth from the user and swap it to another synth
        IERC20 synthFrom = getProxyAddressFromTargetSynthKey(synthInKey);
        synthFrom.safeTransferFrom(msg.sender, address(this), synthInAmount);
        synthFrom.safeTransfer(address(synthSwapper), synthInAmount);
        require(
            synthSwapper.swapSynth(synthInKey, synthInAmount, mediumSynthKey) >=
                minMediumSynthAmount,
            "minMediumSynthAmount not reached"
        );

        // Emit SynthToToken event with relevant data
        emit SynthToToken(
            msg.sender,
            itemId,
            swap,
            synthInKey,
            synthInAmount,
            tokenToIndex
        );

        return (itemId);
    }

    /**
     * @notice Calculates the expected amount of the desired token the caller will receive after completing
     * a `TokenToToken` swap with the given parameters. This calculation does not consider the settlement periods or
     * any potential changes of the pool compositions.
     * @param swaps the addresses of the two Saddle pools used to do the cross-asset swap
     * @param tokenFromIndex the index of the token in the first `swaps` pool to swap from
     * @param tokenToIndex the index of the token in the second `swaps` pool to swap to
     * @param tokenFromAmount the amount of the token to swap from
     * @return the expected amount of bridging synth at pre-settlement stage and the expected amount of the desired
     * token
     */
    function calcTokenToToken(
        ISwap[2] calldata swaps,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount
    ) external view returns (uint256, uint256) {
        IExchangeRates exchangeRates = IExchangeRates(
            SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME)
        );

        uint256 firstSynthAmount = swaps[0].calculateSwap(
            tokenFromIndex,
            getSynthIndex(swaps[0]),
            tokenFromAmount
        );

        uint256 mediumSynthAmount = exchangeRates.effectiveValue(
            getSynthKey(swaps[0]),
            firstSynthAmount,
            getSynthKey(swaps[1])
        );

        return (
            mediumSynthAmount,
            swaps[1].calculateSwap(
                getSynthIndex(swaps[1]),
                tokenToIndex,
                mediumSynthAmount
            )
        );
    }

    /**
     * @notice Initiates a cross-asset swap from a token in one Saddle pool to one in another. The caller will receive
     * an ERC721 token representing their ownership of the pending cross-asset swap.
     * @param swaps the addresses of the two Saddle pools used to do the cross-asset swap
     * @param tokenFromIndex the index of the token in the first `swaps` pool to swap from
     * @param tokenToIndex the index of the token in the second `swaps` pool to swap to
     * @param tokenFromAmount the amount of the token to swap from
     * @param minMediumSynthAmount the minimum amount of the bridging synth at pre-settlement stage
     * @return the ID of the ERC721 token sent to the caller
     */
    function tokenToToken(
        ISwap[2] calldata swaps,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256 minMediumSynthAmount
    ) external returns (uint256) {
        // Create a SynthSwapper clone
        require(tokenFromAmount != 0, "amount must be greater than 0");
        SynthSwapper synthSwapper = SynthSwapper(
            Clones.clone(SYNTH_SWAPPER_MASTER)
        );
        synthSwapper.initialize();
        bytes32 mediumSynthKey = getSynthKey(swaps[1]);

        // Add the synthswapper to the pending synth to token settlement list
        uint256 itemId = _addToPendingSynthToTokenSwapList(
            PendingToTokenSwap(
                synthSwapper,
                mediumSynthKey,
                swaps[1],
                tokenToIndex
            )
        );
        pendingSwapType[itemId] = PendingSwapType.TokenToToken;

        // Mint an ERC721 token that represents ownership of the pending swap to msg.sender
        _mint(msg.sender, itemId);

        // Receive token from the user
        ISwap swap = swaps[0];
        {
            IERC20 tokenFrom = swapContracts[address(swap)].tokens[
                tokenFromIndex
            ];
            tokenFrom.safeTransferFrom(
                msg.sender,
                address(this),
                tokenFromAmount
            );
        }

        uint256 firstSynthAmount = swap.swap(
            tokenFromIndex,
            getSynthIndex(swap),
            tokenFromAmount,
            0,
            block.timestamp
        );

        // Swap the synth to another synth
        IERC20(getSynthAddress(swap)).safeTransfer(
            address(synthSwapper),
            firstSynthAmount
        );
        require(
            synthSwapper.swapSynth(
                getSynthKey(swap),
                firstSynthAmount,
                mediumSynthKey
            ) >= minMediumSynthAmount,
            "minMediumSynthAmount not reached"
        );

        // Emit TokenToToken event with relevant data
        emit TokenToToken(
            msg.sender,
            itemId,
            swaps,
            tokenFromIndex,
            tokenFromAmount,
            tokenToIndex
        );

        return (itemId);
    }

    /**
     * @notice Registers the index and the address of the supported synth from the given `swap` pool. The matching currency key must
     * be supplied for a successful registration.
     * @param swap the address of the pool that contains the synth
     * @param synthIndex the index of the supported synth in the given `swap` pool
     * @param currencyKey the currency key of the synth in bytes32 form
     */
    function setSynthIndex(
        ISwap swap,
        uint8 synthIndex,
        bytes32 currencyKey
    ) external {
        require(synthIndex < MAX_UINT8, "index is too large");
        SwapContractInfo storage swapContractInfo = swapContracts[
            address(swap)
        ];
        // Check if the pool has already been added
        require(swapContractInfo.synthIndexPlusOne == 0, "Pool already added");
        // Ensure the synth with the same currency key exists at the given `synthIndex`
        IERC20 synth = swap.getToken(synthIndex);
        require(
            ISynth(Proxy(address(synth)).target()).currencyKey() == currencyKey,
            "currencyKey does not match"
        );
        swapContractInfo.synthIndexPlusOne = synthIndex + 1;
        swapContractInfo.synthAddress = address(synth);
        swapContractInfo.synthKey = currencyKey;
        swapContractInfo.tokens = new IERC20[](0);

        for (uint8 i = 0; i < MAX_UINT8; i++) {
            IERC20 token;
            if (i == synthIndex) {
                token = synth;
            } else {
                try swap.getToken(i) returns (IERC20 token_) {
                    token = token_;
                } catch {
                    break;
                }
            }
            swapContractInfo.tokens.push(token);
            token.safeApprove(address(swap), MAX_UINT256);
        }

        emit SynthIndex(address(swap), synthIndex, currencyKey, address(synth));
    }

    /**
     * @notice Returns the index of the supported synth in the given `swap` pool. Reverts if the `swap` pool
     * is not registered.
     * @param swap the address of the pool that contains the synth
     * @return the index of the supported synth
     */
    function getSynthIndex(ISwap swap) public view returns (uint8) {
        uint8 synthIndexPlusOne = swapContracts[address(swap)]
            .synthIndexPlusOne;
        require(synthIndexPlusOne > 0, "synth index not found for given pool");
        return synthIndexPlusOne - 1;
    }

    /**
     * @notice Returns the address of the supported synth in the given `swap` pool. Reverts if the `swap` pool
     * is not registered.
     * @param swap the address of the pool that contains the synth
     * @return the address of the supported synth
     */
    function getSynthAddress(ISwap swap) public view returns (address) {
        address synthAddress = swapContracts[address(swap)].synthAddress;
        require(
            synthAddress != address(0),
            "synth addr not found for given pool"
        );
        return synthAddress;
    }

    /**
     * @notice Returns the currency key of the supported synth in the given `swap` pool. Reverts if the `swap` pool
     * is not registered.
     * @param swap the address of the pool that contains the synth
     * @return the currency key of the supported synth
     */
    function getSynthKey(ISwap swap) public view returns (bytes32) {
        bytes32 synthKey = swapContracts[address(swap)].synthKey;
        require(synthKey != 0x0, "synth key not found for given pool");
        return synthKey;
    }

    /**
     * @notice Updates the stored address of the `EXCHANGER` contract. When the Synthetix team upgrades their protocol,
     * a new Exchanger contract is deployed. This function manually updates the stored address.
     */
    function updateExchangerCache() public {
        exchanger = IExchanger(SYNTHETIX_RESOLVER.getAddress(EXCHANGER_NAME));
    }
}
