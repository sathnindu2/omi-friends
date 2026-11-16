import type { CSSProperties, KeyboardEvent } from 'react';
import { SUIT_IS_RED, SUIT_SYMBOL } from '../../../shared/rules';
import type { Card } from '../../../shared/types';
import { useSettings } from '../context/SettingsContext';

interface Props {
  card?: Card | null;
  faceDown?: boolean;
  /** CSS width, e.g. "64px" or "clamp(...)" */
  width?: string;
  compact?: boolean;
  selected?: boolean;
  playable?: boolean;
  dim?: boolean;
  winner?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  ariaLabel?: string;
}

const RANK_NAMES: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' };

export function PlayingCard({
  card,
  faceDown,
  width,
  compact,
  selected,
  playable,
  dim,
  winner,
  className = '',
  style,
  onClick,
  ariaLabel,
}: Props) {
  const { settings } = useSettings();
  const classes = [
    'card',
    compact && 'compact',
    selected && 'selected',
    playable && 'playable',
    dim && 'dim',
    winner && 'winner',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const s: CSSProperties = { ...(width ? ({ '--cw': width } as CSSProperties) : {}), ...style };

  if (faceDown || !card) {
    return (
      <div className={classes} style={s} aria-hidden="true">
        <div className="card-back" data-back={settings.cardBack} />
      </div>
    );
  }

  const sym = SUIT_SYMBOL[card.suit];
  const red = SUIT_IS_RED[card.suit];
  const court = card.rank === 'K' || card.rank === 'Q' || card.rank === 'J';
  const label = ariaLabel ?? `${RANK_NAMES[card.rank] ?? card.rank} of ${{ S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' }[card.suit]}`;
  const interactive = !!onClick;

  return (
    <div
      className={classes}
      style={s}
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      aria-pressed={interactive ? !!selected : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div className={`card-face ${red ? 'red' : ''}`}>
        <div className="card-corner tl">
          <span className="r">{card.rank}</span>
          <span className="s">{sym}</span>
        </div>
        {compact ? (
          <span className="compact-suit">{sym}</span>
        ) : court ? (
          <div className="card-court">
            <span className="letter">{card.rank}</span>
            <span className="mini">{sym}</span>
          </div>
        ) : (
          <div className={`card-center ${card.rank === 'A' ? 'ace' : ''}`}>{sym}</div>
        )}
        <div className="card-corner br">
          <span className="r">{card.rank}</span>
          <span className="s">{sym}</span>
        </div>
      </div>
    </div>
  );
}

export function SuitSymbol({ suit, className = '' }: { suit: Card['suit']; className?: string }) {
  return <span className={`${SUIT_IS_RED[suit] ? 'text-red-500' : 'text-white'} ${className}`}>{SUIT_SYMBOL[suit]}</span>;
}
