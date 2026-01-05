// app.js - DApp logic (ethers v5) - siap copy/paste

// ------- Helpers -------
function $(id) { return document.getElementById(id); }
function setText(id, value) { const el = $(id); if (el) el.textContent = value; }

// ------- Check ethers -------
if (typeof ethers === "undefined") {
  alert("ethers.js belum termuat. Pastikan script ethers dimuat sebelum app.js");
  throw new Error("ethers not found");
}

// ------- Provider & state -------
const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
let signer = null;
let account = null;
let currentChainId = null;

let erc20Contract = null;
let erc721Contract = null;
let marketplaceContract = null;

// ------- ABIs (minimal) -------
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const ERC721_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokensOfOwner(address owner) view returns (uint256[])",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "function getApproved(uint256 tokenId) view returns (address)"
];

const MARKETPLACE_ABI = [
  "function listItem(address nftAddress,uint256 tokenId,uint256 price)",
  "function cancelListing(address nftAddress,uint256 tokenId)",
  "function buyItem(address nftAddress,uint256 tokenId) payable",
  "function fetchActiveListings() view returns (tuple(address seller,address nftAddress,uint256 tokenId,uint256 price,bool active)[])",
  "event Listed(address indexed seller,address indexed nftAddress,uint256 indexed tokenId,uint256 price)",
  "event Canceled(address indexed seller,address indexed nftAddress,uint256 indexed tokenId)",
  "event Purchased(address indexed buyer,address indexed seller,address indexed nftAddress,uint256 tokenId,uint256 price)"
];

// ------- Utility: decode revert reason (best-effort) -------
function extractRevertReason(error) {
  try {
    const data = error?.error?.data || error?.data || error?.reason || error?.message || error;
    if (!data) return String(error);
    if (typeof data === "string" && data.startsWith("0x08c379a0")) {
      // decode ABI encoded revert reason (best-effort)
      try {
        // remove selector + offset -> read as utf8
        const reasonHex = "0x" + data.slice(10 + 64);
        const reason = ethers.utils.toUtf8String(reasonHex);
        return reason || data;
      } catch (e) {
        return data;
      }
    }
    if (typeof data === "object" && data.message) return data.message;
    return String(data);
  } catch (e) {
    return String(error);
  }
}

// ------- Explorer helper -------
function explorerTx(hash) {
  if (currentChainId === 11155111) return `https://sepolia.etherscan.io/tx/${hash}`;
  if (currentChainId === 1) return `https://etherscan.io/tx/${hash}`;
  return "";
}

// ------- UI: add tx entry -------
function addTx(label, hash) {
  const txList = $("txList");
  if (!txList) return;
  const div = document.createElement("div");
  const link = explorerTx(hash);
  div.className = "tx-entry";
  div.innerHTML = `<div class="small">${label} <br/> ${ link ? `<a target="_blank" href="${link}">${hash}</a>` : `<code>${hash}</code>` }</div>`;
  txList.prepend(div);
}

// ------- Init & Bind -------
function init() {
  console.log("DApp init");
  if (!window.ethereum) { alert("MetaMask tidak terdeteksi"); return; }

  const btnConnect = $("btnConnect");
  if (btnConnect) btnConnect.addEventListener("click", connectWallet);

  const btnTransfer = $("btnTransfer");
  if (btnTransfer) btnTransfer.addEventListener("click", doTransfer);

  const btnApprove = $("btnApprove");
  if (btnApprove) btnApprove.addEventListener("click", approveForMarketplace);

  const btnList = $("btnList");
  if (btnList) btnList.addEventListener("click", () => {
    const tid = $("listTokenId")?.value;
    const price = $("listPrice")?.value;
    if (!tid || !price) return alert("Token ID & price required");
    listNFT(tid, price);
  });

  // optional: show configured addresses (if elements exist)
  if (window.CONFIG && CONFIG.UMYNFT_ADDRESS) setText("erc721Address", CONFIG.UMYNFT_ADDRESS);
  if (window.CONFIG && CONFIG.MARKETPLACE_ADDRESS) setText("marketplaceAddress", CONFIG.MARKETPLACE_ADDRESS);

  // clear statuses
  if ($("erc20Status")) $("erc20Status").textContent = "";
  if ($("erc721Status")) $("erc721Status").textContent = "";
  if ($("marketplaceStatus")) $("marketplaceStatus").textContent = "";
}

