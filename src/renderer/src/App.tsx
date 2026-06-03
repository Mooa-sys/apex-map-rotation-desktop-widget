import { AlertTriangle, Clock3, Languages, Minimize2, MonitorUp, RefreshCw, Swords, X } from 'lucide-react';
import { flushSync } from 'react-dom';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  type DisplayLanguage,
  formatCountdown,
  formatMapName,
  getLocalMapRotation,
  LOCAL_ROTATION_SLOT_MINUTES,
  minutesUntilRangeEnd,
  type RotationResponse
} from '../../shared/mapRotation';
import { getApexMapByName } from '../../shared/mapConfig';

const REFRESH_INTERVAL_MS = 60_000;
const LANGUAGE_STORAGE_KEY = 'apex-map-language';
const FULL_WINDOW_WIDTH = 360;
const FULL_WINDOW_HEIGHT = 260;
const COMPACT_WINDOW_WIDTH = 300;
const COMPACT_WINDOW_HEIGHT = 96;

type LanguageCopy = {
  appTitle: string;
  compactMode: string;
  close: string;
  currentMap: string;
  noMapData: string;
  loading: string;
  loadFailed: string;
  fetching: string;
  nextMap: string;
  waitingData: string;
  startsAt: (time: string) => string;
  refreshMapData: string;
  updatedAt: (time: string) => string;
  notUpdated: string;
  showingCache: string;
  refreshFailed: string;
  refreshErrorMessage: string;
  switchLanguage: string;
  createDesktopShortcut: string;
  shortcutCreated: string;
  shortcutFailed: string;
  countdownAria: (value: string) => string;
  htmlLang: string;
  timeLocale: string;
};

