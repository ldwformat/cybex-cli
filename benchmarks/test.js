const { execSync, exec } = require("child_process");

console.log("FROM RESULT: ");
// let result = execSync(`node ./child.js`);
// let result = exec(`node ./decode-memo.js --wif=5K8DGK453m3uf9RqoBFAroXAJ4xakDb9iNxpmJj5bmNcXuK3dEJ memo='{"from":"CYB8HyiLPpUtZAssxoKZud9eMHc2vENWbMAKGEJzr8Xu6jKmoitQc","to":"CYB7bAJvGEX9xbEEuE4ho8zaac1vppbGYVxhaP4Lebu3DKuo2FTmb","nonce":"391085497047477","message":"2c807fb977f711a6d763efbdf50b585af3d58c5a3875423ce5eef30602b10281"}'`);
// result.on("data", d => console.log("D: ", d));
let result = execSync(`node ./decode-memo.js --wif=5K8DGK453m3uf9RqoBFAroXAJ4xakDb9iNxpmJj5bmNcXuK3dEJ memo='{"from":"CYB8HyiLPpUtZAssxoKZud9eMHc2vENWbMAKGEJzr8Xu6jKmoitQc","to":"CYB7bAJvGEX9xbEEuE4ho8zaac1vppbGYVxhaP4Lebu3DKuo2FTmb","nonce":"391085497047477","message":"2c807fb977f711a6d763efbdf50b585af3d58c5a3875423ce5eef30602b10281"}'`);
console.log("FROM RESULT: ", result.toString());