// ------- Connect wallet and init contracts -------
async function connectWallet() {
  try {
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    account = await signer.getAddress();
    setText("account", account);

    const network = await provider.getNetwork();
    currentChainId = network.chainId;
    setText("network", `Network: ${network.name || network.chainId} (chainId: ${network.chainId})`);

    if (!window.CONFIG) { console.warn("CONFIG missing"); setText("erc20Status","CONFIG missing"); return; }

    // instantiate contract objects (read-only provider)
    if (CONFIG.UMYCOIN_ADDRESS) erc20Contract = new ethers.Contract(CONFIG.UMYCOIN_ADDRESS, ERC20_ABI, provider);
    if (CONFIG.UMYNFT_ADDRESS) erc721Contract = new ethers.Contract(CONFIG.UMYNFT_ADDRESS, ERC721_ABI, provider);
    if (CONFIG.MARKETPLACE_ADDRESS) {
      marketplaceContract = new ethers.Contract(CONFIG.MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);
      // subscribe events (read-only)
      try {
        marketplaceContract.on("Listed", (seller, nftAddress, tokenId, price) => {
          console.log("Listed event", seller, nftAddress, tokenId.toString(), price.toString());
          loadMarketplaceListings();
          loadNFTs();
        });
        marketplaceContract.on("Canceled", (seller, nftAddress, tokenId) => {
          console.log("Canceled event", seller, nftAddress, tokenId.toString());
          loadMarketplaceListings();
        });
        marketplaceContract.on("Purchased", (buyer, seller, nftAddress, tokenId, price) => {
          console.log("Purchased event", buyer, seller, nftAddress, tokenId.toString(), price.toString());
          loadMarketplaceListings();
          loadNFTs();
          refreshBalances();
        });
      } catch (e) { console.warn("Event listen failed", e); }
    }

    // load basic ERC20 info
    if (erc20Contract) {
      try {
        const name = await erc20Contract.name().catch(()=>null);
        const sym = await erc20Contract.symbol().catch(()=>null);
        if (name) setText("erc20Name", name);
        if (sym) setText("erc20Symbol", sym);
      } catch (e) { console.warn("load erc20 info", e); }
    }

    // refresh data
    await refreshBalances();
    await loadNFTs();
    await loadMarketplaceListings();

    // listeners for account/chain changes
    window.ethereum.on("accountsChanged", async (accs) => {
      if (!accs || accs.length === 0) { account = null; setText("account",""); return; }
      account = ethers.utils.getAddress(accs[0]);
      setText("account", account);
      signer = provider.getSigner();
      await refreshBalances();
      await loadNFTs();
      await loadMarketplaceListings();
    });
    window.ethereum.on("chainChanged", (_chainId) => window.location.reload());

  } catch (err) {
    console.error("connectWallet error", err);
    const r = extractRevertReason(err);
    alert("Gagal connect wallet: " + r);
  }
}

// ------- ERC20: balance & transfer -------
async function refreshBalances() {
  if (!account) return;
  if (!erc20Contract) { setText("erc20Balance","UMYCoin not configured"); return; }
  try {
    const decimals = await erc20Contract.decimals().catch(()=>18);
    const bal = await erc20Contract.balanceOf(account);
    const formatted = ethers.utils.formatUnits(bal, decimals);
    setText("erc20Balance", `${formatted} (decimals ${decimals})`);
  } catch (e) {
    console.error("balance error", e);
    setText("erc20Balance","Error");
  }
}

