export function highlightBitcoinScript(code: string) {
  if (!code) return null;

  const parts: (React.ReactElement | string)[] = [];
  let currentIndex = 0;
  const regex = /(\bOP_[A-Z0-9_]+\b|0x[0-9a-fA-F]*)/g;
  let match;

  while ((match = regex.exec(code)) !== null) {
    // Add text before match
    if (match.index > currentIndex) {
      parts.push(
        <span key={`text-${currentIndex}`} className="text-amber-400">
          {code.substring(currentIndex, match.index)}
        </span>
      );
    }

    // Add matched keyword/value
    const matched = match[0];
    let colorClass = '';

    if (matched.startsWith('OP_')) {
      colorClass = 'text-[#ffb067]'; // OP_ commands - orange
    } else if (matched.startsWith('0x')) {
      colorClass = 'text-[#b5cea8]'; // Hex values - light green
    }

    parts.push(
      <span key={`symbol-${match.index}`} className={colorClass}>
        {matched}
      </span>
    );

    currentIndex = match.index + matched.length;
  }

  // Add remaining text
  if (currentIndex < code.length) {
    parts.push(
      <span key={`text-${currentIndex}`} className="text-amber-400">
        {code.substring(currentIndex)}
      </span>
    );
  }

  return parts;
}
