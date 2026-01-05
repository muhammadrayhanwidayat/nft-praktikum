// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyNFT is ERC721URIStorage, Ownable {
    uint256 private _tokenIds;

    constructor() ERC721("UMYNFT", "UMYN") {}

    function mintNFT(address recipient, string memory tokenURI)
        public
        onlyOwner
        returns (uint256)
    {
        _tokenIds++;
        uint256 newItemId = _tokenIds;

        _safeMint(recipient, newItemId);
        _setTokenURI(newItemId, tokenURI);

        return newItemId;
    }
    function totalSupply() public view returns (uint256) {
    return _tokenIds;
    }

    function tokensOfOwner(address owner) public view returns (uint256[] memory) {
        uint256 supply = _tokenIds;
        uint256 ownerTokenCount = balanceOf(owner);
        uint256[] memory result = new uint256[](ownerTokenCount);
        uint256 counter = 0;
        for (uint256 i = 1; i <= supply; i++) { // token id dimulai 1 sesuai mint implementation
            if (_exists(i) && ownerOf(i) == owner) {
                result[counter] = i;
                counter++;
                if (counter == ownerTokenCount) break;
            }
        }
        return result;
    }
}


