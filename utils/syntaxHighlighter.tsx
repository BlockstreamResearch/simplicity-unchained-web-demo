export function highlightSimplicitySyntax(code: string) {
  if (!code) return null;

  const lines = code.split('\n');
  const allParts: (React.ReactElement | string)[] = [];
  let inMultiLineComment = false;

  lines.forEach((line, lineIndex) => {
    const parts = [];
    let currentIndex = 0;
    let lineToProcess = line;

    // Handle multi-line comments
    while (currentIndex < lineToProcess.length) {
      if (inMultiLineComment) {
        // Look for end of multi-line comment
        const endComment = lineToProcess.indexOf('*/', currentIndex);
        if (endComment !== -1) {
          // Found end of comment
          parts.push(
            <span key={`${lineIndex}-comment-${currentIndex}`} className="text-[#9a9ca3]">
              {lineToProcess.substring(currentIndex, endComment + 2)}
            </span>
          );
          currentIndex = endComment + 2;
          inMultiLineComment = false;
        } else {
          // Entire rest of line is comment
          parts.push(
            <span key={`${lineIndex}-comment-${currentIndex}`} className="text-[#9a9ca3]">
              {lineToProcess.substring(currentIndex)}
            </span>
          );
          currentIndex = lineToProcess.length;
          break;
        }
      } else {
        // Check for start of multi-line comment or single-line comment
        const startMultiComment = lineToProcess.indexOf('/*', currentIndex);
        const singleLineComment = lineToProcess.indexOf('//', currentIndex);
        
        // Determine which comment comes first
        let nextCommentPos = -1;
        let isMultiLine = false;
        
        if (startMultiComment !== -1 && (singleLineComment === -1 || startMultiComment < singleLineComment)) {
          nextCommentPos = startMultiComment;
          isMultiLine = true;
        } else if (singleLineComment !== -1) {
          nextCommentPos = singleLineComment;
          isMultiLine = false;
        }

        // Process code before comment
        const codeEnd = nextCommentPos !== -1 ? nextCommentPos : lineToProcess.length;
        const codePart = lineToProcess.substring(currentIndex, codeEnd);
        
        if (codePart) {
          // Process the code part
          const regex = /(fn|main|jet|assert!|let|const|match|Some|None|Left|Right|Either|Option|\(|\)|\{|\}|\[|\]|::|:|;|=|=>|,|\b(?:u8|u16|u32|u64|u128|u256|i8|i16|i32|i64|i128|bool|str|Signature|Pubkey|Height|Distance|Ctx8|ExplicitAsset)\b|0x[0-9a-fA-F]+|0b[01]+|\b\d+\b|\b[A-Z_][A-Z0-9_]*\b)/g;
          let match;
          let codeIndex = 0;

          while ((match = regex.exec(codePart)) !== null) {
            // Add text before match
            if (match.index > codeIndex) {
              const textBefore = codePart.substring(codeIndex, match.index);
              parts.push(
                <span key={`${lineIndex}-text-${currentIndex + codeIndex}`} className="text-[#9cdcfe]">
                  {textBefore}
                </span>
              );
            }

            const matched = match[0];
            let colorClass = '';

            if (matched === 'fn') {
              colorClass = 'text-[#e083cc]'; // Rust keyword.controlFlow pink
              parts.push(
                <span key={`${lineIndex}-fn-${match.index}`} className={colorClass}>
                  {matched}
                </span>
              );
              
              // Look for function name after 'fn'
              const afterFn = codePart.substring(match.index + 2).match(/^\s+(\w+)/);
              if (afterFn) {
                const whitespace = codePart.substring(match.index + 2, match.index + 2 + afterFn[0].length - afterFn[1].length);
                if (whitespace) {
                  parts.push(
                    <span key={`${lineIndex}-ws-${match.index}`} className="text-[#9cdcfe]">
                      {whitespace}
                    </span>
                  );
                }
                parts.push(
                  <span key={`${lineIndex}-fnname-${match.index}`} className="text-[#ffb067]">
                    {afterFn[1]}
                  </span>
                );
                codeIndex = match.index + 2 + afterFn[0].length;
                regex.lastIndex = codeIndex;
                continue;
              }
              codeIndex = match.index + matched.length;
              regex.lastIndex = codeIndex;
              continue;
            } else if (matched === 'assert!' || matched === 'let' || matched === 'const' || matched === 'match') {
              colorClass = 'text-[#e083cc]'; // Rust keyword.controlFlow pink
            } else if (matched === 'main' || matched === 'Some' || matched === 'None' || matched === 'Left' || matched === 'Right' || matched === 'Either' || matched === 'Option') {
              colorClass = 'text-[#ffb067]'; // Rust function/enum orange
            } else if (matched === 'jet') {
              colorClass = 'text-[#57adf3]'; // Rust struct/module blue
            } else if (['u8', 'u16', 'u32', 'u64', 'u128', 'u256', 'i8', 'i16', 'i32', 'i64', 'i128', 'bool', 'str', 'Signature', 'Pubkey', 'Height', 'Distance', 'Ctx8', 'ExplicitAsset'].includes(matched)) {
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
              const afterMatch = codePart.substring(match.index + 2).match(/^(\w+)/);
              if (afterMatch) {
                parts.push(
                  <span key={`${lineIndex}-symbol-${currentIndex + match.index}`} className={colorClass}>
                    {matched}
                  </span>
                );
                parts.push(
                  <span key={`${lineIndex}-after-${currentIndex + match.index}`} className="text-[#ffb067]">
                    {afterMatch[1]}
                  </span>
                );
                codeIndex = match.index + 2 + afterMatch[1].length;
                regex.lastIndex = codeIndex;
                continue;
              }
            } else if ([';', ':', '=', '=>', ','].includes(matched)) {
              colorClass = 'text-[#fa5538]'; // Rust operator red-orange
            } else if (['(', ')', '{', '}', '[', ']'].includes(matched)) {
              colorClass = 'text-[#ffd700]'; // Gold for punctuation
            }

            parts.push(
              <span key={`${lineIndex}-symbol-${currentIndex + match.index}`} className={colorClass}>
                {matched}
              </span>
            );

            codeIndex = match.index + matched.length;
          }

          // Add remaining code text
          if (codeIndex < codePart.length) {
            parts.push(
              <span key={`${lineIndex}-text-${currentIndex + codeIndex}`} className="text-[#9cdcfe]">
                {codePart.substring(codeIndex)}
              </span>
            );
          }
        }

        currentIndex = codeEnd;

        // Handle comments
        if (nextCommentPos !== -1) {
          if (isMultiLine) {
            // Start of multi-line comment
            const endComment = lineToProcess.indexOf('*/', currentIndex + 2);
            if (endComment !== -1) {
              // Comment ends on same line
              parts.push(
                <span key={`${lineIndex}-comment-${currentIndex}`} className="text-[#9a9ca3]">
                  {lineToProcess.substring(currentIndex, endComment + 2)}
                </span>
              );
              currentIndex = endComment + 2;
            } else {
              // Comment continues to next line
              parts.push(
                <span key={`${lineIndex}-comment-${currentIndex}`} className="text-[#9a9ca3]">
                  {lineToProcess.substring(currentIndex)}
                </span>
              );
              inMultiLineComment = true;
              currentIndex = lineToProcess.length;
            }
          } else {
            // Single-line comment
            parts.push(
              <span key={`${lineIndex}-comment-${currentIndex}`} className="text-[#9a9ca3]">
                {lineToProcess.substring(currentIndex)}
              </span>
            );
            currentIndex = lineToProcess.length;
          }
        }
      }
    }

    allParts.push(...parts);
    if (lineIndex < lines.length - 1) {
      allParts.push('\n');
    }
  });

  return allParts;
}
