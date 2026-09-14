export interface TextSpan {
  text: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}

export const ANSI_COLOR_MAP: Record<number, string> = {
  30: "#1e293b",
  31: "#f43f5e", // red
  32: "#10b981", // green
  33: "#f59e0b", // yellow
  34: "#38bdf8", // blue
  35: "#c084fc", // magenta
  36: "#2dd4bf", // cyan
  37: "#f8fafc", // white
  90: "#94a3b8", // gray / dim
  91: "#fb7185",
  92: "#34d399",
  93: "#fcd34d",
  94: "#60a5fa",
  95: "#e879f9",
  96: "#67e8f9",
  97: "#ffffff",
};

export const ANSI_BG_MAP: Record<number, string> = {
  40: "#0f172a",
  41: "#881337",
  42: "#064e3b",
  43: "#78350f",
  44: "#0c4a6e",
  45: "#581c87",
  46: "#134e4a",
  47: "#e2e8f0",
  52: "#10b981",
  100: "#334155",
  101: "#9f1239",
  102: "#065f46",
  103: "#854d0e",
  104: "#075985",
  105: "#6b21a8",
  106: "#115e59",
  107: "#f1f5f9",
};

export function parseAnsi(input: string): TextSpan[] {
  // Strip non-SGR escape sequences (e.g. cursor hide \x1b[?25l, \x1b[2K, \x1b[1G)
  const cleaned = input.replace(/\x1b\[[?0-9;]*[a-zA-HJKSTfinu]/g, (match) => {
    if (match.endsWith("m")) return match;
    return "";
  });

  const regex = /\x1b\[([0-9;]*)m/g;
  const result: TextSpan[] = [];
  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let currentBgColor: string | undefined = undefined;
  let currentBold = false;
  let currentDim = false;
  let currentUnderline = false;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      const text = cleaned.substring(lastIndex, match.index);
      if (text) {
        result.push({
          text,
          color: currentColor,
          bgColor: currentBgColor,
          bold: currentBold,
          dim: currentDim,
          underline: currentUnderline,
        });
      }
    }
    lastIndex = regex.lastIndex;

    const codeStr = match[1];
    if (!codeStr || codeStr === "" || codeStr === "0") {
      currentColor = undefined;
      currentBgColor = undefined;
      currentBold = false;
      currentDim = false;
      currentUnderline = false;
    } else {
      const codes = codeStr.split(";").map(Number);
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (code === 0) {
          currentColor = undefined;
          currentBgColor = undefined;
          currentBold = false;
          currentDim = false;
          currentUnderline = false;
        } else if (code === 1) {
          currentBold = true;
        } else if (code === 2) {
          currentDim = true;
        } else if (code === 4) {
          currentUnderline = true;
        } else if (code === 22) {
          currentBold = false;
          currentDim = false;
        } else if (code === 24) {
          currentUnderline = false;
        } else if (code === 39) {
          currentColor = undefined;
        } else if (code === 49) {
          currentBgColor = undefined;
        } else if (ANSI_COLOR_MAP[code]) {
          currentColor = ANSI_COLOR_MAP[code];
        } else if (ANSI_BG_MAP[code]) {
          currentBgColor = ANSI_BG_MAP[code];
        }
      }
    }
  }

  if (lastIndex < cleaned.length) {
    result.push({
      text: cleaned.substring(lastIndex),
      color: currentColor,
      bgColor: currentBgColor,
      bold: currentBold,
      dim: currentDim,
      underline: currentUnderline,
    });
  }

  return result;
}
