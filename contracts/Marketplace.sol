// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract Marketplace is ReentrancyGuard {
    struct Listing {
        address seller;
        address nftAddress;
        uint256 tokenId;
        uint256 price; // wei
        bool active;
    }

    // key: keccak256(abi.encodePacked(nftAddress, tokenId))
    mapping(bytes32 => Listing) public listings;
    // list of keys (for simple enumeration)
    bytes32[] public listingKeys;

    event Listed(address indexed seller, address indexed nftAddress, uint256 indexed tokenId, uint256 price);
    event Canceled(address indexed seller, address indexed nftAddress, uint256 indexed tokenId);
    event Purchased(address indexed buyer, address indexed seller, address indexed nftAddress, uint256 tokenId, uint256 price);

    function _key(address nftAddress, uint256 tokenId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(nftAddress, tokenId));
    }

    function listItem(address nftAddress, uint256 tokenId, uint256 price) external {
        require(price > 0, "Price must be > 0");
        IERC721 nft = IERC721(nftAddress);
        address owner = nft.ownerOf(tokenId);
        require(owner == msg.sender, "Only owner can list");
        // require marketplace is approved to transfer this token
        require(
            nft.getApproved(tokenId) == address(this) || nft.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        bytes32 k = _key(nftAddress, tokenId);
        Listing storage l = listings[k];
        if (!l.active) {
            // new listing -> push key
            listingKeys.push(k);
        }
        listings[k] = Listing({
            seller: msg.sender,
            nftAddress: nftAddress,
            tokenId: tokenId,
            price: price,
            active: true
        });

        emit Listed(msg.sender, nftAddress, tokenId, price);
    }

    function cancelListing(address nftAddress, uint256 tokenId) external {
        bytes32 k = _key(nftAddress, tokenId);
        Listing storage l = listings[k];
        require(l.active, "Listing not active");
        require(l.seller == msg.sender, "Only seller can cancel");

        l.active = false;
        emit Canceled(msg.sender, nftAddress, tokenId);
    }

    // buy exact price (buyer sends ETH)
    function buyItem(address nftAddress, uint256 tokenId) external payable nonReentrant {
        bytes32 k = _key(nftAddress, tokenId);
        Listing storage l = listings[k];
        require(l.active, "Listing not active");
        require(msg.value == l.price, "Send exact price");

        // double-check seller still owner and marketplace still approved
        IERC721 nft = IERC721(nftAddress);
        address owner = nft.ownerOf(tokenId);
        require(owner == l.seller, "Seller no longer owner");
        require(
            nft.getApproved(tokenId) == address(this) || nft.isApprovedForAll(l.seller, address(this)),
            "Marketplace not approved"
        );

        address seller = l.seller;
        // deactivate listing early to avoid reentrancy on events/call
        l.active = false;

        // transfer NFT to buyer
        nft.safeTransferFrom(seller, msg.sender, tokenId);

        // forward funds to seller (use call)
        (bool sent, ) = payable(seller).call{value: msg.value}("");
        require(sent, "Failed to send ETH to seller");

        emit Purchased(msg.sender, seller, nftAddress, tokenId, msg.value);
    }

    // read helper: get listing details
    function getListing(address nftAddress, uint256 tokenId) external view returns (Listing memory) {
        bytes32 k = _key(nftAddress, tokenId);
        return listings[k];
    }

    // enumerate active listings (simple approach)
    function fetchActiveListings() external view returns (Listing[] memory) {
        uint256 total = listingKeys.length;
        uint256 count = 0;
        // first count active
        for (uint256 i = 0; i < total; i++) {
            Listing memory l = listings[listingKeys[i]];
            if (l.active) count++;
        }

        Listing[] memory out = new Listing[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; i++) {
            Listing memory l = listings[listingKeys[i]];
            if (l.active) {
                out[idx] = l;
                idx++;
            }
        }
        return out;
    }
}