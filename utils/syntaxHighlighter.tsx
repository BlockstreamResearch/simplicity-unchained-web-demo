export function highlightSimplicitySyntax(code: string) {
  if (!code) return null;

  const lines = code.split('\n');
  const allParts: (React.ReactElement | string)[] = [];

  lines.forEach((line, lineIndex) => {
    // Check if line contains a comment
    const commentIndex = line.indexOf('//');
    let lineToProcess = line;
    let commentPart = '';

    if (commentIndex !== -1) {
      lineToProcess = line.substring(0, commentIndex);
      commentPart = line.substring(commentIndex);
    }

    const parts = [];
    let currentIndex = 0;
    const regex = /(fn|main|jet|assert!|let|const|\(|\)|\{|\}|\[|\]|::|:|;|=|\b(?:u8|u16|u32|u64|u128|u256|i8|i16|i32|i64|i128|bool|str|Signature|Pubkey)\b|0x[0-9a-fA-F]+|0b[01]+|\b\d+\b|\b[A-Z_][A-Z0-9_]*\b)/g;
    let match;

    while ((match = regex.exec(lineToProcess)) !== null) {
      // Add text before match
      if (match.index > currentIndex) {
        const textBefore = lineToProcess.substring(currentIndex, match.index);
        parts.push(
          <span key={`${lineIndex}-text-${currentIndex}`} className="text-[#9cdcfe]">
            {textBefore}
          </span>
        );
      }

      // Add matched keyword/symbol
      const matched = match[0];
      let colorClass = '';

      if (matched === 'fn' || matched === 'assert!' || matched === 'let' || matched === 'const') {
        colorClass = 'text-[#e083cc]'; // Rust keyword.controlFlow pink
      } else if (matched === 'main') {
        colorClass = 'text-[#ffb067]'; // Rust function orange
      } else if (matched === 'jet') {
        colorClass = 'text-[#57adf3]'; // Rust struct/module blue
      } else if (['u8', 'u16', 'u32', 'u64', 'u128', 'u256', 'i8', 'i16', 'i32', 'i64', 'i128', 'bool', 'str', 'Signature', 'Pubkey'].includes(matched)) {
        colorClass = 'text-[#57adf3]'; // Rust builtin types blue
      } else if (/^0x[0-9a-fA-F]+$/.test(matched)) {
        colorClass = 'text-[#b5cea8]'; // Hex literal - light green
      } else if (/^0b[01]+$/.test(matched)) {
        colorClass = 'text-[#b5cea8]'; // Binary literal - light green
      } else if (/^\d+$/.test(matched)) {
        colorClass = 'text-[#b5cea8]'; // Decimal number - light green
      } else if (/^[A-Z_][A-Z0-9_]*$/.test(matched)) {
        colorClass = 'text-[#4fc1ff]'; // Constants - bright cyan
      } else if (matched === '::') {
        colorClass = 'text-[#fa5538]'; // Rust operator red-orange
        // Check if there's a word after ::
        const afterMatch = lineToProcess.substring(match.index + 2).match(/^(\w+)/);
        if (afterMatch) {
          parts.push(
            <span key={`${lineIndex}-symbol-${match.index}`} className={colorClass}>
              {matched}
            </span>
          );
          parts.push(
            <span key={`${lineIndex}-after-${match.index}`} className="text-[#ffb067]">
              {afterMatch[1]}
            </span>
          );
          currentIndex = match.index + 2 + afterMatch[1].length;
          regex.lastIndex = currentIndex;
          continue;
        }
      } else if ([';', ':', '='].includes(matched)) {
        colorClass = 'text-[#fa5538]'; // Rust operator red-orange
      } else if (['(', ')', '{', '}', '[', ']'].includes(matched)) {
        colorClass = 'text-[#ffd700]'; // Gold for punctuation
      }

      parts.push(
        <span key={`${lineIndex}-symbol-${match.index}`} className={colorClass}>
          {matched}
        </span>
      );

      currentIndex = match.index + matched.length;
    }

    // Add remaining text before comment
    if (currentIndex < lineToProcess.length) {
      parts.push(
        <span key={`${lineIndex}-text-${currentIndex}`} className="text-[#9cdcfe]">
          {lineToProcess.substring(currentIndex)}
        </span>
      );
    }

    // Add comment if exists
    if (commentPart) {
      parts.push(
        <span key={`${lineIndex}-comment`} className="text-[#9a9ca3]">
          {commentPart}
        </span>
      );
    }

    allParts.push(...parts);
    if (lineIndex < lines.length - 1) {
      allParts.push('\n');
    }
  });

  return allParts;
}
