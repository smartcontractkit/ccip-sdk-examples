/** @type {import("prettier").Config} */
export default {
  // Line width
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,

  // Syntax
  semi: true,
  singleQuote: false,
  quoteProps: "as-needed",
  jsxSingleQuote: false,

  // Trailing commas (ES5 for better git diffs)
  trailingComma: "es5",

  // Brackets and spacing
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",

  // Prose and markdown
  proseWrap: "preserve",

  // HTML whitespace
  htmlWhitespaceSensitivity: "css",

  // End of line
  endOfLine: "lf",

  // Embedded language formatting
  embeddedLanguageFormatting: "auto",

  // Single attribute per line in HTML/JSX
  singleAttributePerLine: false,
};
