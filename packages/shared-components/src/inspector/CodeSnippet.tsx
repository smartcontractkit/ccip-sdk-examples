/**
 * Syntax-highlighted code display with copy button.
 * Uses CSS-only coloring via regex token classification.
 */

import { useMemo } from "react";
import { useCopyToClipboard } from "@ccip-examples/shared-utils/hooks";
import styles from "./CodeSnippet.module.css";

interface CodeSnippetProps {
  code: string;
}

interface Token {
  text: string;
  className: string;
}

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  const keywords = new Set([
    "const",
    "let",
    "var",
    "await",
    "async",
    "new",
    "return",
    "import",
    "from",
    "function",
  ]);
  // Simple tokenizer: strings, numbers, keywords, punctuation, identifiers
  const regex =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_]*n?\b)|(\/\/[^\n]*)|([(){}[\];,.:=<>!&|?+\-*/])|(\b[a-zA-Z_$][\w$]*\b)|(\s+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    const [full, str, num, comment, punct, ident, ws] = match;
    if (str) {
      tokens.push({ text: str, className: styles.string! });
    } else if (num) {
      tokens.push({ text: num, className: styles.number! });
    } else if (comment) {
      tokens.push({ text: comment, className: styles.comment! });
    } else if (punct) {
      tokens.push({ text: punct, className: styles.punct! });
    } else if (ident) {
      if (keywords.has(ident)) {
        tokens.push({ text: ident, className: styles.keyword! });
      } else {
        tokens.push({ text: ident, className: styles.ident! });
      }
    } else if (ws) {
      tokens.push({ text: ws, className: "" });
    } else {
      tokens.push({ text: full, className: "" });
    }
  }
  return tokens;
}

export function CodeSnippet({ code }: CodeSnippetProps) {
  const { copied, copy } = useCopyToClipboard();
  const tokens = useMemo(() => tokenize(code), [code]);

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.copyButton}
        onClick={() => copy(code)}
        title={copied ? "Copied!" : "Copy code"}
        aria-label={copied ? "Copied!" : "Copy code"}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className={styles.pre}>
        <code>
          {tokens.map((t, i) =>
            t.className ? (
              <span key={i} className={t.className}>
                {t.text}
              </span>
            ) : (
              t.text
            )
          )}
        </code>
      </pre>
    </div>
  );
}
