// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBurnableERC20 is IERC20 {
    function burn(uint256 amount) external;
}

interface ITurboItems {
    function mintFromShop(address to, uint256 id, uint256 amount) external;
}

/// Minimal interface for Uniswap Permit2 signature transfer (top-level)
interface ISignatureTransfer {
    struct TokenPermissions { address token; uint256 amount; }
    struct PermitTransferFrom { TokenPermissions permitted; uint256 nonce; uint256 deadline; }
    struct SignatureTransferDetails { address to; uint256 requestedAmount; }
    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

/// Shop (UUPS upgradeable)
/// - Users buy items using TURBO tokens.
/// - For now, assumes allowance-based transferFrom (user approves Shop to spend). Backend can relay tx.
/// - Burn model: burn 100% of tokens received.
contract Shop is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Item {
        uint256 price;      // price in TURBO per unit
        uint16 burnBps;     // burn basis points (10000 = 100%)
        bool enabled;
        bool pvpUsable;     // true for Nitro(1) and BubbleShield(2)
    }

    IBurnableERC20 public turbo;
    ITurboItems public items; // ERC1155 minter

    mapping(uint256 => Item) public catalog; // itemId => Item
    uint256[] private _itemIds;

    // Backend relayer that can execute gasless purchases on behalf of users
    address public backend;

    // Uniswap Permit2 shared contract address (chain-specific). Optional; enables zero-approval buys.
    address public permit2;

    event ItemSet(uint256 indexed itemId, uint256 price, uint16 burnBps, bool enabled, bool pvpUsable);
    event Bought(address indexed buyer, uint256 indexed itemId, uint256 qty, uint256 totalPaid, uint256 burned);

    function initialize(address turboToken, address itemsContract, address owner_) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        turbo = IBurnableERC20(turboToken);
        items = ITurboItems(itemsContract);
        _transferOwnership(owner_);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// Set backend relayer address (server EOA). Only owner can update.
    function setBackend(address backend_) external onlyOwner {
        backend = backend_;
    }

    /// Set Permit2 contract address. Only owner can update.
    function setPermit2(address permit2_) external onlyOwner {
        permit2 = permit2_;
    }

    modifier onlyBackend() {
        require(msg.sender == backend, "only backend");
        _;
    }

    function setItem(uint256 itemId, uint256 price, uint16 burnBps, bool enabled, bool pvpUsable) external onlyOwner {
        require(burnBps <= 10000, "burnBps>10000");
        catalog[itemId] = Item({price: price, burnBps: burnBps, enabled: enabled, pvpUsable: pvpUsable});
        
        // Add to array if not already present
        bool exists = false;
        for (uint i = 0; i < _itemIds.length; i++) {
            if (_itemIds[i] == itemId) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            _itemIds.push(itemId);
        }
        
        emit ItemSet(itemId, price, burnBps, enabled, pvpUsable);
    }

    function getItemIds() external view returns (uint256[] memory) {
        return _itemIds;
    }

    function buy(uint256 itemId, uint256 qty) external {
        Item memory it = catalog[itemId];
        require(it.enabled, "item disabled");
        require(qty > 0, "qty=0");
        uint256 total = it.price * qty;

        // Pull tokens from user; requires allowance set to Shop beforehand.
        // Backend can relay the tx for gasless UX.
        require(turbo.transferFrom(msg.sender, address(this), total), "transferFrom failed");

        // Burn according to burnBps (default 100%)
        uint256 toBurn = total * it.burnBps / 10000;
        if (toBurn > 0) {
            // Shop holds the tokens, so it can burn its own balance
            turbo.burn(toBurn);
        }

        // Mint items to user
        items.mintFromShop(msg.sender, itemId, qty);

        emit Bought(msg.sender, itemId, qty, total, toBurn);
    }

    /// Gasless purchase relayed by backend. Pulls tokens from buyer (requires prior allowance for Shop).
    function buyFor(address buyer, uint256 itemId, uint256 qty) external onlyBackend {
        Item memory it = catalog[itemId];
        require(it.enabled, "item disabled");
        require(qty > 0, "qty=0");
        uint256 total = it.price * qty;

        // Pull tokens from buyer; buyer must have approved Shop as spender (or set via Permit2 in future upgrade)
        require(turbo.transferFrom(buyer, address(this), total), "transferFrom failed");

        // Burn according to burnBps
        uint256 toBurn = total * it.burnBps / 10000;
        if (toBurn > 0) {
            turbo.burn(toBurn);
        }

        // Mint items to buyer
        items.mintFromShop(buyer, itemId, qty);

        emit Bought(buyer, itemId, qty, total, toBurn);
    }

    

    /// Fully gasless purchase using Permit2 signature (no ERC20 approve required by user).
    /// The buyer signs a Permit2 message off-chain; anyone can relay this tx.
    function buyWithPermit2(
        address buyer,
        uint256 itemId,
        uint256 qty,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        Item memory it = catalog[itemId];
        require(it.enabled, "item disabled");
        require(qty > 0, "qty=0");
        require(permit2 != address(0), "permit2 not set");

        uint256 total = it.price * qty;

        // Build Permit2 structs
        ISignatureTransfer.TokenPermissions memory perm = ISignatureTransfer.TokenPermissions({
            token: address(turbo),
            amount: total
        });
        ISignatureTransfer.PermitTransferFrom memory p = ISignatureTransfer.PermitTransferFrom({
            permitted: perm,
            nonce: nonce,
            deadline: deadline
        });
        ISignatureTransfer.SignatureTransferDetails memory details = ISignatureTransfer.SignatureTransferDetails({
            to: address(this),
            requestedAmount: total
        });

        // Pull tokens from buyer via Permit2 signature
        ISignatureTransfer(permit2).permitTransferFrom(p, details, buyer, signature);

        // Burn according to burnBps
        uint256 toBurn = total * it.burnBps / 10000;
        if (toBurn > 0) {
            turbo.burn(toBurn);
        }

        // Mint items to buyer
        items.mintFromShop(buyer, itemId, qty);

        emit Bought(buyer, itemId, qty, total, toBurn);
    }
}
