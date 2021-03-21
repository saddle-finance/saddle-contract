// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "openzeppelin-contracts-3.4/proxy/Clones.sol";
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
        ISwap swapPool,
        IERC20 tokenFrom,
        uint256 tokenFromInAmount,
        uint256 itemId
    );
    event SynthToToken(
        address indexed requester,
        ISwap swapPool,
        IERC20 synthFrom,
        uint256 synthFromInAmount,
        uint256 itemId
    );
    event TokenToToken(
        address indexed requester,
        ISwap[2] swapPools,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256 itemId
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
    enum PendingSwapType {Null, TokenToSynth, SynthToToken, TokenToToken}

    // Waiting - The cross-asset swap has been initiated but the settlement period is not over.
    // ReadyToSettle - The settlement period is over and the pending swap is ready to be completed.
    // PartiallyCompleted - Only a partial amount of the synths have been swapped or withdrawn.
    // Completed - All of the synths have been swapped or withdrawn. No more actions can be done.
    enum PendingSwapState {
        Waiting,
        ReadyToSettle,
        PartiallyCompleted,
        Completed
    }

    uint256 public constant MAX_UINT256 = 2**256 - 1;
    uint8 public constant MAX_UINT8 = 2**8 - 1;
    bytes32 public constant EXCHANGE_RATES_NAME = "ExchangeRates";
    bytes32 public constant EXCHANGER_NAME = "Exchanger";
    uint8 private constant PENDING_SWAP_STATE_LENGTH = 4;
    address public immutable SYNTH_SWAPPER_MASTER;

    // MAPPINGS FOR STORING PENDING SETTLEMENTS
    // The below two mappings never share the same key.
    mapping(uint256 => PendingSynthSwap) public pendingSynthSwaps;
    mapping(uint256 => PendingSynthToTokenSwap) public pendingSynthToTokenSwaps;
    uint256 public pendingSwapsLength;
    mapping(uint256 => uint8) private pendingSwapTypeAndState;

    // MAPPINGS FOR STORING SYNTH INFO OF GIVEN POOL
    // Maps swap address to its index of the supported synth + 1
    mapping(address => uint8) private synthIndexesPlusOne;
    // Maps swap address to the address of the supported synth
    mapping(address => address) private synthAddresses;
    // Maps swap address to the bytes32 key of the supported synth
    mapping(address => bytes32) private synthKeys;

    // Structs holding information about pending settlements
    struct PendingSynthSwap {
        SynthSwapper ss;
        bytes32 synthKey;
    }

    struct PendingSynthToTokenSwap {
        SynthSwapper ss;
        bytes32 synthKey;
        ISwap swap;
        uint8 tokenToIndex;
    }

    /**
     * @notice Deploys this contract and initializes the master version of the SynthSwapper contract. The address to
     * the Synthetix protocol's Exchanger contract is also set on deployment.
     */
    constructor() public ERC721("Saddle Cross-Asset Swap", "SaddleSynthSwap") {
        SYNTH_SWAPPER_MASTER = address(new SynthSwapper());
        updateExchangerCache();
    }

    /**
     * @notice Returns how many seconds are left until the synth contained in the given `itemId` can be settled.
     * @param itemId ID of the pending swap
     * @return seconds left in waiting period
     */
    function maxSecsLeftInWaitingPeriod(uint256 itemId)
        external
        view
        returns (uint256)
    {
        PendingSynthSwap memory pss = pendingSynthSwaps[itemId];
        address synthSwapper;
        bytes32 synthKey;

        if (address(pss.ss) != address(0)) {
            synthSwapper = address(pss.ss);
            synthKey = pss.synthKey;
        } else {
            PendingSynthToTokenSwap memory pstts =
                pendingSynthToTokenSwaps[itemId];
            synthSwapper = address(pstts.ss);
            synthKey = pstts.synthKey;
        }

        return exchanger.maxSecsLeftInWaitingPeriod(synthSwapper, synthKey);
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

    function _getPendingSwapTypeAndState(uint256 itemId)
        internal
        view
        returns (PendingSwapType, PendingSwapState)
    {
        uint8 typeAndState = pendingSwapTypeAndState[itemId];
        return (
            PendingSwapType(typeAndState / PENDING_SWAP_STATE_LENGTH),
            PendingSwapState(typeAndState % PENDING_SWAP_STATE_LENGTH)
        );
    }

    /**
     * @notice Returns the type and the current state of the pending swap represented by the given `itemId`. Type indicates
     * what kind of cross-asset swap it is and the state tells you what stage the pending swap is in.
     * @param itemId ID of the pending swap
     * @return PendingSwapType enum and PendingSwapState enum representing the type and the state of the pending swap
     */
    function getPendingSwapTypeAndState(uint256 itemId)
        external
        view
        returns (PendingSwapType, PendingSwapState)
    {
        (PendingSwapType swapType, PendingSwapState swapState) =
            _getPendingSwapTypeAndState(itemId);
        require(swapType != PendingSwapType.Null, "invalid itemId");

        SynthSwapper synthSwapper;
        bytes32 synthKey;

        if (swapType == PendingSwapType.TokenToSynth) {
            synthSwapper = pendingSynthSwaps[itemId].ss;
            synthKey = pendingSynthSwaps[itemId].synthKey;
        } else {
            synthSwapper = pendingSynthToTokenSwaps[itemId].ss;
            synthKey = pendingSynthToTokenSwaps[itemId].synthKey;
        }

        if (
            swapState == PendingSwapState.Waiting &&
            exchanger.maxSecsLeftInWaitingPeriod(
                address(synthSwapper),
                synthKey
            ) ==
            0
        ) {
            swapState = PendingSwapState.ReadyToSettle;
        }
        return (swapType, swapState);
    }

    function _setPendingSwapType(
        uint256 itemId,
        PendingSwapType pendingSwapType
    ) internal {
        pendingSwapTypeAndState[itemId] =
            uint8(pendingSwapType) *
            PENDING_SWAP_STATE_LENGTH;
    }

    function _setPendingSwapState(
        uint256 itemId,
        PendingSwapState pendingSwapState
    ) internal {
        pendingSwapTypeAndState[itemId] =
            (pendingSwapTypeAndState[itemId] / PENDING_SWAP_STATE_LENGTH) *
            PENDING_SWAP_STATE_LENGTH +
            uint8(pendingSwapState);
    }

    // Settles the synth only.
    function _settle(address synthOwner, bytes32 synthKey) internal {
        require(
            exchanger.maxSecsLeftInWaitingPeriod(synthOwner, synthKey) == 0,
            "synth waiting period is ongoing"
        );

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
        (PendingSwapType swapType, ) = _getPendingSwapTypeAndState(itemId);
        require(swapType > PendingSwapType.TokenToSynth, "invalid itemId");
        PendingSynthToTokenSwap memory pstts = pendingSynthToTokenSwaps[itemId];
        _settle(address(pstts.ss), pstts.synthKey);

        IERC20 synth = getProxyAddressFromTargetSynthKey(pstts.synthKey);

        if (amount < synth.balanceOf(address(pstts.ss))) {
            _setPendingSwapState(itemId, PendingSwapState.PartiallyCompleted);
        } else {
            _setPendingSwapState(itemId, PendingSwapState.Completed);
            _burn(itemId);
        }

        pstts.ss.withdraw(synth, nftOwner, amount);
    }

    /**
     * @notice Completes the pending `tokenToSynth` swap by settling and withdrawing the synthetic asset.
     * Reverts if the given `itemId` does not represent a `tokenToSynth` swap.
     * @param itemId ERC721 token ID representing a pending `tokenToSynth` swap
     */
    function completeToSynth(uint256 itemId) external {
        (PendingSwapType swapType, ) = _getPendingSwapTypeAndState(itemId);
        require(swapType == PendingSwapType.TokenToSynth, "invalid itemId");

        PendingSynthSwap memory pss = pendingSynthSwaps[itemId];
        _settle(address(pss.ss), pss.synthKey);

        IERC20 synth = getProxyAddressFromTargetSynthKey(pss.synthKey);
        address nftOwner = ownerOf(itemId);

        // Mark state as complete
        _setPendingSwapState(itemId, PendingSwapState.Completed);
        _burn(itemId);

        // After settlement, withdraw the synth and send it to the recipient
        pss.ss.withdraw(synth, nftOwner, synth.balanceOf(address(pss.ss)));
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
        (PendingSwapType swapType, ) = _getPendingSwapTypeAndState(itemId);
        require(swapType > PendingSwapType.TokenToSynth, "invalid itemId");

        PendingSynthToTokenSwap memory pstts = pendingSynthToTokenSwaps[itemId];
        return
            pstts.swap.calculateSwap(
                getSynthIndex(pstts.swap),
                pstts.tokenToIndex,
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
        address nftOwner = ownerOf(itemId);
        require(msg.sender == nftOwner, "must own itemId");

        (PendingSwapType swapType, ) = _getPendingSwapTypeAndState(itemId);
        require(swapType > PendingSwapType.TokenToSynth, "invalid itemId");

        PendingSynthToTokenSwap memory pstts = pendingSynthToTokenSwaps[itemId];

        _settle(address(pstts.ss), pstts.synthKey);
        IERC20 synth = getProxyAddressFromTargetSynthKey(pstts.synthKey);

        if (swapAmount < synth.balanceOf(address(pstts.ss))) {
            _setPendingSwapState(itemId, PendingSwapState.PartiallyCompleted);
        } else {
            _setPendingSwapState(itemId, PendingSwapState.Completed);
            _burn(itemId);
        }

        // Try swapping the synth to the desired token via the stored swap pool contract
        // If the external call succeeds, send the token to the owner of token with itemId.
        pstts.ss.swapSynthToToken(
            pstts.swap,
            synth,
            getSynthIndex(pstts.swap),
            pstts.tokenToIndex,
            swapAmount,
            minAmount,
            deadline,
            nftOwner
        );
    }

    // Add the given pending synth settlement struct to the list
    function _addToPendingSynthSwapList(PendingSynthSwap memory pss)
        internal
        returns (uint256)
    {
        require(
            pendingSwapsLength < MAX_UINT256,
            "pendingSwapsLength reached max size"
        );
        pendingSynthSwaps[pendingSwapsLength] = pss;
        return pendingSwapsLength++;
    }

    // Add the given pending synth to token settlement struct to the list
    function _addToPendingSynthToTokenSwapList(
        PendingSynthToTokenSwap memory pstts
    ) internal returns (uint256) {
        require(
            pendingSwapsLength < MAX_UINT256,
            "pendingSwapsLength reached max size"
        );
        pendingSynthToTokenSwaps[pendingSwapsLength] = pstts;
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
        uint256 expectedMediumSynthAmount =
            swap.calculateSwap(tokenFromIndex, mediumSynthIndex, tokenInAmount);
        bytes32 mediumSynthKey = getSynthKey(swap);

        IExchangeRates exchangeRates =
            IExchangeRates(SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME));
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
        // Create a SynthSwapper clone
        SynthSwapper synthSwapper =
            SynthSwapper(Clones.clone(SYNTH_SWAPPER_MASTER));

        // Add the synthswapper to the pending settlement list
        uint256 itemId =
            _addToPendingSynthSwapList(
                PendingSynthSwap(synthSwapper, synthOutKey)
            );
        _setPendingSwapType(itemId, PendingSwapType.TokenToSynth);

        // Mint an ERC721 token that represents ownership of the pending synth settlement to msg.sender
        _mint(msg.sender, itemId);

        // Transfer token from msg.sender
        IERC20 tokenFrom = swap.getToken(tokenFromIndex); // revert when token not found in swap pool
        tokenFrom.safeTransferFrom(msg.sender, address(this), tokenInAmount);
        tokenInAmount = tokenFrom.balanceOf(address(this));
        tokenFrom.approve(address(swap), tokenInAmount);

        // Swap the synth to the medium synth
        uint256 mediumSynthAmount =
            swap.swap(
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
        emit TokenToSynth(msg.sender, swap, tokenFrom, tokenInAmount, itemId);

        return (itemId);
    }

    /**
     * @notice Calculates the expected amount of the desired token the caller will receive after completing
     * a `TokenToSynth` swap with the given parameters. This calculation does not consider the settlement periods or
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
        IExchangeRates exchangeRates =
            IExchangeRates(SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME));

        uint8 mediumSynthIndex = getSynthIndex(swap);
        bytes32 mediumSynthKey = getSynthKey(swap);
        require(synthInKey != mediumSynthKey, "use normal swap");

        uint256 expectedMediumSynthAmount =
            exchangeRates.effectiveValue(
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
        bytes32 mediumSynthKey = getSynthKey(swap);
        require(
            synthInKey != mediumSynthKey,
            "synth is supported via normal swap"
        );

        // Create a SynthSwapper clone
        SynthSwapper synthSwapper =
            SynthSwapper(Clones.clone(SYNTH_SWAPPER_MASTER));

        // Add the synthswapper to the pending synth to token settlement list
        uint256 itemId =
            _addToPendingSynthToTokenSwapList(
                PendingSynthToTokenSwap(
                    synthSwapper,
                    mediumSynthKey,
                    swap,
                    tokenToIndex
                )
            );
        _setPendingSwapType(itemId, PendingSwapType.SynthToToken);

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
        emit SynthToToken(msg.sender, swap, synthFrom, synthInAmount, itemId);

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
        IExchangeRates exchangeRates =
            IExchangeRates(SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME));

        uint256 firstSynthAmount =
            swaps[0].calculateSwap(
                tokenFromIndex,
                getSynthIndex(swaps[0]),
                tokenFromAmount
            );

        uint256 mediumSynthAmount =
            exchangeRates.effectiveValue(
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
        SynthSwapper synthSwapper =
            SynthSwapper(Clones.clone(SYNTH_SWAPPER_MASTER));
        bytes32 mediumSynthKey = getSynthKey(swaps[1]);

        // Add the synthswapper to the pending synth to token settlement list
        uint256 itemId =
            _addToPendingSynthToTokenSwapList(
                PendingSynthToTokenSwap(
                    synthSwapper,
                    mediumSynthKey,
                    swaps[1],
                    tokenToIndex
                )
            );
        _setPendingSwapType(itemId, PendingSwapType.TokenToToken);

        // Mint an ERC721 token that represents ownership of the pending swap to msg.sender
        _mint(msg.sender, itemId);

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
            swaps,
            tokenFromIndex,
            tokenToIndex,
            tokenFromAmount,
            itemId
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
        // Ensure the synth with the same currency key exists at the given `synthIndex`
        IERC20 synth = swap.getToken(synthIndex);
        require(
            ISynth(Proxy(address(synth)).target()).currencyKey() == currencyKey,
            "currencyKey does not match"
        );
        require(synthIndex < MAX_UINT8, "index is too large");
        synthIndexesPlusOne[address(swap)] = synthIndex + 1;
        synthAddresses[address(swap)] = address(synth);
        synthKeys[address(swap)] = currencyKey;
        emit SynthIndex(address(swap), synthIndex, currencyKey, address(synth));
    }

    /**
     * @notice Returns the index of the supported synth in the given `swap` pool. Reverts if the `swap` pool
     * is not registered.
     * @param swap the address of the pool that contains the synth
     * @return the index of the supported synth
     */
    function getSynthIndex(ISwap swap) public view returns (uint8) {
        uint8 synthIndexPlusOne = synthIndexesPlusOne[address(swap)];
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
        address synthAddress = synthAddresses[address(swap)];
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
        bytes32 synthKey = synthKeys[address(swap)];
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