async function doTransfer() {
  if (!account || !erc20Contract) { alert("Wallet / contract belum siap"); return; }
  const to = $("transferTo")?.value?.trim();
  const amount = $("transferAmount")?.value?.trim();
  if (!to || !ethers.utils.isAddress(to)) { alert("Alamat tujuan tidak valid"); return; }
  if (!amount || isNaN(amount)) { alert("Jumlah tidak valid"); return; }
  try {
    const decimals = await erc20Contract.decimals().catch(()=>18);
    const value = ethers.utils.parseUnits(amount, decimals);
    const tx = await erc20Contract.connect(signer).transfer(to, value);
    addTx(`Transfer submitted: ${tx.hash}`, tx.hash);
    setText("erc20Status", `Pending: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt && receipt.status === 1) {
      setText("erc20Status", `Success: ${tx.hash}`);
      addTx(`Transfer success: ${tx.hash}`, tx.hash);
      await refreshBalances();
    } else setText("erc20Status", `Failed: ${tx.hash}`);
  } catch (e) {
    console.error("transfer error", e);
    const r = extractRevertReason(e);
    setText("erc20Status", `Error: ${r}`);
  }
}

// ------- NFT: load owned tokens, render with "Use this ID" button -------
async function loadNFTs() {
  const list = $("nftList");
  if (!list || !erc721Contract || !account) {
    if (!erc721Contract) setText("erc721Status", "UMYNFT not configured");
    return;
  }

  list.innerHTML = "";
  setText("erc721Status", "Memuat NFT...");

  try {
    const hasTokensOfOwner = (typeof erc721Contract.tokensOfOwner === "function");
    const hasTotalSupply = (typeof erc721Contract.totalSupply === "function");
    let tokenIds = null;

    if (hasTokensOfOwner) {
      tokenIds = await erc721Contract.tokensOfOwner(account).catch(()=>null);
      if (tokenIds && tokenIds.length) tokenIds = tokenIds.map(t => t.toString ? t.toString() : String(t));
    }

    if (!tokenIds && hasTotalSupply) {
      const totalBN = await erc721Contract.totalSupply().catch(()=>null);
      const total = totalBN && totalBN.toString ? Number(totalBN.toString()) : null;
      if (total) {
        tokenIds = [];
        for (let i=1; i<=total; i++) {
          const owner = await erc721Contract.ownerOf(i).catch(()=>null);
          if (owner && owner.toLowerCase() === account.toLowerCase()) tokenIds.push(String(i));
        }
      }
    }

    if (!tokenIds) {
      setText("erc721Status", "Kontrak NFT tidak mendukung enumerasi; pertimbangkan menambahkan tokensOfOwner atau totalSupply");
      return;
    }

    if (tokenIds.length === 0) {
      setText("erc721Status", "Belum ada NFT");
      return;
    }

    for (const tokenId of tokenIds) {
      const tokenIdStr = tokenId.toString ? tokenId.toString() : String(tokenId);
      const tokenURI = await erc721Contract.tokenURI(tokenIdStr).catch(()=>null);
      const metadata = tokenURI ? await fetchMetadata(tokenURI) : {};
      let img = "";
      if (metadata.image) {
        img = metadata.image.startsWith("ipfs://") ? (CONFIG.IPFS_GATEWAY + metadata.image.replace("ipfs://","")) : metadata.image;
      }
      const div = document.createElement("div");
      div.style.marginBottom = "12px";
      div.innerHTML = `
        <b>Token #${tokenIdStr}</b><br>
        <img src="${img}" width="120" onerror="this.src='https://via.placeholder.com/120?text=No+Image'"><br>
        <small>${metadata.name || ""}</small><br>
        <button class="fillTokenBtn" data-token="${tokenIdStr}">Use this ID</button>
      `;
      list.appendChild(div);
    }

    // bind fill buttons
    document.querySelectorAll(".fillTokenBtn").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-token");
        const el = $("listTokenId");
        if (el) el.value = id;
      });
    });

    setText("erc721Status", "Selesai");
  } catch (err) {
    console.error("loadNFTs error", err);
    const r = extractRevertReason(err);
    setText("erc721Status", "Gagal load NFT: " + r);
  }
}

// ------- Fetch metadata from IPFS/HTTP (robust) -------
async function fetchMetadata(uri) {
  try {
    if (!uri) return {};
    let url = uri;
    if (uri.startsWith("ipfs://")) {
      const cid = uri.replace("ipfs://", "");
      url = (CONFIG.IPFS_GATEWAY || "https://ipfs.io/ipfs/") + cid;
    } else if (uri.startsWith("ipfs/") || uri.includes("/ipfs/")) {
      if (uri.includes("/ipfs/")) url = uri;
      else url = (CONFIG.IPFS_GATEWAY || "https://ipfs.io/ipfs/") + uri.replace("ipfs/","");
    }
    console.log("fetchMetadata -> url:", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (e) {
    console.warn("fetchMetadata failed for", uri, e);
    return {};
  }
}

// ------- Marketplace helpers -------
async function approveForMarketplace() {
  if (!erc721Contract || !account) { alert("Connect wallet & NFT contract"); return; }
  try {
    const tx = await erc721Contract.connect(signer).setApprovalForAll(CONFIG.MARKETPLACE_ADDRESS, true);
    addTx(`Approve submitted: ${tx.hash}`, tx.hash);
    await tx.wait();
    addTx(`Approve confirmed: ${tx.hash}`, tx.hash);
    await loadNFTs();
  } catch (e) {
    console.error("approveForMarketplace failed", e);
    const r = extractRevertReason(e);
    alert("Approve failed: " + r);
  }
}

async function listNFT(tokenId, priceEth) {
  if (!marketplaceContract) { alert("Marketplace not configured"); return; }
  try {
    if (!tokenId) throw new Error("Token ID required");
    // owner check
    const owner = await erc721Contract.ownerOf(tokenId).catch(()=>null);
    if (!owner) throw new Error("Token not found (owner lookup failed)");
    if (owner.toLowerCase() !== account.toLowerCase()) throw new Error("You are not the owner of token " + tokenId);

    // approval check
    const isApprovedForAll = await erc721Contract.isApprovedForAll(account, CONFIG.MARKETPLACE_ADDRESS).catch(()=>false);
    let approvedAddr = null;
    if (erc721Contract.getApproved) {
      approvedAddr = await erc721Contract.getApproved(tokenId).catch(()=>null);
    }
    if (!isApprovedForAll && (!approvedAddr || approvedAddr.toLowerCase() !== CONFIG.MARKETPLACE_ADDRESS.toLowerCase())) {
      throw new Error("Marketplace not approved. Click 'Approve Marketplace' first.");
    }

    const priceWei = ethers.utils.parseEther(String(priceEth));
    const tx = await marketplaceContract.connect(signer).listItem(CONFIG.UMYNFT_ADDRESS, tokenId, priceWei);
    addTx(`List submitted: ${tx.hash}`, tx.hash);
    await tx.wait();
    addTx(`List confirmed: ${tx.hash}`, tx.hash);
    await loadMarketplaceListings();
  } catch (e) {
    console.error("listNFT failed", e);
    const reason = extractRevertReason(e);
    alert("List failed: " + reason);
  }
}

async function cancelListing(tokenId) {
  if (!marketplaceContract) { alert("Marketplace not configured"); return; }
  try {
    const tx = await marketplaceContract.connect(signer).cancelListing(CONFIG.UMYNFT_ADDRESS, tokenId);
    addTx(`Cancel submitted: ${tx.hash}`, tx.hash);
    await tx.wait();
    addTx(`Cancel confirmed: ${tx.hash}`, tx.hash);
    await loadMarketplaceListings();
  } catch (e) {
    console.error("cancelListing failed", e);
    const r = extractRevertReason(e);
    alert("Cancel failed: " + r);
  }
}

async function buyListing(tokenId, priceEth) {
  if (!marketplaceContract) { alert("Marketplace not configured"); return; }
  try {
    const priceWei = ethers.utils.parseEther(String(priceEth));
    const tx = await marketplaceContract.connect(signer).buyItem(CONFIG.UMYNFT_ADDRESS, tokenId, { value: priceWei });
    addTx(`Buy submitted: ${tx.hash}`, tx.hash);
    setText("erc20Status", `Pending buy: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt && receipt.status === 1) {
      setText("erc20Status", `Buy success: ${tx.hash}`);
      addTx(`Buy success: ${tx.hash}`, tx.hash);
      await refreshBalances();
      await loadMarketplaceListings();
      await loadNFTs();
    } else {
      setText("erc20Status", `Buy failed: ${tx.hash}`);
    }
  } catch (e) {
    console.error("buyListing failed", e);
    const r = extractRevertReason(e);
    alert("Buy failed: " + r);
  }
}

