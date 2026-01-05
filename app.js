function $(id) {
  return document.getElementById(id);
}
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

// ===== Pastikan ethers ada =====
if (typeof ethers === "undefined") {
  alert("ethers.js belum termuat. Pastikan script ethers dimuat sebelum app.js");
  throw new Error("ethers not found");
}

const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
let signer;
let account;
let currentChainId = null;

let erc20Contract;
let erc721Contract;

// ===== ABI =====
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokensOfOwner(address owner) view returns (uint256[])",
  "function totalSupply() view returns (uint256)"
];

// ===== INIT =====
function init() {
  console.log("DApp init");

  if (!window.ethereum) {
    alert("MetaMask tidak terdeteksi");
    return;
  }

  const btnConnect = $("btnConnect");
  if (btnConnect) btnConnect.onclick = connectWallet;

  const btnTransfer = $("btnTransfer");
  if (btnTransfer) btnTransfer.onclick = doTransfer;
}

// ===== CONNECT WALLET =====
async function connectWallet() {
  try {
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    account = await signer.getAddress();

    setText("account", account);

    const network = await provider.getNetwork();
    currentChainId = network.chainId;
    setText("network", `Network: ${network.chainId}`);

    // ===== Init contracts =====
    if (!window.CONFIG) {
      console.warn("CONFIG tidak ada");
      setText("erc20Status", "CONFIG missing");
      return;
    }

    if (CONFIG.UMYCOIN_ADDRESS) {
      erc20Contract = new ethers.Contract(
        CONFIG.UMYCOIN_ADDRESS,
        ERC20_ABI,
        provider
      );
    }

    if (CONFIG.UMYNFT_ADDRESS) {
      erc721Contract = new ethers.Contract(
        CONFIG.UMYNFT_ADDRESS,
        ERC721_ABI,
        provider
      );
    }

    // ===== Load ERC20 info =====
    if (erc20Contract) {
      try {
        setText("erc20Name", await erc20Contract.name());
        setText("erc20Symbol", await erc20Contract.symbol());
      } catch (e) {
        console.warn("Gagal load ERC20 info");
      }
    }

    setText("erc721Address", CONFIG.UMYNFT_ADDRESS || "-");

    await refreshBalances();
    await loadNFTs();

    // listener
    ethereum.on("accountsChanged", () => location.reload());
    ethereum.on("chainChanged", () => location.reload());

  } catch (err) {
    console.error(err);
    alert("Gagal connect wallet: " + err.message);
  }
}

// ===== BALANCE =====
async function refreshBalances() {
  if (!account || !erc20Contract) return;

  try {
    const decimals = await erc20Contract.decimals();
    const bal = await erc20Contract.balanceOf(account);
    setText(
      "erc20Balance",
      ethers.utils.formatUnits(bal, decimals)
    );
  } catch (e) {
    console.error("balance error", e);
    setText("erc20Balance", "Error");
  }
}

// ===== TRANSFER =====
async function doTransfer() {
  if (!account || !erc20Contract) {
    alert("Wallet / contract belum siap");
    return;
  }

  const to = $("transferTo")?.value;
  const amount = $("transferAmount")?.value;

  if (!ethers.utils.isAddress(to)) {
    alert("Alamat tidak valid");
    return;
  }

  const decimals = await erc20Contract.decimals();
  const value = ethers.utils.parseUnits(amount, decimals);

  try {
    const tx = await erc20Contract
      .connect(signer)
      .transfer(to, value);

    setText("erc20Status", "Pending: " + tx.hash);
    await tx.wait();
    setText("erc20Status", "Success");
    await refreshBalances();
  } catch (e) {
    console.error(e);
    setText("erc20Status", "Error transfer");
  }
}

// ===== NFT =====
async function loadNFTs() {
  const list = $("nftList");
  if (!list || !erc721Contract || !account) return;

  list.innerHTML = "";
  setText("erc721Status", "Memuat NFT...");

  try {
    const ids = await erc721Contract.tokensOfOwner(account);
    if (ids.length === 0) {
      setText("erc721Status", "Belum ada NFT");
      return;
    }

    for (let id of ids) {
  const tokenId = id.toString();
  const uri = await erc721Contract.tokenURI(tokenId);
  const meta = await fetchMetadata(uri);

  // 🔥 FIX IPFS IMAGE
  let imageUrl = "";
  if (meta.image) {
    if (meta.image.startsWith("ipfs://")) {
      imageUrl =
        CONFIG.IPFS_GATEWAY + meta.image.replace("ipfs://", "");
    } else {
      imageUrl = meta.image;
    }
  }

  const div = document.createElement("div");
  div.style.marginBottom = "12px";
  div.innerHTML = `
    <b>Token #${tokenId}</b><br>
    <img src="${imageUrl}" width="120"
         onerror="this.src='https://via.placeholder.com/120?text=No+Image'"><br>
    <small>${meta.name || ""}</small>
  `;
  list.appendChild(div);
}


    setText("erc721Status", "Selesai");
  } catch (e) {
    console.error(e);
    setText("erc721Status", "Gagal load NFT");
  }
}

// ===== METADATA =====
async function fetchMetadata(uri) {
  try {
    if (uri.startsWith("ipfs://")) {
      uri = CONFIG.IPFS_GATEWAY + uri.replace("ipfs://", "");
    }
    const res = await fetch(uri);
    return await res.json();
  } catch {
    return {};
  }
}

window.onload = init;
