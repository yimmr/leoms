import pc from "picocolors";

export const logger = {
  info(msg: string) {
    console.log(`${pc.cyan("ℹ")} ${msg}`);
  },
  success(msg: string) {
    console.log(`${pc.green("✔")} ${msg}`);
  },
  warn(msg: string) {
    console.log(`${pc.yellow("⚠")} ${msg}`);
  },
  error(msg: string) {
    console.error(`${pc.red("✖")} ${msg}`);
  },
  dim(msg: string) {
    console.log(pc.dim(msg));
  },
  bold(msg: string) {
    return pc.bold(msg);
  },
  cyan(msg: string) {
    return pc.cyan(msg);
  },
  green(msg: string) {
    return pc.green(msg);
  },
  yellow(msg: string) {
    return pc.yellow(msg);
  },
  red(msg: string) {
    return pc.red(msg);
  },
};
