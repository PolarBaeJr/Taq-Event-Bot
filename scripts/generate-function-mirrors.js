const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.resolve("src/index.js");
const outDir = path.resolve("src/functions");
const src = fs.readFileSync(sourcePath, "utf8");

const fnDeclaration = /^(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;
const matches = [];
for (let match; (match = fnDeclaration.exec(src)); ) {
  matches.push({
    name: match[2],
    start: match.index,
  });
}

function isRegexStart(previousSignificantChar) {
  if (!previousSignificantChar) {
    return true;
  }
  return /[=([{!,:;?&|+\-*%^~<>]/.test(previousSignificantChar);
}

function findFunctionEnd(startIndex) {
  const braceStart = src.indexOf("{", startIndex);
  if (braceStart === -1) {
    throw new Error(`No opening brace found for function at ${startIndex}`);
  }

  let i = braceStart;
  let depth = 0;
  let mode = "code";
  let previousSignificantChar = "";
  const templateExpressionDepthStack = [];

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1] || "";

    if (mode === "line_comment") {
      if (ch === "\n") {
        mode = "code";
      }
      i += 1;
      continue;
    }

    if (mode === "block_comment") {
      if (ch === "*" && next === "/") {
        mode = "code";
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (mode === "single_quote") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        mode = "code";
        previousSignificantChar = "x";
      }
      i += 1;
      continue;
    }

    if (mode === "double_quote") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "\"") {
        mode = "code";
        previousSignificantChar = "x";
      }
      i += 1;
      continue;
    }

    if (mode === "template") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "`") {
        mode = "code";
        previousSignificantChar = "x";
        i += 1;
        continue;
      }
      if (ch === "$" && next === "{") {
        depth += 1;
        templateExpressionDepthStack.push(1);
        mode = "code";
        i += 2;
        previousSignificantChar = "{";
        continue;
      }
      i += 1;
      continue;
    }

    if (mode === "regex") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "[") {
        mode = "regex_char_class";
        i += 1;
        continue;
      }
      if (ch === "/") {
        mode = "code";
        i += 1;
        while (/[a-z]/i.test(src[i] || "")) {
          i += 1;
        }
        previousSignificantChar = "x";
        continue;
      }
      i += 1;
      continue;
    }

    if (mode === "regex_char_class") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "]") {
        mode = "regex";
      }
      i += 1;
      continue;
    }

    // code mode
    if (ch === "/" && next === "/") {
      mode = "line_comment";
      i += 2;
      continue;
    }

    if (ch === "/" && next === "*") {
      mode = "block_comment";
      i += 2;
      continue;
    }

    if (ch === "'") {
      mode = "single_quote";
      i += 1;
      continue;
    }

    if (ch === "\"") {
      mode = "double_quote";
      i += 1;
      continue;
    }

    if (ch === "`") {
      mode = "template";
      i += 1;
      continue;
    }

    if (ch === "/") {
      if (isRegexStart(previousSignificantChar)) {
        mode = "regex";
        i += 1;
        continue;
      }
      previousSignificantChar = "/";
      i += 1;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      previousSignificantChar = "{";
      if (templateExpressionDepthStack.length > 0) {
        templateExpressionDepthStack[templateExpressionDepthStack.length - 1] += 1;
      }
      i += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (templateExpressionDepthStack.length > 0) {
        const idx = templateExpressionDepthStack.length - 1;
        templateExpressionDepthStack[idx] -= 1;
        if (templateExpressionDepthStack[idx] === 0) {
          templateExpressionDepthStack.pop();
          mode = "template";
        }
      }
      previousSignificantChar = "}";
      if (depth === 0) {
        return i + 1;
      }
      i += 1;
      continue;
    }

    if (!/\s/.test(ch)) {
      previousSignificantChar = ch;
    }
    i += 1;
  }

  throw new Error(`Unclosed function block starting at ${startIndex}`);
}

if (fs.existsSync(outDir)) {
  for (const file of fs.readdirSync(outDir)) {
    if (file.endsWith(".js") || file === "README.md") {
      fs.rmSync(path.join(outDir, file));
    }
  }
} else {
  fs.mkdirSync(outDir, { recursive: true });
}

const generated = [];
for (const match of matches) {
  const end = findFunctionEnd(match.start);
  const fnSource = src.slice(match.start, end).trimEnd();
  const filePath = path.join(outDir, `${match.name}.js`);
  const fileContent = [
    "/*",
    "  Auto-generated function mirror for easier reading/navigation.",
    "  Source of truth remains in src/index.js.",
    "*/",
    "",
    fnSource,
    "",
    `module.exports = ${match.name};`,
    "",
  ].join("\n");
  fs.writeFileSync(filePath, fileContent, "utf8");
  generated.push(match.name);
}

const readme = [
  "# Function Mirrors",
  "",
  "This directory is auto-generated from `src/index.js` and contains one top-level function per file for easier reading.",
  "",
  `Generated functions: ${generated.length}`,
  "",
  ...generated.map((name) => `- \`${name}.js\``),
  "",
].join("\n");
fs.writeFileSync(path.join(outDir, "README.md"), readme, "utf8");

console.log(`Generated ${generated.length} function files in src/functions.`);
