"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const SYMBOLS = ["\U0001f352", "\U0001f34b", "\U0001f34a", "\U0001f347", "\U0001f349", "\u2b50", "\U0001f48e", "\U0001f514"];
const SPIN_DURATION_MS = 1200;

function pickRandom(): string {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

interface ReelProps {
  value: string;
  spinning: boolean;
}

function Reel({ value, spinning }: ReelProps) {
  return (
    <div className={`slot-reel${spinning ? " slot-reel--spinning" : ""}`}>
      <span className="slot-reel-symbol">{spinning ? "\U0001f3b0" : value}</span>
    </div>
  );
}

interface SlotMachineProps {
  onClose: () => void;
}

export default function SlotMachine({ onClose }: SlotMachineProps) {
  const [reels, setReels] = useState<[string, string, string]>(["\U0001f352", "\U0001f34b", "\U0001f34a"]);
  const [spinning, setSpinning] = useState(false);
  const [spinCount, setSpinCount] = useState(0);
  const drawerRef = useRef<HTMLElement>(null);

  const isWin = !spinning && spinCount > 0 && reels[0] === reels[1] && reels[1] === reels[2];
  const isNearWin = !spinning && spinCount > 0 && !isWin && (
    reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function spin() {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => {
      setReels([pickRandom(), pickRandom(), pickRandom()]);
      setSpinning(false);
      setSpinCount((c) => c + 1);
    }, SPIN_DURATION_MS);
  }

  return (
    <div className="connections-overlay">
      <aside className="connections-drawer slot-machine-drawer" ref={drawerRef} role="dialog" aria-label="Slot Machine">
        <div className="connections-head">
          <strong>\U0001f3b0 Slot Machine</strong>
          <button
            type="button"
            className="connections-icon-btn"
            onClick={onClose}
            aria-label="Close slot machine"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="slot-machine-body">
          <div className="slot-machine-frame">
            <div className="slot-reels">
              <Reel value={reels[0]} spinning={spinning} />
              <Reel value={reels[1]} spinning={spinning} />
              <Reel value={reels[2]} spinning={spinning} />
            </div>
            <div className="slot-machine-lever-line" aria-hidden />
          </div>

          {isWin && (
            <div className="slot-result slot-result--win">
              \U0001f389 Jackpot! You win! \U0001f389
            </div>
          )}
          {isNearWin && (
            <div className="slot-result slot-result--near">
              So close! Try again…
            </div>
          )}
          {spinCount > 0 && !isWin && !isNearWin && (
            <div className="slot-result slot-result--miss">
              No match. Keep spinning!
            </div>
          )}

          <button
            type="button"
            className="slot-spin-btn"
            onClick={spin}
            disabled={spinning}
            aria-label="Spin the reels"
          >
            {spinning ? "Spinning\u2026" : "\U0001f3b0 SPIN"}
          </button>

          {spinCount > 0 && (
            <p className="slot-spin-count">Spins: {spinCount}</p>
          )}
        </div>
      </aside>
    </div>
  );
}