const LANGUAGE_COPY: Record<DisplayLanguage, LanguageCopy> = {
  zh: {
    appTitle: 'Apex 排位地图',
    compactMode: '简洁模式',
    close: '关闭',
    currentMap: '当前排位地图',
    noMapData: '暂无地图数据',
    loading: '加载中',
    loadFailed: '获取失败',
    fetching: '正在获取',
    nextMap: '下一张',
    waitingData: '等待数据',
    startsAt: (time) => `${time} 开始`,
    refreshMapData: '刷新地图数据',
    updatedAt: (time) => `更新于 ${time}`,
    notUpdated: '尚未更新',
    showingCache: '显示缓存',
    refreshFailed: '刷新失败',
    refreshErrorMessage: '地图数据刷新失败',
    switchLanguage: 'Switch to English',
    createDesktopShortcut: '添加桌面快捷方式',
    shortcutCreated: '快捷方式已添加',
    shortcutFailed: '快捷方式添加失败',
    countdownAria: (value) => `地图切换倒计时：${value}`,
    htmlLang: 'zh-CN',
    timeLocale: 'zh-CN'
  },
  en: {
    appTitle: 'Apex Ranked Maps',
    compactMode: 'Compact mode',
    close: 'Close',
    currentMap: 'Current ranked map',
    noMapData: 'No map data',
    loading: 'Loading',
    loadFailed: 'Fetch failed',
    fetching: 'Fetching',
    nextMap: 'Next map',
    waitingData: 'Waiting for data',
    startsAt: (time) => `Starts at ${time}`,
    refreshMapData: 'Refresh map data',
    updatedAt: (time) => `Updated at ${time}`,
    notUpdated: 'Not updated yet',
    showingCache: 'Showing cache',
    refreshFailed: 'Refresh failed',
    refreshErrorMessage: 'Failed to refresh map data',
    switchLanguage: '切换到中文',
    createDesktopShortcut: 'Add desktop shortcut',
    shortcutCreated: 'Shortcut added',
    shortcutFailed: 'Shortcut failed',
    countdownAria: (value) => `Map rotation countdown: ${value}`,
    htmlLang: 'en',
    timeLocale: 'en-US'
  }
};

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
  const [language, setLanguage] = useState<DisplayLanguage>(() => getInitialLanguage());
  const [isLoading, setIsLoading] = useState(true);
  const [isCompact, setIsCompact] = useState(false);
  const [isShrinkingToCompact, setIsShrinkingToCompact] = useState(false);
  const [showExpandedChrome, setShowExpandedChrome] = useState(true);
  const [dockPeekEdge, setDockPeekEdge] = useState<'left' | 'right' | null>(null);
  const [clockAnimationKey, setClockAnimationKey] = useState(0);
  const [shortcutStatus, setShortcutStatus] = useState<'created' | 'failed' | null>(null);
  const [now, setNow] = useState(() => new Date());
  const isDraggingRef = useRef(false);
  const animatingRef = useRef(false);
  const lastAnimatedBoundsRef = useRef<{ width: number; height: number } | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const t = LANGUAGE_COPY[language];

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
        error: error instanceof Error ? error.message : t.refreshErrorMessage,
        isStale: Boolean(previous.data)
      }));
    } finally {
      setIsLoading(false);
    }
  }, [t.refreshErrorMessage]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = t.htmlLang;
    document.title = t.appTitle;
  }, [language, t.appTitle, t.htmlLang]);

  useEffect(() => window.apexMap?.onDockPeekChange(setDockPeekEdge), []);

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
    if (!rotation.data) return rotation.error ? t.loadFailed : t.fetching;
    const minutes = minutesUntilRangeEnd(now, rotation.data.current.start, rotation.data.current.end);
    return formatCountdown(minutes, language);
  }, [language, now, rotation.data, rotation.error, t.fetching, t.loadFailed]);

  const countdownMinutes = useMemo(() => {
    if (!rotation.data) return null;
    return minutesUntilRangeEnd(now, rotation.data.current.start, rotation.data.current.end);
  }, [now, rotation.data]);

  const current = rotation.data?.current;
  const next = rotation.data?.upcoming[0];
  const currentMapClass = current ? getCurrentMapClass(current.map) : '';
  const canControlWindow = Boolean(window.apexMap);
  const compactShellActive = isCompact || isShrinkingToCompact;
  const shellStyle = undefined satisfies CSSProperties | undefined;

  useEffect(() => {
    document.documentElement.classList.toggle('compact-mode', isCompact);
    document.body.classList.toggle('compact-mode', isCompact);

    return () => {
      document.documentElement.classList.remove('compact-mode');
      document.body.classList.remove('compact-mode');
    };
  }, [isCompact]);

  const toggleCompactMode = useCallback(() => {
    if (animatingRef.current || !shellRef.current) return;
    animatingRef.current = true;
    const goingCompact = !isCompact;
    const shell = shellRef.current;
    const expandedPanel = shell.querySelector('.current-panel') as HTMLElement | null;
    const expandedPanelRect = goingCompact ? expandedPanel?.getBoundingClientRect() ?? null : null;

    if (goingCompact) {
      flushSync(() => {
        setIsShrinkingToCompact(true);
        setShowExpandedChrome(false);
      });
    } else {
      flushSync(() => {
        setIsShrinkingToCompact(false);
        setIsCompact(false);
        setShowExpandedChrome(true);
      });
    }

    const titlebar = shell.querySelector('.titlebar') as HTMLElement | null;
    const currentPanel = shell.querySelector('.current-panel') as HTMLElement | null;
    const nextPanel = shell.querySelector('.next-panel') as HTMLElement | null;
    const statusbar = shell.querySelector('.statusbar') as HTMLElement | null;
    const countdownClock = shell.querySelector('.countdown-clock') as HTMLElement | null;
    const heading = shell.querySelector('.current-copy h1') as HTMLElement | null;
    const timeRow = shell.querySelector('.time-row') as HTMLElement | null;
    const initialWidth = goingCompact ? FULL_WINDOW_WIDTH : COMPACT_WINDOW_WIDTH;
    const initialHeight = goingCompact ? FULL_WINDOW_HEIGHT : COMPACT_WINDOW_HEIGHT;
    const targetWidth = goingCompact ? COMPACT_WINDOW_WIDTH : FULL_WINDOW_WIDTH;
    const targetHeight = goingCompact ? COMPACT_WINDOW_HEIGHT : FULL_WINDOW_HEIGHT;
    const sizeProxy = { width: initialWidth, height: initialHeight };
    const syncWindowBounds = (): void => {
      const width = Math.round(sizeProxy.width);
      const height = Math.round(sizeProxy.height);
      const previous = lastAnimatedBoundsRef.current;
      if (previous?.width === width && previous.height === height) return;
      lastAnimatedBoundsRef.current = { width, height };
      void window.apexMap?.animateBounds(width, height);
    };
    const cleanupAnimatedStyles = (): void => {
      const animatedElements = [
        shell,
        currentPanel,
        titlebar,
        nextPanel,
        statusbar,
        countdownClock,
        heading,
        timeRow
      ].filter(Boolean);

      gsap.set(animatedElements, {
        clearProps: 'transform,opacity,scale,x,y,width,height,paddingTop,paddingRight,paddingBottom,paddingLeft,rowGap,borderRadius,transformOrigin'
      });
    };

    const tl = gsap.timeline({
      onComplete: () => {
        flushSync(() => {
          setIsCompact(goingCompact);
          setIsShrinkingToCompact(false);
          setShowExpandedChrome(!goingCompact);
        });
        cleanupAnimatedStyles();
        lastAnimatedBoundsRef.current = { width: targetWidth, height: targetHeight };
        void window.apexMap?.setCompactMode(goingCompact);
        animatingRef.current = false;
      }
    });

    if (goingCompact) {
      gsap.set(shell, {
        width: initialWidth,
        height: initialHeight
      });
      if (currentPanel && expandedPanelRect) {
        const compactPanelRect = currentPanel.getBoundingClientRect();
        gsap.set(currentPanel, {
          width: expandedPanelRect.width,
          height: expandedPanelRect.height,
          x: expandedPanelRect.left - compactPanelRect.left,
          y: expandedPanelRect.top - compactPanelRect.top,
          transformOrigin: 'top left'
        });
      }

      tl.to(shell, {
        width: targetWidth,
        height: targetHeight,
        paddingTop: 6,
        paddingRight: 6,
        paddingBottom: 6,
        paddingLeft: 6,
        rowGap: 0,
        borderRadius: 18,
        duration: 0.34,
        ease: 'power3.inOut',
        overwrite: 'auto'
      }, 0);

      if (currentPanel) {
        tl.to(currentPanel, {
          x: 0,
          y: 0,
          width: COMPACT_WINDOW_WIDTH - 12,
          height: COMPACT_WINDOW_HEIGHT - 12,
          borderRadius: 16,
          transformOrigin: 'top left',
          duration: 0.34,
          ease: 'power3.inOut',
          overwrite: 'auto'
        }, 0);
      }

      if (heading) {
        tl.to(heading, {
          y: -2,
          scale: 0.98,
          transformOrigin: 'left center',
          duration: 0.2,
          ease: 'power2.inOut'
        }, 0.04);
      }

      if (countdownClock) {
        tl.to(countdownClock, {
          x: -2,
          y: 0,
          scale: 0.92,
          transformOrigin: 'center center',
          duration: 0.28,
          ease: 'power2.inOut'
        }, 0.02);
      }

      tl.to(sizeProxy, {
        width: targetWidth,
        height: targetHeight,
        duration: 0.34,
        ease: 'power3.inOut',
        overwrite: 'auto',
        onUpdate: syncWindowBounds
      }, 0);
    } else {
      gsap.set(shell, {
        paddingTop: 6,
        paddingRight: 6,
        paddingBottom: 6,
        paddingLeft: 6,
        rowGap: 0,
        borderRadius: 18
      });
      if (currentPanel) {
        gsap.set(currentPanel, {
          y: -18,
          scaleX: 0.965,
          scaleY: 0.8,
          borderRadius: 16,
          transformOrigin: 'center center'
        });
      }
      if (heading) gsap.set(heading, { y: -6, scale: 0.96, transformOrigin: 'left center' });
      if (countdownClock) {
        gsap.set(countdownClock, {
          x: -6,
          y: -2,
          scale: 0.82,
          transformOrigin: 'center center'
        });
      }

      if (titlebar) {
        gsap.set(titlebar, { y: -18, opacity: 0, display: '' });
      }
      if (nextPanel) {
        gsap.set(nextPanel, { y: 16, opacity: 0, display: '' });
      }
      if (statusbar) {
        gsap.set(statusbar, { y: 14, opacity: 0, display: '' });
      }
      if (timeRow) gsap.set(timeRow, { opacity: 0 });

      tl.to(shell, {
        paddingTop: 7,
        paddingRight: 7,
        paddingBottom: 7,
        paddingLeft: 7,
        rowGap: 8,
        borderRadius: 18,
        duration: 0.34,
        ease: 'power2.out',
        overwrite: 'auto'
      }, 0.02);

      if (currentPanel) {
        tl.to(currentPanel, {
          y: 0,
          scaleX: 1,
          scaleY: 1,
          borderRadius: 8,
          duration: 0.34,
          ease: 'power2.out',
          overwrite: 'auto'
        }, 0.02);
      }

      tl.to(sizeProxy, {
        width: targetWidth,
        height: targetHeight,
        duration: 0.34,
        ease: 'power3.out',
        overwrite: 'auto',
        onUpdate: syncWindowBounds
      }, 0.04);

      if (heading) tl.to(heading, { y: 0, scale: 1, duration: 0.24, ease: 'power2.out' }, 0.12);
      if (countdownClock) tl.to(countdownClock, { x: 0, y: 0, scale: 1, duration: 0.3, ease: 'power2.out' }, 0.12);

      if (titlebar) tl.to(titlebar, { y: 0, opacity: 1, duration: 0.2, ease: 'power2.out' }, 0.2);
      if (nextPanel) tl.to(nextPanel, { y: 0, opacity: 1, duration: 0.2, ease: 'power2.out' }, 0.23);
      if (statusbar) tl.to(statusbar, { y: 0, opacity: 1, duration: 0.18, ease: 'power2.out' }, 0.26);
      if (timeRow) tl.to(timeRow, { opacity: 1, duration: 0.18, ease: 'power2.out' }, 0.18);
    }
  }, [isCompact]);

  const toggleLanguage = useCallback(() => {
    setLanguage((previous) => (previous === 'zh' ? 'en' : 'zh'));
  }, []);

  const createDesktopShortcut = useCallback(async () => {
    if (!window.apexMap) return;

    const result = await window.apexMap.createDesktopShortcut();
    setShortcutStatus(result.success ? 'created' : 'failed');
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
    <main ref={shellRef} className={`widget-shell ${compactShellActive ? 'compact' : ''} ${dockPeekEdge ? `peek-${dockPeekEdge}` : ''}`} style={shellStyle}>
      {showExpandedChrome && <header className="titlebar">
        <div className="drag-region">
          <Swords aria-hidden="true" size={16} />
          <span>{t.appTitle}</span>
        </div>
        <div className="window-actions">
          <button
            aria-label={t.switchLanguage}
            className="icon-button"
            title={t.switchLanguage}
            onClick={toggleLanguage}
          >
            <Languages size={15} />
          </button>
          <button
            aria-label={t.createDesktopShortcut}
            className="icon-button"
            disabled={!canControlWindow}
            title={t.createDesktopShortcut}
            onClick={createDesktopShortcut}
          >
            <MonitorUp size={15} />
          </button>
          <button
            aria-label={t.compactMode}
            className="icon-button"
            title={t.compactMode}
            onClick={toggleCompactMode}
          >
            <Minimize2 size={15} />
          </button>
          <button
            aria-label={t.close}
            className="icon-button close"
            disabled={!canControlWindow}
            title={t.close}
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
          <div className="section-label">{t.currentMap}</div>
          <h1>{current ? formatMapName(current.map, language) : rotation.error ? t.noMapData : t.loading}</h1>
          {showExpandedChrome && <div className="time-row">
            <Clock3 size={15} />
            <span>{current ? `${current.start} - ${current.end}` : rotation.error ?? '--:-- - --:--'}</span>
          </div>}
        </div>
        <CountdownClock
          animationKey={clockAnimationKey}
          minutes={countdownMinutes}
          fallback={countdown}
          ariaLabel={t.countdownAria(countdown)}
          language={language}
          onDoubleClick={() => {
            if (isCompact) toggleCompactMode();
          }}
        />
      </section>

      {showExpandedChrome && <section className="next-panel">
        <div>
          <div className="section-label">{t.nextMap}</div>
          <strong>{next ? formatMapName(next.map, language) : t.waitingData}</strong>
        </div>
        <span>{next ? t.startsAt(next.start) : '--:--'}</span>
      </section>}

      {showExpandedChrome && <footer className="statusbar">
        <button
          aria-label={t.refreshMapData}
          className="refresh-button"
          title={t.refreshMapData}
          onClick={() => loadRotation(true, true)}
        >
          <RefreshCw className={isLoading ? 'spinning' : ''} size={14} />
        </button>
        <span>
          {shortcutStatus
            ? shortcutStatus === 'created'
              ? t.shortcutCreated
              : t.shortcutFailed
            : rotation.data
            ? t.updatedAt(new Date(rotation.data.fetchedAt).toLocaleTimeString(t.timeLocale, {
                hour: '2-digit',
                minute: '2-digit'
              }))
            : t.notUpdated}
        </span>
        {rotation.error && (
          <span className="error" title={rotation.error}>
            <AlertTriangle size={13} />
            {rotation.isStale ? t.showingCache : t.refreshFailed}
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
  ariaLabel,
  language,
  onDoubleClick
}: {
  animationKey: number;
  minutes: number | null;
  fallback: string;
  ariaLabel: string;
  language: DisplayLanguage;
  onDoubleClick?: () => void;
}): JSX.Element {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const remainingRatio =
    minutes === null ? 0 : Math.max(0, Math.min(1, minutes / LOCAL_ROTATION_SLOT_MINUTES));
  const dashOffset = circumference * (1 - remainingRatio);
  const startColor = '#35bf8d';
  const progressColor = getCountdownColor(remainingRatio);
  const startColorRgb = colorToRgbChannels(startColor);
  const targetColorRgb = colorToRgbChannels(progressColor);
  const progressStyle = {
    '--countdown-start-offset': '0px',
    '--countdown-target-offset': `${dashOffset}px`,
    '--countdown-start-color': startColor,
    '--countdown-target-color': progressColor,
    '--countdown-start-color-rgb': startColorRgb,
    '--countdown-target-color-rgb': targetColorRgb
  } as CSSProperties;

  return (
    <div
      className="countdown-clock"
      aria-label={ariaLabel}
      onDoubleClick={onDoubleClick}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="countdown-track" cx="50" cy="50" r={radius} />
        <circle
          className="countdown-glow countdown-glow-animated"
          key={`${animationKey}-glow`}
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={progressStyle}
        />
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
      <strong>{minutes === null ? '--' : formatCompactCountdown(minutes, language)}</strong>
    </div>
  );
}

function formatCompactCountdown(minutes: number, language: DisplayLanguage): string {
  if (minutes <= 0) return language === 'zh' ? '0分' : '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (language === 'zh') {
    if (hours <= 0) return `${mins}分`;
    return `${hours}时${mins.toString().padStart(2, '0')}分`;
  }
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

function colorToRgbChannels(color: string): string {
  if (color.startsWith('#')) {
    return hexToRgb(color).join(', ');
  }

  const matched = color.match(/\d+/g);
  if (matched && matched.length >= 3) {
    return matched.slice(0, 3).join(', ');
  }

  return '53, 191, 141';
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

function getInitialLanguage(): DisplayLanguage {
  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return storedLanguage === 'en' || storedLanguage === 'zh' ? storedLanguage : 'zh';
}
