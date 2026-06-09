import { useMemo, useState, type PointerEventHandler } from 'react';
import { type DisplayLanguage } from '../../../shared/mapRotation';
import { type RankedStatsData } from '../../../shared/rankedStats';

const MASTER_ICON_SRC = './ranked-icons/master.png';
const PREDATOR_ICON_SRC = './ranked-icons/predator.png';

type RankedStatsPageCopy = {
  rankedStatsLabel: string;
  masterPredator: string;
  predatorCutoff: string;
  playersUnit: string;
  rankPointsUnit: string;
  placeholderData: string;
  trackerPending: string;
  unavailable: string;
  loading: string;
};

type RankedStatsPageProps = {
  data: RankedStatsData | null;
  error: string | null;
  language: DisplayLanguage;
  isCompact: boolean;
  isActive: boolean;
  copy: RankedStatsPageCopy;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  onPointerMove?: PointerEventHandler<HTMLElement>;
  onPointerUp?: PointerEventHandler<HTMLElement>;
  onPointerCancel?: PointerEventHandler<HTMLElement>;
  onDoubleClick?: () => void;
};

export function RankedStatsPage({
  data,
  error,
  language,
  isCompact,
  isActive,
  copy,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick
}: RankedStatsPageProps): JSX.Element {
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const formatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const compactMasterPredatorLabel =
    isCompact && language === 'en' ? 'MAS/PRD' : copy.masterPredator;
  const compactPredatorCutoffLabel =
    isCompact && language === 'en' ? 'PRD Cutoff' : copy.predatorCutoff;
  const statusText = error
    ? copy.unavailable
    : data?.isPlaceholder
    ? `${copy.placeholderData} · ${copy.trackerPending}`
    : copy.trackerPending;

  return (
    <section
      className={`page-panel ranked-stats-page ${isCompact ? 'compact-layout' : 'full-layout'} ${isActive ? 'active' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
    >
      <div className="section-label ranked-stats-label">{copy.rankedStatsLabel}</div>
      <div className="ranked-stats-grid">
        <article className={`ranked-stat-card ${isCompact ? 'compact-inline' : ''}`}>
          {isCompact ? (
            <>
              <div className="ranked-stat-icons">
                <RankIcon src={MASTER_ICON_SRC} fallback="M" />
              </div>
              <div className="ranked-stat-inline-copy">
                <span>{compactMasterPredatorLabel}</span>
                <strong>
                  {data ? formatter.format(data.masterPlayers) : '--'} <small>{language === 'en' ? 'P' : copy.playersUnit}</small>
                </strong>
              </div>
            </>
          ) : (
            <>
              <div className="ranked-stat-card-top centered">
                <div className="ranked-stat-icons">
                  <RankIcon src={MASTER_ICON_SRC} fallback="M" />
                </div>
              </div>
              <div className="ranked-stat-primary centered">
                <span>{copy.masterPredator}</span>
                <strong>{data ? formatter.format(data.masterPlayers) : '--'}</strong>
                <span>{copy.playersUnit}</span>
              </div>
            </>
          )}
        </article>

        <article className={`ranked-stat-card accent ${isCompact ? 'compact-inline' : ''}`}>
          {isCompact ? (
            <>
              <div className="ranked-stat-icons single">
                <RankIcon src={PREDATOR_ICON_SRC} fallback="P" />
              </div>
              <div className="ranked-stat-inline-copy">
                <span>{compactPredatorCutoffLabel}</span>
                <strong>
                  {data ? formatter.format(data.predatorCutoffRp) : '--'} <small>{copy.rankPointsUnit}</small>
                </strong>
              </div>
            </>
          ) : (
            <>
              <div className="ranked-stat-card-top centered">
                <div className="ranked-stat-icons single">
                  <RankIcon src={PREDATOR_ICON_SRC} fallback="P" />
                </div>
              </div>
              <div className="ranked-stat-primary centered">
                <span>{copy.predatorCutoff}</span>
                <strong>{data ? formatter.format(data.predatorCutoffRp) : '--'}</strong>
                <span>{copy.rankPointsUnit}</span>
              </div>
            </>
          )}
        </article>
      </div>

    </section>
  );
}

function RankIcon({ src, fallback }: { src: string; fallback: string }): JSX.Element {
  const [hasError, setHasError] = useState(false);

  return (
    <span className={`rank-icon ${hasError ? 'fallback' : ''}`} aria-hidden="true">
      {!hasError && <img src={src} alt="" onError={() => setHasError(true)} />}
      {hasError && <span>{fallback}</span>}
    </span>
  );
}
