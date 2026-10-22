import React from 'react';
import { Sun, Moon, Zap, Smartphone, Terminal, History } from 'lucide-react';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  activeTab: 'tester' | 'curl' | 'emulator' | 'history';
  onSelectTab: (tab: 'tester' | 'curl' | 'emulator' | 'history') => void;
  historyCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  activeTab,
  onSelectTab,
  historyCount,
}) => {
  return (
    <header className="border-b pb-4 mb-6 border-[rgb(var(--border-primary))]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[rgb(var(--bg-accent))] flex items-center justify-center text-white shadow-sm">
              <Zap className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[rgb(var(--text-primary))]">
              Idempotency bypass tester
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[rgb(var(--text-secondary))] max-w-2xl">
            Fire requests at your live app with a fresh identity per call so dedupe and caching layers never collapse your test attempts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-8 h-8 rounded-md border border-[rgb(var(--border-primary))] flex items-center justify-center text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--tint-secondary))] transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <nav className="flex items-center gap-1 mt-5 border-b border-[rgb(var(--border-secondary))] -mb-4 overflow-x-auto">
        <button
          type="button"
          onClick={() => onSelectTab('tester')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'tester'
              ? 'border-[rgb(var(--bg-accent))] text-[rgb(var(--text-accent))]'
              : 'border-transparent text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Request Tester
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('curl')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'curl'
              ? 'border-[rgb(var(--bg-accent))] text-[rgb(var(--text-accent))]'
              : 'border-transparent text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          cURL Studio
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('emulator')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'emulator'
              ? 'border-[rgb(var(--bg-accent))] text-[rgb(var(--text-accent))]'
              : 'border-transparent text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          Android Emulator
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('history')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'history'
              ? 'border-[rgb(var(--bg-accent))] text-[rgb(var(--text-accent))]'
              : 'border-transparent text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Saved Captures
          {historyCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-[rgb(var(--tint-secondary))] text-[rgb(var(--text-secondary))]">
              {historyCount}
            </span>
          )}
        </button>
      </nav>
    </header>
  );
};
