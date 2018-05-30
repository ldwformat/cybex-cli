## 运行方式

* clone 项目，`yarn/npm i`，
* 执行 `node cli [--name=owner1] [--api=wss://shenzhen.51nebula.com] [--seed=qwer1234qwer1234]` 配置所需连接的节点，所使用的用户名，对应密码。
* 连敲 tab 可查看所支持命令


---
* 调用decode可以使用
`node ./decode-memo.js --seed=qwer1234 --user=test --wif=5K8DGK453m3uf9RqoBFAroXAJ4xakDb9iNxpmJj5bmNcXuK3dEJ memo='{"from":"CYB8HyiLPpUtZAssxoKZud9eMHc2vENWbMAKGEJzr8Xu6jKmoitQc","to":"CYB7bAJvGEX9xbEEuE4ho8zaac1vppbGYVxhaP4Lebu3DKuo2FTmb","nonce":"391085497047477","message":"2c807fb977f711a6d763efbdf50b585af3d58c5a3875423ce5eef30602b10281"}'`

	其中--user为任意云账号用户名 --seed为该用户密码 --wif能够解锁该memo的私钥 --memo为字串化的memo对象 --api为任意节点api地址
	
	该脚本返回的最后一行为解密后memo