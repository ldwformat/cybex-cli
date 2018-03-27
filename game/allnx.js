let send0306 = require("./to_send_0306.json");
let winners = require("./winner-list.json");

let name = [...send0306, ...winners].map(winner => winner[0]);

const fs = require("fs");

fs.writeFile("./names.json", JSON.stringify(name));