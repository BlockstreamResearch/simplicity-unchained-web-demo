'use client';

import { useState, useRef, useEffect } from 'react';

interface Preset {
  fileName: string;
  label: string;
  description?: string;
}

interface PresetDropdownProps {
  presets: Preset[];
  onSelect: (simfContent: string, witContent?: string) => void;
  presetPath: string;
  disabled?: boolean;
}

export function PresetDropdown({ presets, onSelect, presetPath, disabled = false }: PresetDropdownProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handlePresetSelect = async (fileName: string) => {
    setIsDropdownOpen(false);
    setIsLoading(true);
    try {
      // Load the simf file
      const response = await fetch(`${presetPath}/${fileName}`);
      if (response.ok) {
        const simfContent = await response.text();
        
        // Try to load the corresponding wit file
        const baseName = fileName.replace('.simf', '');
        const witFileName = `${baseName}.wit`;
        let witContent: string | undefined = undefined;
        
        try {
          const witResponse = await fetch(`${presetPath}/${witFileName}`);
          if (witResponse.ok) {
            witContent = await witResponse.text();
          }
        } catch (witError) {
          // It's okay if wit file doesn't exist
          console.log(`No wit file found for ${fileName}`);
        }
        
        onSelect(simfContent, witContent);
      }
    } catch (error) {
      console.error('Error loading preset:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isDisabled = disabled || isLoading;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => !isDisabled && setIsDropdownOpen(!isDropdownOpen)}
        disabled={isDisabled}
        className="flex items-center gap-1 text-sm font-bold text-zinc-100 hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Presets
        <svg
          className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-zinc-950 border border-zinc-700 shadow-lg z-10">
          {presets.map((preset, index) => (
            <div
              key={preset.fileName}
              className={`relative ${
                index < presets.length - 1 ? 'border-b border-zinc-700' : ''
              }`}
            >
              <button
                onClick={() => handlePresetSelect(preset.fileName)}
                className="w-full px-4 py-2 text-left text-sm font-bold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors flex items-center justify-between"
              >
                <span>{index + 1}. {preset.label}</span>
                {preset.description && (
                  <div className="relative group" onClick={(e) => e.stopPropagation()}>
                    <svg
                      className="w-4 h-4 text-zinc-500 hover:text-zinc-300 cursor-help"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="absolute right-0 bottom-full pb-1 hidden group-hover:block z-20 pointer-events-auto">
                      <div className="w-80 p-3 bg-zinc-800 border border-zinc-600 text-xs text-zinc-300 rounded shadow-lg break-words">
                        {preset.description.split(' ').map((word, idx) => {
                          if (word.startsWith('http://') || word.startsWith('https://')) {
                            return (
                              <a
                                key={idx}
                                href={word}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {word}
                              </a>
                            );
                          }
                          return <span key={idx}>{word} </span>;
                        })}
                        <div className="absolute top-full right-4 -mt-1 border-4 border-transparent border-t-zinc-800"></div>
                      </div>
                    </div>
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
