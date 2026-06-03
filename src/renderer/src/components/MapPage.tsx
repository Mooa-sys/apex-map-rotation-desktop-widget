import type { ReactNode, PointerEventHandler } from 'react';
import { Clock3 } from 'lucide-react';
import { type DisplayLanguage, formatMapName, type RotationEntry } from '../../../shared/mapRotation';

type MapPageCopy = {
  currentMap: string;
  noMapData: string;
  loading: string;
  nextMap: string;
  waitingData: string;
  startsAt: (time: string) => string;
};

type MapPageProps = {
  currentMapClass: string;
  current?: RotationEntry;
  next?: RotationEntry;
  rotationError: string | null;
  language: DisplayLanguage;
  showExpandedChrome: boolean;
  isActive: boolean;
  copy: MapPageCopy;
  countdown: ReactNode;
  onCurrentPanelPointerDown: PointerEventHandler<HTMLElement>;
  onCurrentPanelPointerMove: PointerEventHandler<HTMLElement>;
  onCurrentPanelPointerUp: PointerEventHandler<HTMLElement>;
  onCurrentPanelPointerCancel: PointerEventHandler<HTMLElement>;
  onCurrentPanelDoubleClick: () => void;
};

export function MapPage({
  currentMapClass,
  current,
  next,
  rotationError,
  language,
  showExpandedChrome,
  isActive,
  copy,
  countdown,
  onCurrentPanelPointerDown,
  onCurrentPanelPointerMove,
  onCurrentPanelPointerUp,
  onCurrentPanelPointerCancel,
  onCurrentPanelDoubleClick
}: MapPageProps): JSX.Element {
  return (
    <section className={`page-panel map-page ${isActive ? 'active' : ''}`}>
      <section
        className={`current-panel ${currentMapClass}`}
        aria-live="polite"
        onPointerDown={onCurrentPanelPointerDown}
        onPointerMove={onCurrentPanelPointerMove}
        onPointerUp={onCurrentPanelPointerUp}
        onPointerCancel={onCurrentPanelPointerCancel}
        onDoubleClick={onCurrentPanelDoubleClick}
      >
        <div className="current-copy">
          <div className="section-label">{copy.currentMap}</div>
          <h1>{current ? formatMapName(current.map, language) : rotationError ? copy.noMapData : copy.loading}</h1>
          {showExpandedChrome && (
            <div className="time-row">
              <Clock3 size={15} />
              <span>{current ? `${current.start} - ${current.end}` : rotationError ?? '--:-- - --:--'}</span>
            </div>
          )}
        </div>
        {countdown}
      </section>

      {showExpandedChrome && (
        <section className="next-panel">
          <div>
            <div className="section-label">{copy.nextMap}</div>
            <strong>{next ? formatMapName(next.map, language) : copy.waitingData}</strong>
          </div>
          <span>{next ? copy.startsAt(next.start) : '--:--'}</span>
        </section>
      )}
    </section>
  );
}
