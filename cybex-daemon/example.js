const { CybexDaemon, KEY_MODE } = require("./CybexDaemon");
const { EVENT_ON_NEW_HISTORY } = require("./constants");

const NODE_URL = "wss://shenzhen.51nebula.com";
const DAEMON_USER = "create-test21";
const DAEMON_PASSWORD = "qwer1234qwer1234";

async function transferDemo() {
  // 新建一个守护账号
  let daemon = new CybexDaemon(
    NODE_URL,
    DAEMON_USER,
    DAEMON_PASSWORD,
    KEY_MODE.PASSWORD
  );
  await daemon.init(); // 配置守护链接的初始化
  // 测试的转账
  let transferObj = {
    to_account: "1.2.11946",
    amount: 50000,
    asset: "1.3.0",
    memo: `transfer demo`
  };
  // EVENT_ON_NEW_HISTORY 发出代表该账号监听到一次区块变更，并取到了守护账号的最新信息。
  // 在某些时候这个信息是必要的
  // 这里只使用performTransfer测试一次转账操作
  daemon.once(EVENT_ON_NEW_HISTORY, () => {
    daemon.performTransfer(transferObj).catch(err => console.error(err));
  });
}

transferDemo();