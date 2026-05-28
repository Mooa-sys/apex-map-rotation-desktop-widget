import { AlertTriangle, Clock3, Minimize2, RefreshCw, Swords, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatCountdown,
  formatMapName,
  getLocalMapRotation,
  LOCAL_ROTATION_SLOT_MINUTES,
  minutesUntilRangeEnd,
  type RotationResponse
} from '../../shared/mapRotation';
import { getApexMapByName } from '../../shared/mapConfig';

const REFRESH_INTERVAL_MS = 60_000;

async function getMapRotation(force = false): Promise<RotationResponse> {
  if (window.apexMap) {
    return window.apexMap.getMapRotation(force);
  }

  return {
    data: getLocalMapRotation(new Date()),
    error: null,
    isStale: false
  };
}

export function App(): JSX.Element {
  const [rotation, setRotation] = useState<RotationResponse>({
    data: null,
    error: null,
    isStale: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isCompact, setIsCompact] = useState(false);
  const [clockAnimationKey, setClockAnimationKey] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const isDraggingRef = useRef(false);

  const loadRotation = useCallback(async (force = false, animateClock = false) => {
    if (animateClock) {
      setClockAnimationKey((key) => key + 1);
    }
    setIsLoading(true);
    try {
      const next = await getMapRotation(force);
      setRotation(next);
    } catch (error) {
      setRotation((previous) => ({
        data: previous.data,
        error: error instanceof Error ? error.message : '地图数据刷新失败',
        isStale: Boolean(previous.data)
      }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRotation(true, true);
    const refreshId = window.setInterval(() => loadRotation(false), REFRESH_INTERVAL_MS);
    const tickId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(tickId);
    };
  }, [loadRotation]);

  const countdown = useMemo(() => {
    if (!rotation.data) return rotation.error ? '获取失败' : '正在获取';
    const minutes = minutesUntilRangeEnd(now, rotation.data.current.start, rotation.data.current.end);
    return formatCountdown(minutes);
  }, [now, rotation.data]);

  const countdownMinutes = useMemo(() => {
    if (!rotation.data) return null;
    return minutesUntilRangeEnd(now, rotation.data.current.start, rotation.data.current.end);
  }, [now, rotation.data]);

  const current = rotation.data?.current;
  const next = rotation.data?.upcoming[0];
  const currentMapClass = current ? getCurrentMapClass(current.map) : '';
  const canControlWindow = Boolean(window.apexMap);
  const shellStyle = (isCompact
    ? {
        width: 300,
        height: 96
      }
    : undefined) satisfies CSSProperties | undefined;

  useEffect(() => {
    document.documentElement.classList.toggle('compact-mode', isCompact);
    document.body.classList.toggle('compact-mode', isCompact);
    window.apexMap?.setCompactMode(isCompact);
    const resizeId = window.setTimeout(() => {
      window.apexMap?.setCompactMode(isCompact);
    }, 120);

    return () => {
      window.clearTimeout(resizeId);
      document.documentElement.classList.remove('compact-mode');
      document.body.classList.remove('compact-mode');
    };
  }, [isCompact]);

  const toggleCompactMode = useCallback(() => {
    setIsCompact((previous) => !previous);
  }, []);

  const startCompactDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!isCompact || event.button !== 0) return;
    isDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    window.apexMap?.startDrag();
  }, [isCompact]);

  const moveCompactDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    window.apexMap?.moveDrag();
  }, []);

  const endCompactDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    window.apexMap?.endDrag();
  }, []);

  return (
    <main className={`widget-shell ${isCompact ? 'compact' : ''}`} style={shellStyle}>
      {!isCompact && <header className="titlebar">
        <div className="drag-region">
          <Swords aria-hidden="true" size={16} />
          <span>Apex 排位地图</span>
        </div>
        <div className="window-actions">
          <button
            aria-label="简洁模式"
            className="icon-button"
            onClick={toggleCompactMode}
          >
            <Minimize2 size={15} />
          </button>
          <button
            aria-label="关闭"
            className="icon-button close"
            disabled={!canControlWindow}
            onClick={() => window.apexMap?.close()}
          >
            <X size={15} />
          </button>
        </div>
      </header>}

      <section
        className={`current-panel ${currentMapClass}`}
        aria-live="polite"
        onPointerDown={startCompactDrag}
        onPointerMove={moveCompactDrag}
        onPointerUp={endCompactDrag}
        onPointerCancel={endCompactDrag}
        onDoubleClick={() => {
          if (isCompact) toggleCompactMode();
        }}
      >
        <div className="current-copy">
          <div className="section-label">当前排位地图</div>
          <h1>{current ? formatMapName(current.map) : rotation.error ? '暂无地图数据' : '加载中'}</h1>
          {!isCompact && <div className="time-row">
            <Clock3 size={15} />
            <span>{current ? `${current.start} - ${current.end}` : rotation.error ?? '--:-- - --:--'}</span>
          </div>}
        </div>
        <CountdownClock
          animationKey={clockAnimationKey}
          minutes={countdownMinutes}
          fallback={countdown}
          onDoubleClick={() => {
            if (isCompact) toggleCompactMode();
          }}
        />
      </section>

      {!isCompact && <section className="next-panel">
        <div>
          <div className="section-label">下一张</div>
          <strong>{next ? formatMapName(next.map) : '等待数据'}</strong>
        </div>
        <span>{next ? `${next.start} 开始` : '--:--'}</span>
      </section>}

      {!isCompact && <footer className="statusbar">
        <button aria-label="刷新地图数据" className="refresh-button" onClick={() => loadRotation(true, true)}>
          <RefreshCw className={isLoading ? 'spinning' : ''} size={14} />
        </button>
        <span>
          {rotation.data ? `更新于 ${new Date(rotation.data.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '尚未更新'}
        </span>
        {rotation.error && (
          <span className="error" title={rotation.error}>
            <AlertTriangle size={13} />
            {rotation.isStale ? '显示缓存' : '刷新失败'}
          </span>
        )}
      </footer>}
    </main>
  );
}

function CountdownClock({
  animationKey,
  minutes,
  fallback,
  onDoubleClick
}: {
  animationKey: number;
  minutes: number | null;
  fallback: string;
  onDoubleClick?: () => void;
}): JSX.Element {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const remainingRatio =
    minutes === null ? 0 : Math.max(0, Math.min(1, minutes / LOCAL_ROTATION_SLOT_MINUTES));
  const dashOffset = circumference * (1 - remainingRatio);
  const progressColor = getCountdownColor(remainingRatio);
  const progressStyle = {
    '--countdown-start-offset': '0px',
    '--countdown-target-offset': `${dashOffset}px`,
    '--countdown-start-color': '#35bf8d',
    '--countdown-target-color': progressColor
  } as CSSProperties;

  return (
    <div
      className="countdown-clock"
      aria-label={`地图切换倒计时：${fallback}`}
      onDoubleClick={onDoubleClick}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="countdown-track" cx="50" cy="50" r={radius} />
        <circle
          className="countdown-progress countdown-progress-animated"
          key={animationKey}
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={progressStyle}
        />
      </svg>
      <strong>{minutes === null ? '--' : formatCompactCountdown(minutes)}</strong>
    </div>
  );
}

function formatCompactCountdown(minutes: number): string {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

function getCountdownColor(ratio: number): string {
  if (ratio >= 0.5) {
    return mixColor('#f2d35d', '#35bf8d', (ratio - 0.5) / 0.5);
  }

  return mixColor('#d94a40', '#f2d35d', ratio / 0.5);
}

function mixColor(low: string, high: string, ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const lowRgb = hexToRgb(low);
  const highRgb = hexToRgb(high);
  const mixed = lowRgb.map((channel, index) =>
    Math.round(channel + (highRgb[index] - channel) * clamped)
  );
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function getCurrentMapClass(map: string): string {
  return getApexMapByName(map)?.backgroundClass ?? '';
}