// ------- Load marketplace listings -------
async function loadMarketplaceListings() {
  if (!$("marketplaceList")) return;
  if (!marketplaceContract) {
    setText("marketplaceStatus", "Marketplace not configured");
    return;
  }
  $("marketplaceList").innerHTML = "";
  setText("marketplaceStatus", "Memuat listings...");
  try {
    const res = await marketplaceContract.fetchActiveListings();
    if (!res || res.length === 0) { setText("marketplaceStatus","No active listings"); return; }
    setText("marketplaceStatus","Loaded listings");
    for (const l of res) {
      const tokenId = l.tokenId.toString();
      const priceEth = ethers.utils.formatEther(l.price);
      const seller = l.seller;
      const nftAddr = l.nftAddress;

      const card = document.createElement("div");
      card.className = "card";

      const nft = new ethers.Contract(nftAddr, ERC721_ABI, provider);
      const uri = await nft.tokenURI(tokenId).catch(()=>null);
      const meta = uri ? await fetchMetadata(uri) : {};
      const img = meta.image ? (meta.image.startsWith("ipfs://") ? (CONFIG.IPFS_GATEWAY + meta.image.replace("ipfs://","")) : meta.image) : "";

      card.innerHTML = `
        <div><strong>Token #${tokenId}</strong> — Price: ${priceEth} ETH</div>
        <div>Seller: ${seller}</div>
        <div><img src="${img}" width="140" onerror="this.src='https://via.placeholder.com/140?text=No+Image'"/></div>
      `;

      const actionDiv = document.createElement("div");
      actionDiv.style.marginTop = "8px";
      if (seller.toLowerCase() === account.toLowerCase()) {
        const btnCancel = document.createElement("button");
        btnCancel.textContent = "Cancel";
        btnCancel.onclick = () => cancelListing(tokenId);
        actionDiv.appendChild(btnCancel);
      } else {
        const btnBuy = document.createElement("button");
        btnBuy.textContent = `Buy ${priceEth} ETH`;
        btnBuy.onclick = () => buyListing(tokenId, priceEth);
        actionDiv.appendChild(btnBuy);
      }

      card.appendChild(actionDiv);
      $("marketplaceList").appendChild(card);
    }
  } catch (e) {
    console.error("loadMarketplaceListings error", e);
    const r = extractRevertReason(e);
    setText("marketplaceStatus","Error loading listings: " + r);
  }
}

// ------- Finalize init on load -------
window.addEventListener("load", init);
