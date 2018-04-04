const fs = require("fs");
const path = require("path");
const assert = require("assert");
const readline = require("readline");

const { PrivateKey, hash, PublicKey, Aes } = require("cybexjs");
const { compress, decompress } = require("lzma");


function getBackupPublicKey(contents) {
  try {
    return PublicKey.fromBuffer(contents.slice(0, 33));
  } catch (e) {
    console.error(e, e.stack);
  }
}

/**
 * 解钱包
 * 
 * @param {string} backupWif 由钱包密码生成的私钥WIF
 * @param {Buffer} backupBuffer 完整的Wallet Buffer
 * @returns {Object} walletObject 解析后的钱包文件
 */
async function decryptWalletBackup(backupWif, backupBuffer) {
  assert(Buffer.isBuffer(backupBuffer), "The input should be a wallet buffer");

  let privKey = PrivateKey.fromWif(backupWif);
  let pubKey = getBackupPublicKey(backupBuffer);

  // Main body of wallet;
  let mainContent = backupBuffer.slice(33);
  let decryptedContent = Aes.decrypt_with_checksum(
    privKey, pubKey, null/*nonce*/, mainContent);
  let walletObject = await new Promise(resolve =>
    decompress(decryptedContent, walletString => {
      resolve(JSON.parse(walletString));
    })
  );
  return walletObject;
}

function decryptAesKey(password, cryptedKey) {
  let password_aes = Aes.fromSeed(password);
  let encryption_plainbuffer = password_aes.decryptHexToBuffer(cryptedKey);
  let aes_private = Aes.fromSeed(encryption_plainbuffer);
  return aes_private;
}


/**
 * @description 获取钱包内某一私钥
 * 
 * @param {Aes} aesPrivate 由钱包密码揭秘的 Aes 对象
 * @param {string} cryptedKey 私钥Hex秘文
 * @returns {Object} {privKey, pubKey}
 */
function decryptKeysByWalletAes(aesPrivate, cryptedKey) {
  let privKeyBuffer = aesPrivate.decryptHexToBuffer(cryptedKey);
  let privKey = PrivateKey.fromBuffer(privKeyBuffer);
  return {
    privKey,
    pubKey: privKey.toPublicKey().toPublicKeyString()
  };
}

function getAesPrivateOfWallet(password, wallet) {
  let passwordPrivate = PrivateKey.fromSeed(password);
  let passwordPublic = passwordPrivate.toPublicKey().toPublicKeyString();
  if (wallet.password_pubkey !== passwordPublic) return false;
  return decryptAesKey(password, wallet.encryption_key);
}

exports.getWalletReader = () => async (filepath) => {
  assert(filepath, "File path is required!");
  let file = filepath.startsWith(".") ? path.resolve(__dirname, filepath) : filepath;
  const walletFile = fs.readFileSync(file);

  // 读取密码
  let passReader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "Password For Wallet: "
  });
  passReader.prompt(true);
  let password = await new Promise(resolve => {
    passReader.question("Password For Wallet: ", (answer) => {
      passReader.close();
      resolve(answer);
    });
  });

  // 读取钱包对象
  let walletObject = await decryptWalletBackup(
    PrivateKey.fromSeed(password).toWif(),
    walletFile
  );

  // 钱包解密
  let { wallet, private_keys, linked_accounts } = walletObject;
  let aesPrivate = getAesPrivateOfWallet(password, wallet[0]);
  let privateKeys = private_keys.map(privateKeyObj =>
    decryptKeysByWalletAes(aesPrivate, privateKeyObj.encrypted_key)
  );

  return { walletObject, privateKeys };
};