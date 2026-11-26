//-------------------------------------//
//██████╗ ██████╗ ██╗███╗   ███╗███████╗    ██╗  ██╗███╗   ███╗██████╗
//██╔══██╗██╔══██╗██║████╗ ████║██╔════╝    ╚██╗██╔╝████╗ ████║██╔══██╗
//██████╔╝██████╔╝██║██╔████╔██║█████╗       ╚███╔╝ ██╔████╔██║██║  ██║
//██╔═══╝ ██╔══██╗██║██║╚██╔╝██║██╔══╝       ██╔██╗ ██║╚██╔╝██║██║  ██║
//██║     ██║  ██║██║██║ ╚═╝ ██║███████╗    ██╔╝ ██╗██║ ╚═╝ ██║██████╔╝
//╚═╝     ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝
//
//                  By PRIME KNOX.
//-------------------------------------//

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";
import pino from "pino";
import chalk from "chalk";
import readline from "readline";

function askNumber() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    console.log(chalk.cyan("Enter Your Number Below"));
    rl.question("Ex 23769xxxxxxx (digits only, with country code): ", (answer) => {
      rl.close();
      const cleaned = String(answer || "").replace(/\D/g, "");
      resolve(cleaned);
    });
  });
}

const root = process.cwd();
const Session = path.join(root, "PRIME_X");
if (!fs.existsSync(Session)) {
  fs.mkdirSync(Session, { recursive: true });
}

const Logger = pino({ level: "silent" });

async function ResetPrime() {
  if (fs.existsSync(Session)) {
    fs.rmSync(Session, { recursive: true, force: true });
  }
  fs.mkdirSync(Session, { recursive: true });
}

async function connect() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(Session);
    const { version } = await fetchLatestBaileysVersion();

    const prime = makeWASocket({
      logger: Logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      syncFullHistory: false,
      version,
      keepAliveIntervalMs: 10000,
    });

    let pairingRequested = false;

    prime.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !prime.authState.creds.registered && !pairingRequested) {
        pairingRequested = true;
        try {
          const phoneNumber = await askNumber();
          if (!phoneNumber) {
            console.log(chalk.red("[PRIME] : Invalid phone number."));
            pairingRequested = false;
            return;
          }
          const code = await prime.requestPairingCode(phoneNumber, "PRIMEXMD");
          console.log(chalk.green(`[PRIME] : Pairing Code -> ${code}`));
        } catch (err) {
          console.error(chalk.red("[PRIME] : Pairing code error."), err);
          pairingRequested = false;
        }
      }

      if (connection === "close") {
        pairingRequested = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(
          chalk.red("[PRIME] : Connection Closed. Reconnecting..."),
          shouldReconnect
        );

        if (shouldReconnect) {
          setTimeout(() => connect(), 3000);
        } else {
          console.log(chalk.red("[PRIME] : PRIME got Disconnected (Logged Out)."));
          console.log(chalk.yellow("[PRIME] : Resetting session for a new connection..."));
          await ResetPrime();
          setTimeout(() => connect(), 3000);
        }
      } else if (connection === "connecting") {
        console.log(chalk.cyan("[PRIME] : PRIME IS ALMOST CONNECTED"));
      } else if (connection === "open") {
        pairingRequested = false;
        console.log(chalk.green("[PRIME] : PRIME IS ALIVE"));
      }
    });

    prime.ev.on("creds.update", saveCreds);

    prime.ev.on("messages.upsert", async (m) => {
      if (m.type !== "notify") return;
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const msgtype = Object.keys(msg.message)[0];
      console.log(
        chalk.cyan(`Message Received\n From : ${from}\n Type: ${msgtype}`)
      );
    });
  } catch (error) {
    console.error(chalk.red("[PRIME] : Error."), error);
    process.exit(1);
  }
}

export default connect;