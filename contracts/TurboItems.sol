// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
// import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// TurboItems: ERC1155 items (Nitro, BubbleShield, etc.) with EIP-712 permit for gasless transfer by backend relayer.
/// - Used for Shop mints and PvP staking.
/// - Only Shop (or owner) can mint.
/// - transferFromWithPermit allows the backend to move user's items into PvP escrow using the user's signature (gasless for user).
contract TurboItems is Initializable, ERC1155Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    using ECDSA for bytes32;

    // Roles managed simply via owner-only setters (keep minimal)
    address public shop; // authorized minter

    // EIP-712 domain separator data
    bytes32 public constant TRANSFER_TYPEHASH = keccak256(
        "Transfer(address owner,address to,uint256 id,uint256 amount,uint256 nonce,uint256 deadline)"
    );
    bytes32 private _DOMAIN_SEPARATOR;
    uint256 private _CACHED_CHAIN_ID;

    mapping(address => uint256) public nonces; // owner => nonce

    event ShopUpdated(address indexed shop);
    event PermitTransfer(address indexed owner, address indexed to, uint256 id, uint256 amount);

    function initialize(string memory uri_, address owner_, address shop_) public initializer {
        __ERC1155_init(uri_);
        __Ownable_init();
        __UUPSUpgradeable_init();
        _transferOwnership(owner_);
        shop = shop_;
        _updateDomainSeparator();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setURI(string calldata newuri) external onlyOwner {
        _setURI(newuri);
    }

    function setShop(address shop_) external onlyOwner {
        shop = shop_;
        emit ShopUpdated(shop_);
    }

    function _updateDomainSeparator() internal {
        _CACHED_CHAIN_ID = block.chainid;
        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("TurboItems")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function domainSeparator() public view returns (bytes32) {
        return block.chainid == _CACHED_CHAIN_ID ? _DOMAIN_SEPARATOR : keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("TurboItems")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// Mint by Shop (or owner)
    function mintFromShop(address to, uint256 id, uint256 amount) external {
        require(msg.sender == shop || msg.sender == owner(), "Not authorized minter");
        _mint(to, id, amount, "");
    }

    /// Gasless transfer based on EIP-712 signature from owner
    function transferFromWithPermit(
        address owner_,
        address to,
        uint256 id,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= deadline, "Permit expired");
        uint256 nonce = nonces[owner_];
        bytes32 structHash = keccak256(abi.encode(
            TRANSFER_TYPEHASH,
            owner_,
            to,
            id,
            amount,
            nonce,
            deadline
        ));
        bytes32 digest = _hashTypedData(structHash);
        address signer = ECDSA.recover(digest, v, r, s);
        require(signer == owner_, "Invalid signature");
        unchecked { nonces[owner_] = nonce + 1; }
        _safeTransferFrom(owner_, to, id, amount, "");
        emit PermitTransfer(owner_, to, id, amount);
    }
}
