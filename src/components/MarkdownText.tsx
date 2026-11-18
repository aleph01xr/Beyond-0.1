import React from 'react';

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({ content, className = '' }) => {
  const parts = content.split(/(\*\*.*?\*\*)/g);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return (
            <strong key={index} className="font-bold text-white tracking-wide">
              {boldText}
            </strong>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};
