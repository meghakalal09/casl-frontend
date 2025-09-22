import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type LatLng = { lat: number; lng: number };
type Player = { id: string; name: string; color: string };
type CountryLayer = L.Path & L.Polygon;
type TimeUnit = "days" | "months" | "years";
type OwnershipMap = Record<string, string[]>;
type LocalActor = { id: string; name: string; color: string; notes: string; position: LatLng };
type ExternalOrganization = {
  id: string;
  name: string;
  picture?: string; // Base64 data URL or regular URL
  pictureFile?: File; // Original file for reference
  position: LatLng;
  width: number;
  height: number;
  imageHeight?: number; // Height of the image area in pixels
  color: string;
  notes: string;
};
type TokenPool = { allowance: number; available: number };
type TrackParticipant = { id: string; name: string; color: string; kind: "player" | "actor" | "organization"; territory?: string };
type NationalInterestTrackProps = {
  levels: number;
  participants: TrackParticipant[];
  positions: Record<string, number>;
  onMove: (id: string, delta: number) => void;
};
type OverlayKey = "timer" | "interest";
type OverlayLayout = {
  x: number;
  y: number;
  width: number;
  height?: number;
  minimized: boolean;
  zIndex: number;
};
type DragState = {
  id: OverlayKey;
  mode: "drag" | "resize";
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};
type OverlayPanelProps = {
  id: OverlayKey;
  title: string;
  layout: OverlayLayout;
  minimized: boolean;
  headerExtra?: ReactNode;
  allowResize?: boolean;
  className?: string;
  showHeader?: boolean;
  interaction: { id: OverlayKey; mode: "drag" | "resize" } | null;
  onFocus: (id: OverlayKey) => void;
  onStartDrag: (id: OverlayKey, event: ReactPointerEvent<HTMLDivElement>) => void;
  onStartResize: (id: OverlayKey, event: ReactPointerEvent<HTMLDivElement>) => void;
  onToggleMinimize: (id: OverlayKey) => void;
  onReset?: (id: OverlayKey) => void;
  registerRef: (id: OverlayKey, node: HTMLDivElement | null) => void;
  children: ReactNode;
};

const NEUTRAL_COLOR = "#94a3b8";

const hexToRgb = (hex: string) => {
  const normalized = hex.replace(/[^0-9a-f]/gi, "");
  if (normalized.length !== 6) return null;
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) => {
      const clamped = Math.max(0, Math.min(255, Math.round(v)));
      return clamped.toString(16).padStart(2, "0");
    })
    .join("")}`;

const blendHexColors = (colors: string[]) => {
  if (!colors.length) return NEUTRAL_COLOR;
  const valid = colors
    .map((hex) => ({ hex, rgb: hexToRgb(hex) }))
    .filter((entry) => entry.rgb !== null) as { hex: string; rgb: { r: number; g: number; b: number } }[];
  if (!valid.length) return NEUTRAL_COLOR;
  const totals = valid.reduce(
    (acc, { rgb }) => {
      acc.r += rgb.r;
      acc.g += rgb.g;
      acc.b += rgb.b;
      return acc;
    },
    { r: 0, g: 0, b: 0 }
  );
  const count = valid.length;
  return rgbToHex(totals.r / count, totals.g / count, totals.b / count);
};

const getActorInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const initials = parts.slice(0, 2).map((segment) => segment[0]!.toUpperCase());
  return initials.join("");
};

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result && typeof event.target.result === 'string') {
        resolve(event.target.result);
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };
    reader.onerror = () => reject(new Error('File reading error'));
    reader.readAsDataURL(file);
  });
};

const isValidImageFile = (file: File): boolean => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB limit
  return validTypes.includes(file.type) && file.size <= maxSize;
};

const createActorIcon = (color: string, name: string, highlight: boolean) =>
  L.divIcon({
    className: "actor-marker",
    html: `<div class="actor-marker-bubble${highlight ? " actor-marker-bubble-active" : ""}" style="background:${color}"><span>${getActorInitials(name)}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    tooltipAnchor: [0, -20],
  });

function NationalInterestTrack({ levels, participants, positions, onMove }: NationalInterestTrackProps) {
  const maxLevel = Math.max(1, levels);
  const sorted = [...participants].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const buckets: Record<number, TrackParticipant[]> = {};
  for (let level = 0; level <= maxLevel; level += 1) {
    buckets[level] = [];
  }
  sorted.forEach((participant) => {
    const raw = positions[participant.id] ?? 1;
    const level = Math.max(0, Math.min(maxLevel, raw));
    buckets[level].push(participant);
  });
  const levelOrder = Array.from({ length: maxLevel + 1 }, (_, index) => index).reverse();
  return (
    <div className="national-interest-track">
      {levelOrder.map((level) => {
        const entries = buckets[level] ?? [];
        const isTop = level === maxLevel;
        const labelClasses = ["interest-tier-label"];
        if (isTop) {
          labelClasses.push("interest-tier-label-top");
        }
        if (level === 0) {
          labelClasses.push("interest-tier-label-start");
        }
        return (
          <div key={level} className="interest-tier">
            <div className={labelClasses.join(" ")}>
              {isTop && <span className="interest-tier-heading">National Interest</span>}
              <span className="interest-tier-number">{level === 0 ? "Start" : level}</span>
            </div>
            <div className="interest-tier-slots">
              {entries.map((participant) => {
                const currentLevel = Math.max(0, Math.min(maxLevel, positions[participant.id] ?? 1));
                const canLevelUp = currentLevel < maxLevel;
                const canLevelDown = currentLevel > 0;
                return (
                  <div key={participant.id} className="interest-participant">
                    <div className="interest-participant-avatar" style={{ background: participant.color }}>
                      {getActorInitials(participant.name)}
                    </div>
                    <div className="interest-participant-body">
                      <span className="interest-participant-name">{participant.name}</span>
                      {participant.kind === "actor" && participant.territory && (
                        <span className="interest-participant-subtext">{participant.territory}</span>
                      )}
                    </div>
                    <div className="interest-participant-controls">
                      <button
                        type="button"
                        className="interest-control"
                        onClick={() => onMove(participant.id, 1)}
                        disabled={!canLevelUp}
                        aria-label={`Advance ${participant.name}`}
                      >
                        ^
                      </button>
                      <button
                        type="button"
                        className="interest-control"
                        onClick={() => onMove(participant.id, -1)}
                        disabled={!canLevelDown}
                        aria-label={`Revert ${participant.name}`}
                      >
                        v
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OverlayPanel({
  id,
  title,
  layout,
  minimized,
  headerExtra,
  allowResize = true,
  className,
  showHeader = true,
  interaction,
  onFocus,
  onStartDrag,
  onStartResize,
  onToggleMinimize,
  onReset,
  registerRef,
  children,
}: OverlayPanelProps) {
  const isDragging = interaction?.id === id && interaction.mode === "drag";
  const isResizing = interaction?.id === id && interaction.mode === "resize";

  const handleContainerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(".overlay-action-button") || target.closest(".overlay-resize-handle")) {
      return;
    }
    onFocus(id);
  };

  return (
    <div
      ref={(node) => registerRef(id, node)}
      className={[
        "overlay-panel",
        className ?? "",
        minimized ? "overlay-panel-minimized" : "",
        isDragging ? "overlay-panel-dragging" : "",
        isResizing ? "overlay-panel-resizing" : "",
      ].filter(Boolean).join(" ")}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        ...(minimized ? {} : layout.height ? { height: layout.height } : {}),
        zIndex: layout.zIndex,
      }}
      onPointerDown={handleContainerPointerDown}
    >
      {showHeader && (
        <div className="overlay-header">
          <div className="overlay-handle" onPointerDown={(event) => onStartDrag(id, event)}>
            <span className="overlay-title">{title}</span>
          </div>
          {headerExtra && <div className="overlay-header-extra">{headerExtra}</div>}
          <div className="overlay-actions">
            {onReset && (
              <button
                type="button"
                className="overlay-action-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onFocus(id);
                  onReset(id);
                }}
                aria-label={`Reset ${title} layout`}
              >
                ↺
              </button>
            )}
            <button
              type="button"
              className="overlay-action-button"
              onClick={(event) => {
                event.stopPropagation();
                onFocus(id);
                onToggleMinimize(id);
              }}
              aria-label={minimized ? `Restore ${title}` : `Minimize ${title}`}
            >
              {minimized ? "▢" : "–"}
            </button>
          </div>
        </div>
      )}
      {!minimized && <div className="overlay-body">{children}</div>}
      {!minimized && allowResize && (
        <div
          className="overlay-resize-handle"
          onPointerDown={(event) => onStartResize(id, event)}
          role="separator"
          aria-label={`Resize ${title}`}
        >
          <span className="overlay-resize-icon">⋰</span>
        </div>
      )}
    </div>
  );
}

const PLAYER_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#14b8a6", "#f97316", "#f5f5f5"];

const PANDEMIC_OUTBREAK_LOCATIONS = ["China", "Japan", "South Korea", "Vietnam", "Thailand", "Singapore"];
const VACCINE_TRACK_MAX = 6;
const DEFAULT_PLAYER_TOKENS = 5;
const DEFAULT_COUNTRY_TOKENS = 3;
const DEFAULT_ACTOR_TOKENS = 3;
const DEFAULT_INTEREST_LEVEL_COUNT = 4;

const getDefaultOverlayLayouts = (): Record<OverlayKey, OverlayLayout> => {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;
  const timerWidth = 260;
  return {
    timer: { x: Math.max(24, (viewportWidth - timerWidth) / 2), y: 24, width: timerWidth, minimized: false, zIndex: 101 },
    interest: {
      x: Math.max(24, viewportWidth - 360),
      y: 120,
      width: 320,
      height: Math.min(480, viewportHeight - 200),
      minimized: false,
      zIndex: 102,
    },
  };
};

// Preset groups of countries
const PRESET_GROUPS: Record<string, string[]> = {
  NATO: ["United States of America", "United Kingdom", "France", "Germany", "Italy", "Canada", "Norway", "Poland"],
  ASEAN: ["Indonesia", "Malaysia", "Thailand", "Singapore", "Philippines", "Vietnam", "Myanmar", "Cambodia", "Laos", "Brunei"],
};

// Game phases
const PHASES = [
  "Negotiation Phase",
  "Action Phase",
  "Narrative Phase",
  "Adjudication Phase",
  "National Interest Phase"
];

export default function GameWorldMap() {
  const mapRef = useRef<L.Map | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const countriesLayerRef = useRef<L.GeoJSON | null>(null);
  const countryLayerIndex = useRef<Record<string, CountryLayer>>({});
  const actorMarkersRef = useRef<Record<string, L.Marker>>({});
  const orgBoxesRef = useRef<Record<string, HTMLDivElement>>({});
  const overlayRefs = useRef<Record<OverlayKey, HTMLDivElement | null>>({ timer: null, interest: null });
  const [overlayLayouts, setOverlayLayouts] = useState<Record<OverlayKey, OverlayLayout>>(getDefaultOverlayLayouts);
  const zCounterRef = useRef<number>(Math.max(...Object.values(overlayLayouts).map((layout) => layout.zIndex)));
  const dragStateRef = useRef<DragState | null>(null);
  const [activeInteraction, setActiveInteraction] = useState<{ id: OverlayKey; mode: "drag" | "resize" } | null>(null);
  const orgDragStateRef = useRef<{ id: string; mode: "drag" | "resize" | "image-resize"; startX: number; startY: number; originX: number; originY: number; startWidth: number; startHeight: number; startImageHeight: number } | null>(null);
  const [draggingOrg, setDraggingOrg] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [mapLocked, setMapLocked] = useState<boolean>(false);
  const lockedViewRef = useRef<{ center: L.LatLng; zoom: number } | null>(null);
  const [showTimerOverlay, setShowTimerOverlay] = useState<boolean>(true);
  const [showInterestOverlay, setShowInterestOverlay] = useState<boolean>(true);
  const [showRoundIndicator, setShowRoundIndicator] = useState<boolean>(true);
  const [showMapLockButton, setShowMapLockButton] = useState<boolean>(true);
  const [showPlayerAssignmentButton, setShowPlayerAssignmentButton] = useState<boolean>(true);
  const [showTitle, setShowTitle] = useState<boolean>(true);
  const [showPauseMenu, setShowPauseMenu] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showPlayerAssignment, setShowPlayerAssignment] = useState<boolean>(false);

  const setOverlayRef = useCallback((id: OverlayKey, node: HTMLDivElement | null) => {
    overlayRefs.current[id] = node;
  }, []);

  const bringOverlayToFront = useCallback((id: OverlayKey) => {
    setOverlayLayouts((prev) => {
      const current = prev[id];
      if (!current) return prev;
      const nextZ = zCounterRef.current + 1;
      zCounterRef.current = nextZ;
      if (current.zIndex === nextZ) return prev;
      return { ...prev, [id]: { ...current, zIndex: nextZ } };
    });
  }, []);




  const handlePointerMove = useCallback((event: PointerEvent) => {
    const state = dragStateRef.current;
    if (!state) return;
    event.preventDefault();
    const dx = event.clientX - state.originX;
    const dy = event.clientY - state.originY;
    if (state.mode === "drag") {
      setOverlayLayouts((prev) => {
        const current = prev[state.id];
        if (!current) return prev;
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;
        const currentWidth = current.width ?? state.startWidth;
        const currentHeight = current.height ?? state.startHeight;
        const maxX = viewportWidth - Math.max(120, currentWidth * 0.35);
        const maxY = viewportHeight - Math.max(120, currentHeight * 0.35);
        const nextX = Math.min(Math.max(-50, state.startX + dx), maxX);
        const nextY = Math.min(Math.max(-50, state.startY + dy), maxY);
        if (current.x === nextX && current.y === nextY) return prev;
        return { ...prev, [state.id]: { ...current, x: nextX, y: nextY } };
      });
    } else {
      const minWidth = 220;
      const minHeight = 140;
      const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
      const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;
      const width = Math.min(Math.max(minWidth, state.startWidth + dx), viewportWidth - 48);
      const height = Math.min(Math.max(minHeight, state.startHeight + dy), viewportHeight - 96);
      setOverlayLayouts((prev) => {
        const current = prev[state.id];
        if (!current) return prev;
        if (current.width === width && (current.height ?? height) === height) return prev;
        return { ...prev, [state.id]: { ...current, width, height } };
      });
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    dragStateRef.current = null;
    setActiveInteraction(null);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove]);

  const beginInteraction = useCallback(
    (id: OverlayKey, mode: "drag" | "resize", event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const layout = overlayLayouts[id];
      if (!layout) return;
      bringOverlayToFront(id);
      const node = overlayRefs.current[id];
      const rect = node?.getBoundingClientRect();
      const startWidth = layout.width ?? rect?.width ?? 260;
      const startHeight = layout.height ?? rect?.height ?? 180;
      dragStateRef.current = {
        id,
        mode,
        originX: event.clientX,
        originY: event.clientY,
        startX: layout.x,
        startY: layout.y,
        startWidth,
        startHeight,
      };
      setActiveInteraction({ id, mode });
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [overlayLayouts, bringOverlayToFront, handlePointerMove, handlePointerUp]
  );

  const focusOverlay = useCallback(
    (id: OverlayKey) => {
      bringOverlayToFront(id);
    },
    [bringOverlayToFront]
  );

  const startDrag = useCallback(
    (id: OverlayKey, event: ReactPointerEvent<HTMLDivElement>) => {
      beginInteraction(id, "drag", event);
    },
    [beginInteraction]
  );

  const startResize = useCallback(
    (id: OverlayKey, event: ReactPointerEvent<HTMLDivElement>) => {
      beginInteraction(id, "resize", event);
    },
    [beginInteraction]
  );

  const toggleOverlayMinimize = useCallback((id: OverlayKey) => {
    setOverlayLayouts((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, minimized: !current.minimized } };
    });
  }, []);


  const resetOverlayLayout = useCallback((id: OverlayKey) => {
    const defaults = getDefaultOverlayLayouts();
    const layout = defaults[id];
    if (!layout) return;
    setOverlayLayouts((prev) => {
      const nextZ = zCounterRef.current + 1;
      zCounterRef.current = nextZ;
      return { ...prev, [id]: { ...layout, zIndex: nextZ } };
    });
  }, []);

  const resetAllOverlayLayouts = useCallback(() => {
    const defaults = getDefaultOverlayLayouts();
    const maxZ = Math.max(...Object.values(defaults).map((layout) => layout.zIndex));
    zCounterRef.current = maxZ;
    setOverlayLayouts(defaults);
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Handle window resize to recenter timer and reposition overlays
  useEffect(() => {
    const handleResize = () => {
      // Avoid repositioning when dragging
      if (dragStateRef.current) return;
      
      const defaults = getDefaultOverlayLayouts();
      setOverlayLayouts((prev) => {
        const updated = { ...prev };
        
        // Always recenter timer on resize
        if (updated.timer) {
          updated.timer = {
            ...updated.timer,
            x: defaults.timer.x,
            y: defaults.timer.y,
          };
        }
        
        // Reposition interest overlay to stay within bounds
        if (updated.interest) {
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const maxX = viewportWidth - 360; // 360 is the overlay width
          const maxY = viewportHeight - 200; // Leave space at bottom
          
          updated.interest = {
            ...updated.interest,
            x: Math.max(24, Math.min(updated.interest.x, maxX)),
            y: Math.max(120, Math.min(updated.interest.y, maxY)),
            height: Math.min(updated.interest.height || 480, viewportHeight - 200),
          };
        }
        
        return updated;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Adjudicator sets up all players and assignments
  const [players, setPlayers] = useState<Player[]>([]);
  const [ownership, setOwnership] = useState<OwnershipMap>({});
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countryActors, setCountryActors] = useState<Record<string, LocalActor[]>>({});
  const [externalOrganizations, setExternalOrganizations] = useState<ExternalOrganization[]>([]);
  const [newActorName, setNewActorName] = useState<string>("");
  const [newActorNotes, setNewActorNotes] = useState<string>("");
  const [newActorColor, setNewActorColor] = useState<string>(PLAYER_COLORS[0]);
  const [newOrgName, setNewOrgName] = useState<string>("");
  const [newOrgNotes, setNewOrgNotes] = useState<string>("");
  const [newOrgColor, setNewOrgColor] = useState<string>(PLAYER_COLORS[0]);
  const [newOrgPicture, setNewOrgPicture] = useState<string>("");
  const [newOrgPictureFile, setNewOrgPictureFile] = useState<File | null>(null);
  const [playerTokens, setPlayerTokens] = useState<Record<string, TokenPool>>({});
  const [countryTokens, setCountryTokens] = useState<Record<string, TokenPool>>({});
  const [actorTokens, setActorTokens] = useState<Record<string, TokenPool>>({});

  const [discoveredAreas, setDiscoveredAreas] = useState<LatLng[]>([]);
  const [fogRadius, setFogRadius] = useState(110);
  const [fogOpacity, setFogOpacity] = useState(0.75);
  const [vaccineProgress, setVaccineProgress] = useState<number>(0);
  const [nationalInterests, setNationalInterests] = useState<Record<string, number>>({});
  const [interestLevelCount, setInterestLevelCount] = useState<number>(DEFAULT_INTEREST_LEVEL_COUNT);
  const [initialOutbreak, setInitialOutbreak] = useState<string | null>(null);
  const [selectedOutbreakCandidates, setSelectedOutbreakCandidates] = useState<string[]>(PANDEMIC_OUTBREAK_LOCATIONS);
  const [availableOutbreakCountries, setAvailableOutbreakCountries] = useState<string[]>(PANDEMIC_OUTBREAK_LOCATIONS);
  const [manualOutbreakChoice, setManualOutbreakChoice] = useState<string>("");
  const [outbreakRoll, setOutbreakRoll] = useState<number | null>(null);

  const participants = useMemo<TrackParticipant[]>(() => {
    const actorEntries: TrackParticipant[] = [];
    Object.entries(countryActors).forEach(([territory, actors]) => {
      actors.forEach((actor) => {
        actorEntries.push({
          id: actor.id,
          name: actor.name,
          color: actor.color,
          kind: "actor",
          territory,
        });
      });
    });
    const playerEntries: TrackParticipant[] = players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      kind: "player",
    }));
    const organizationEntries: TrackParticipant[] = externalOrganizations.map((org) => ({
      id: org.id,
      name: org.name,
      color: org.color,
      kind: "organization",
    }));
    return [...playerEntries, ...actorEntries, ...organizationEntries];
  }, [players, countryActors, externalOrganizations]);

  const getOwnersForCountry = (country: string) => ownership[country] ?? [];
  const findPlayerById = (pid: string) => players.find((p) => p.id === pid);
  
  const removePlayer = (playerId: string) => {
    setPlayers(prev => prev.filter(player => player.id !== playerId));
    // Clean up ownership
    setOwnership(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(country => {
        updated[country] = updated[country].filter(id => id !== playerId);
        if (updated[country].length === 0) {
          delete updated[country];
        }
      });
      return updated;
    });
    // Clean up tokens
    setPlayerTokens(prev => {
      const updated = { ...prev };
      delete updated[playerId];
      return updated;
    });
    // Clean up national interests
    setNationalInterests(prev => {
      const updated = { ...prev };
      delete updated[playerId];
      return updated;
    });
  };
  const getLocalActors = (country: string) => countryActors[country] ?? [];
  const ensurePlayerTokens = (pid: string) => {
    setPlayerTokens((prev) => {
      if (prev[pid]) return prev;
      return { ...prev, [pid]: { allowance: DEFAULT_PLAYER_TOKENS, available: DEFAULT_PLAYER_TOKENS } };
    });
  };
  const ensureCountryTokens = (country: string) => {
    setCountryTokens((prev) => {
      if (prev[country]) return prev;
      return { ...prev, [country]: { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS } };
    });
  };
  const ensureActorTokens = (actorId: string) => {
    setActorTokens((prev) => {
      if (prev[actorId]) return prev;
      return { ...prev, [actorId]: { allowance: DEFAULT_ACTOR_TOKENS, available: DEFAULT_ACTOR_TOKENS } };
    });
  };

  const replenishAllTokens = () => {
    setPlayerTokens((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([id, pool]) => [id, { ...pool, available: pool.allowance }])
      )
    );
    setCountryTokens((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([name, pool]) => [name, { ...pool, available: pool.allowance }])
      )
    );
    setActorTokens((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([id, pool]) => [id, { ...pool, available: pool.allowance }])
      )
    );
  };

  const normalizedAllowance = (value: number, fallback: number) => {
    if (Number.isNaN(value) || !Number.isFinite(value)) return fallback;
    return Math.max(0, value);
  };

  const setPlayerAllowance = (pid: string, allowance: number) => {
    setPlayerTokens((prev) => {
      const pool = prev[pid] ?? { allowance: DEFAULT_PLAYER_TOKENS, available: DEFAULT_PLAYER_TOKENS };
      const normalized = normalizedAllowance(allowance, DEFAULT_PLAYER_TOKENS);
      return {
        ...prev,
        [pid]: { allowance: normalized, available: Math.min(pool.available, normalized) },
      };
    });
  };

  const adjustPlayerTokens = (pid: string, delta: number) => {
    setPlayerTokens((prev) => {
      const pool = prev[pid];
      if (!pool) return prev;
      const next = Math.max(0, Math.min(pool.allowance, pool.available + delta));
      if (next === pool.available) return prev;
      return { ...prev, [pid]: { ...pool, available: next } };
    });
  };

  const setCountryAllowance = (country: string, allowance: number) => {
    setCountryTokens((prev) => {
      const pool = prev[country] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
      const normalized = normalizedAllowance(allowance, DEFAULT_COUNTRY_TOKENS);
      return {
        ...prev,
        [country]: { allowance: normalized, available: Math.min(pool.available, normalized) },
      };
    });
  };

  const adjustCountryTokens = (country: string, delta: number) => {
    setCountryTokens((prev) => {
      const pool = prev[country];
      if (!pool) return prev;
      const next = Math.max(0, Math.min(pool.allowance, pool.available + delta));
      if (next === pool.available) return prev;
      return { ...prev, [country]: { ...pool, available: next } };
    });
  };

  const setActorAllowance = (actorId: string, allowance: number) => {
    setActorTokens((prev) => {
      const pool = prev[actorId] ?? { allowance: DEFAULT_ACTOR_TOKENS, available: DEFAULT_ACTOR_TOKENS };
      const normalized = normalizedAllowance(allowance, DEFAULT_ACTOR_TOKENS);
      return {
        ...prev,
        [actorId]: { allowance: normalized, available: Math.min(pool.available, normalized) },
      };
    });
  };

  const adjustActorTokens = (actorId: string, delta: number) => {
    setActorTokens((prev) => {
      const pool = prev[actorId];
      if (!pool) return prev;
      const next = Math.max(0, Math.min(pool.allowance, pool.available + delta));
      if (next === pool.available) return prev;
      return { ...prev, [actorId]: { ...pool, available: next } };
    });
  };

  const adjustNationalInterest = (pid: string, delta: number) => {
    setNationalInterests((prev) => {
      const current = prev[pid] ?? 0;
      const maxLevel = Math.max(1, interestLevelCount);
      const next = Math.max(0, Math.min(maxLevel, current + delta));
      if (next === current) return prev;
      return { ...prev, [pid]: next };
    });
  };

  const chooseRandomOutbreakLocation = (pool: string[]) => {
    if (pool.length === 0) return null;
    const roll = Math.floor(Math.random() * pool.length);
    return { location: pool[roll], roll: roll + 1 };
  };

  const applyOutbreakLocation = (location: string | null, rollValue: number | null = null) => {
    if (!location) {
      setInitialOutbreak(null);
      setOutbreakRoll(null);
      return;
    }
    setInitialOutbreak(location);
    setOutbreakRoll(rollValue);
    setSelectedCountry(location);
    ensureCountryTokens(location);
  };

  const rollInitialOutbreak = () => {
    const candidatePool = selectedOutbreakCandidates.length ? selectedOutbreakCandidates : availableOutbreakCountries;
    const result = chooseRandomOutbreakLocation(candidatePool);
    applyOutbreakLocation(result?.location ?? null, result?.roll ?? null);
  };

  const setOutbreakManually = (location: string) => {
    if (!location) return;
    applyOutbreakLocation(location, null);
  };

  const adjustVaccineProgress = (delta: number) => {
    setVaccineProgress((prev) => {
      const next = Math.max(0, Math.min(VACCINE_TRACK_MAX, prev + delta));
      return next;
    });
  };

  // Timekeeping state
  const [gameDate, setGameDate] = useState<Date>(() => new Date("2030-01-01"));
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [timeAdvanceValue, setTimeAdvanceValue] = useState<number>(7);
  const [timeAdvanceUnit, setTimeAdvanceUnit] = useState<TimeUnit>("days");
  const [startDateInput, setStartDateInput] = useState<string>("2030-01-01");

  // Dice state
  const DIE_OPTIONS = [4, 6, 8, 10, 12, 20];
  const [dieSides, setDieSides] = useState<number>(6);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const rollDie = () => {
    const sides = Math.max(2, dieSides);
    const result = Math.floor(Math.random() * sides) + 1;
    setLastRoll(result);
  };

  // Timer state per phase
  const [phaseDurations, setPhaseDurations] = useState<number[]>([180, 120, 150, 90, 120]);
  const [seconds, setSeconds] = useState<number>(phaseDurations[0]);
  const [running, setRunning] = useState<boolean>(false);

  // Phase state
  const [phaseIndex, setPhaseIndex] = useState<number>(0);
  const adjustDate = (base: Date, amount: number, unit: TimeUnit) => {
    const next = new Date(base.getTime());
    if (unit === "days") {
      next.setDate(next.getDate() + amount);
    } else if (unit === "months") {
      next.setMonth(next.getMonth() + amount);
    } else {
      next.setFullYear(next.getFullYear() + amount);
    }
    return next;
  };

  const applyAdvanceAmount = () => {
    const value = Math.floor(timeAdvanceValue);
    return Number.isNaN(value) ? 1 : Math.max(1, value);
  };

  const advanceTime = () => {
    const amount = applyAdvanceAmount();
    setGameDate((prev) => adjustDate(prev, amount, timeAdvanceUnit));
    setRoundNumber((prev) => prev + 1);
    replenishAllTokens();
  };

  const rewindTime = () => {
    if (roundNumber <= 1) return;
    const amount = applyAdvanceAmount();
    setGameDate((prev) => adjustDate(prev, -amount, timeAdvanceUnit));
    setRoundNumber((prev) => Math.max(1, prev - 1));
    replenishAllTokens();
  };

  const nextPhase = () => {
    setPhaseIndex((i) => {
      const ni = (i + 1) % PHASES.length;
      setSeconds(phaseDurations[ni]);
      setRunning(false);
      if (ni === 0) {
        advanceTime();
      }
      return ni;
    });
  };
  const prevPhase = () => {
    setPhaseIndex((i) => {
      const pi = (i - 1 + PHASES.length) % PHASES.length;
      setSeconds(phaseDurations[pi]);
      setRunning(false);
      if (i === 0) {
        rewindTime();
      }
      return pi;
    });
  };

  const parseDateInput = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const applyStartDate = () => {
    const parsed = parseDateInput(startDateInput);
    if (parsed) {
      setGameDate(parsed);
      setRoundNumber(1);
    }
  };

  const formatGameDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const handleTimerToggle = useCallback(() => {
    setRunning((prev) => {
      if (prev) {
        return false;
      }
      setSeconds((prevSeconds) => {
        if (prevSeconds <= 0) {
          return phaseDurations[phaseIndex];
        }
        return prevSeconds;
      });
      return true;
    });
  }, [phaseDurations, phaseIndex]);

  const handleTimerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleTimerToggle();
      }
    },
    [handleTimerToggle]
  );

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const enforceLockedView = () => {
      if (!mapLocked || !lockedViewRef.current) return;
      const { center, zoom } = lockedViewRef.current;
      const current = map.getCenter();
      const currentZoom = map.getZoom();
      if (!current.equals(center) || currentZoom !== zoom) {
        map.setView(center, zoom, { animate: false });
      }
    };

    if (mapLocked) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      lockedViewRef.current = { center, zoom };
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.boxZoom?.disable();
      map.keyboard?.disable();
      map.touchZoom?.disable();
      (map as any).tap?.disable?.();
      map.on("moveend", enforceLockedView);
      map.on("zoomend", enforceLockedView);
      enforceLockedView();
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.boxZoom?.enable();
      map.keyboard?.enable();
      map.touchZoom?.enable();
      (map as any).tap?.enable?.();
      lockedViewRef.current = null;
      map.off("moveend", enforceLockedView);
      map.off("zoomend", enforceLockedView);
    }

    return () => {
      map.off("moveend", enforceLockedView);
      map.off("zoomend", enforceLockedView);
    };
  }, [mapLocked]);

  const resetTimer = () => {
    setRunning(false);
    setSeconds(phaseDurations[phaseIndex]);
  };

  const setDurationForPhase = (index: number, minutes: number, seconds: number) => {
    const total = Math.max(0, minutes * 60 + seconds);
    setPhaseDurations((prev) => {
      const copy = [...prev];
      copy[index] = total;
      return copy;
    });
    if (index === phaseIndex) {
      setSeconds(total);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Map boot (original: remote GeoJSON fetch)
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapElRef.current) return;
    
    // Define world bounds to prevent dragging beyond the map
    const worldBounds = L.latLngBounds(
      L.latLng(-85, -180), // Southwest corner
      L.latLng(85, 180)    // Northeast corner
    );
    
    const map = L.map(mapElRef.current, {
      zoomControl: false,
      worldCopyJump: false, // Disable world wrapping to prevent multiple copies
      minZoom: 2,
      maxZoom: 18,
      maxBounds: worldBounds, // Restrict panning to world bounds
      maxBoundsViscosity: 1.0, // Make bounds "hard" - prevents dragging beyond
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
      minZoom: 2,
      maxZoom: 18,
      bounds: worldBounds, // Restrict tiles to world bounds
      noWrap: true, // Prevent tile wrapping
    }).addTo(map);

    fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
      .then((res) => res.json())
      .then((geojson) => {
        const layer = L.geoJSON(geojson, {
          style: (f: any) => baseCountryStyle(f?.properties?.name),
          onEachFeature: (feature: any, lyr: CountryLayer) => {
            const name: string = feature.properties.name;
            countryLayerIndex.current[name] = lyr;
            lyr.on({
              click: () => setSelectedCountry(name),
              mouseover: () => onHover(lyr, true),
              mouseout: () => onHover(lyr, false)
            });
            lyr.bindTooltip(name, { sticky: true });
          },
        }).addTo(map);
        countriesLayerRef.current = layer as L.GeoJSON;
        
        // Mark map as ready after countries are loaded
        setMapReady(true);
      })
      .catch((error) => {
        console.error('Error loading countries GeoJSON:', error);
        // Still mark map as ready even if countries fail to load
        setMapReady(true);
      });

    // Set initial view to show the world properly
    const size = map.getSize();
    if (size.x > 0 && size.y > 0) {
      // Calculate appropriate zoom level to fit the world
      const worldBoundsForFit = L.latLngBounds(
        L.latLng(-60, -180), // Exclude extreme polar regions for better fit
        L.latLng(75, 180)
      );
      map.fitBounds(worldBoundsForFit, {
        padding: [20, 20], // Small padding
        maxZoom: 4 // Limit initial zoom to prevent being too zoomed in
      });
    } else {
      map.setView([20, 0], 2);
    }

    mapRef.current = map;
    
    // Fallback to set map ready after a short delay
    const readyTimeout = setTimeout(() => {
      setMapReady((prev) => {
        if (!prev) {
          console.log('Setting map ready via timeout fallback');
          return true;
        }
        return prev;
      });
    }, 2000);
    
    return () => {
      clearTimeout(readyTimeout);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const g = countriesLayerRef.current; if (!g) return;
    g.eachLayer((l: any) => { const n = l.feature?.properties?.name as string; l.setStyle(baseCountryStyle(n)); });
  }, [ownership, players, countryActors]);

  useEffect(() => {
    players.forEach((player) => {
      ensurePlayerTokens(player.id);
    });
  }, [players]);

  useEffect(() => {
    const countries = new Set<string>();
    players.forEach((player, index) => {
      if (player.name.trim()) {
        countries.add(player.name.trim());
      } else {
        countries.add(`Player ${index + 1}`);
      }
      const ownedCountries = Object.entries(ownership)
        .filter(([, owners]) => owners.includes(player.id))
        .map(([countryName]) => countryName);
      ownedCountries.forEach((countryName) => countries.add(countryName));
    });
    const derivedList = Array.from(countries).sort();
    setAvailableOutbreakCountries(derivedList.length ? derivedList : PANDEMIC_OUTBREAK_LOCATIONS);
    setSelectedOutbreakCandidates((prev) => {
      if (!prev.length) return derivedList;
      return prev.filter((country) => derivedList.includes(country));
    });
  }, [players, ownership]);


  useEffect(() => {
    Object.keys(ownership).forEach((country) => {
      ensureCountryTokens(country);
    });
  }, [ownership]);

  useEffect(() => {
    Object.values(countryActors).forEach((list) => {
      list.forEach((actor) => ensureActorTokens(actor.id));
    });
  }, [countryActors]);

  useEffect(() => {
    const ids = new Set(participants.map((entry) => entry.id));
    setNationalInterests((prev) => {
      const next: Record<string, number> = { ...prev };
      let changed = false;
      ids.forEach((id) => {
        if (next[id] === undefined) {
          next[id] = 0;
          changed = true;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [participants]);

  // Close player assignment when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showPlayerAssignment) {
        const target = event.target as HTMLElement;
        const playerAssignmentPanel = target.closest('.player-assignment-panel');
        const playerAssignmentToggle = target.closest('.player-assignment-toggle');
        
        if (!playerAssignmentPanel && !playerAssignmentToggle) {
          setShowPlayerAssignment(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPlayerAssignment]);

  useEffect(() => {
    setNationalInterests((prev) => {
      const maxLevel = Math.max(1, interestLevelCount);
      let changed = false;
      const next: Record<string, number> = {};
      Object.entries(prev).forEach(([id, level]) => {
        const bounded = Math.max(0, Math.min(maxLevel, level));
        next[id] = bounded;
        if (bounded !== level) {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [interestLevelCount]);


  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = actorMarkersRef.current;
    const activeIds = new Set<string>();

    Object.entries(countryActors).forEach(([country, actors]) => {
      actors.forEach((actor) => {
        const position = actor.position ?? getCountryCenter(country);
        if (!position) return;
        activeIds.add(actor.id);
        const isSelectedCountry = selectedCountry ? selectedCountry === country : true;
        const icon = createActorIcon(actor.color, actor.name, isSelectedCountry);
        let marker = markers[actor.id];
        if (!marker) {
          marker = L.marker([position.lat, position.lng], {
            draggable: true,
            bubblingMouseEvents: false,
            autoPan: true,
            icon,
          });
          const actorId = actor.id;
          const actorCountry = country;
          marker.on("dragend", (event) => {
            const target = event.target as L.Marker;
            const { lat, lng } = target.getLatLng();
            setCountryActors((prev) => {
              const list = prev[actorCountry] ?? [];
              const idx = list.findIndex((item) => item.id === actorId);
              if (idx === -1) return prev;
              const updatedList = [...list];
              updatedList[idx] = { ...updatedList[idx], position: { lat, lng } };
              return { ...prev, [actorCountry]: updatedList };
            });
          });
          marker.addTo(map);
          marker.bindTooltip(actor.name, { direction: "top", offset: [0, -28], opacity: 0.85 });
          markers[actor.id] = marker;
        } else {
          marker.setLatLng([position.lat, position.lng]);
          const tooltip = marker.getTooltip();
          if (tooltip) {
            tooltip.setContent(actor.name);
          }
        }
        marker.setIcon(icon);
        if (selectedCountry && selectedCountry !== country) {
          marker.setOpacity(0.5);
          marker.dragging?.disable();
        } else {
          marker.setOpacity(1);
          marker.dragging?.enable();
        }
      });
    });

    Object.entries(markers).forEach(([id, marker]) => {
      if (!activeIds.has(id)) {
        map.removeLayer(marker);
        delete markers[id];
      }
    });
  }, [countryActors, selectedCountry]);

  const baseCountryStyle = (name?: string) => {
    if (!name) {
      return { color: NEUTRAL_COLOR, weight: 1, fillColor: NEUTRAL_COLOR, fillOpacity: 0.1 } as L.PathOptions;
    }
    const ownerIds = getOwnersForCountry(name);
    const ownerPalette = ownerIds
      .map((id) => findPlayerById(id)?.color)
      .filter((color): color is string => Boolean(color));
    const actorPalette = getLocalActors(name)
      .map((actor) => actor.color)
      .filter((color) => Boolean(color));
    const palette = [...ownerPalette, ...actorPalette];
    const hasOwners = palette.length > 0;
    const blendedColor = palette.length === 1 ? palette[0] : blendHexColors(palette);
    const color = hasOwners ? blendedColor : NEUTRAL_COLOR;
    const fillOpacity = hasOwners ? (palette.length > 1 ? 0.45 : 0.35) : 0.1;
    return { color, weight: hasOwners ? 1.5 : 1, fillColor: color, fillOpacity } as L.PathOptions;
  };

  const onHover = (layer: CountryLayer, enter: boolean) => {
    if (!layer.setStyle) return;
    layer.setStyle({ weight: enter ? 2 : 1 });
  };

  const revealAt = (pos: LatLng) => setDiscoveredAreas((prev) => [...prev, pos]);

  const getCountryCenter = (country: string) => {
    const lyr = countryLayerIndex.current[country];
    if (lyr) {
      const center = lyr.getBounds().getCenter();
      return { lat: center.lat, lng: center.lng };
    }
    const map = mapRef.current;
    if (map) {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng };
    }
    return null;
  };

  const addPlayer = () => {
    const id = `p${players.length + 1}`;
    const newPlayer: Player = { id, name: `Player ${players.length + 1}`, color: PLAYER_COLORS[players.length % PLAYER_COLORS.length] };
    setPlayers((prev) => [...prev, newPlayer]);
    ensurePlayerTokens(id);
  };

  const renamePlayer = (pid: string, name: string) => {
    setPlayers(prev => prev.map(p => p.id === pid ? { ...p, name } : p));
  };

  const assignSelectedTo = (pid: string) => {
    if (!selectedCountry) return;
    setOwnership((prev) => {
      const current = prev[selectedCountry] ?? [];
      if (current.includes(pid)) return prev;
      return { ...prev, [selectedCountry]: [...current, pid] };
    });
    ensureCountryTokens(selectedCountry);
    // Update player name to country name
    setPlayers((prev) => prev.map((p) => p.id === pid ? { ...p, name: selectedCountry } : p));
    const lyr = countryLayerIndex.current[selectedCountry];
    if (lyr) {
      const c = lyr.getBounds().getCenter();
      revealAt({ lat: c.lat, lng: c.lng });
    }
  };

  const assignGroupToPlayer = (group: string, pid: string) => {
    const countries = PRESET_GROUPS[group] || [];
    const updated: OwnershipMap = { ...ownership };
    countries.forEach((country) => {
      const current = updated[country] ?? [];
      if (!current.includes(pid)) {
        updated[country] = [...current, pid];
      }
      ensureCountryTokens(country);
    });
    setOwnership(updated);
    // Update player name to group
    setPlayers((prev) => prev.map((p) => p.id === pid ? { ...p, name: group } : p));
  };

  // Assign a custom list of countries to a player
  const assignCountriesToPlayer = (countries: string[], pid: string, label?: string) => {
    const updated: OwnershipMap = { ...ownership };
    countries.forEach((country) => {
      if (!country) return;
      const current = updated[country] ?? [];
      if (!current.includes(pid)) {
        updated[country] = [...current, pid];
      }
      ensureCountryTokens(country);
    });
    setOwnership(updated);
    if (label) {
      setPlayers((prev) => prev.map((p) => p.id === pid ? { ...p, name: label } : p));
    }
  };

  const removePlayerFromCountry = (country: string, pid: string) => {
    setOwnership((prev) => {
      const current = prev[country] ?? [];
      if (!current.includes(pid)) return prev;
      const next = current.filter((id) => id !== pid);
      const updated: OwnershipMap = { ...prev };
      if (next.length) {
        updated[country] = next;
      } else {
        delete updated[country];
      }
      return updated;
    });
  };

  const clearCountryOwners = (country: string) => {
    setOwnership((prev) => {
      if (!prev[country]) return prev;
      const updated: OwnershipMap = { ...prev };
      delete updated[country];
      return updated;
    });
  };

  const addLocalActor = () => {
    if (!selectedCountry) return;
    const trimmedName = newActorName.trim();
    if (!trimmedName) return;
    const existing = countryActors[selectedCountry] ?? [];
    const colorToUse = newActorColor || PLAYER_COLORS[existing.length % PLAYER_COLORS.length] || NEUTRAL_COLOR;
    const initialPos = getCountryCenter(selectedCountry) ?? { lat: 0, lng: 0 };
    const actor: LocalActor = {
      id: `actor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      color: colorToUse,
      notes: newActorNotes.trim(),
      position: initialPos,
    };
    setCountryActors((prev) => {
      const current = prev[selectedCountry] ?? [];
      return {
        ...prev,
        [selectedCountry]: [...current, actor],
      };
    });
    ensureActorTokens(actor.id);
    const nextColor = PLAYER_COLORS[(existing.length + 1) % PLAYER_COLORS.length] || colorToUse;
    setNewActorName("");
    setNewActorNotes("");
    setNewActorColor(nextColor);
  };

  const updateLocalActor = (country: string, actorId: string, updates: Partial<LocalActor>) => {
    setCountryActors((prev) => {
      const list = prev[country] ?? [];
      if (!list.length) return prev;
      const updatedList = list.map((actor) => (actor.id === actorId ? { ...actor, ...updates } : actor));
      return { ...prev, [country]: updatedList };
    });
  };

  const removeLocalActor = (country: string, actorId: string) => {
    setCountryActors((prev) => {
      const list = prev[country] ?? [];
      if (!list.length) return prev;
      const updatedList = list.filter((actor) => actor.id !== actorId);
      if (!updatedList.length) {
        const copy = { ...prev };
        delete copy[country];
        return copy;
      }
      return { ...prev, [country]: updatedList };
    });
    setActorTokens((prev) => {
      if (!prev[actorId]) return prev;
      const copy = { ...prev };
      delete copy[actorId];
      return copy;
    });
  };

  const addExternalOrganization = async () => {
    const trimmedName = newOrgName.trim();
    if (!trimmedName) return;
    
    const map = mapRef.current;
    if (!map) return;
    
    const center = map.getCenter();
    let pictureData: string | undefined = undefined;
    
    // Handle file upload if present
    if (newOrgPictureFile) {
      if (!isValidImageFile(newOrgPictureFile)) {
        alert('Please select a valid image file (JPEG, PNG, GIF, WebP) under 5MB.');
        return;
      }
      
      try {
        pictureData = await readFileAsDataURL(newOrgPictureFile);
      } catch (error) {
        console.error('Error reading image file:', error);
        alert('Failed to read the selected image file.');
        return;
      }
    } else if (newOrgPicture.trim()) {
      // Fallback to URL if no file but URL provided
      pictureData = newOrgPicture.trim();
    }
    
    const org: ExternalOrganization = {
      id: `org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      picture: pictureData,
      pictureFile: newOrgPictureFile || undefined,
      position: { lat: center.lat, lng: center.lng },
      width: 200,
      height: 150,
      imageHeight: 60,
      color: newOrgColor || PLAYER_COLORS[0],
      notes: newOrgNotes.trim(),
    };
    
    setExternalOrganizations((prev) => [...prev, org]);
    setNewOrgName("");
    setNewOrgNotes("");
    setNewOrgPicture("");
    setNewOrgPictureFile(null);
    const nextColor = PLAYER_COLORS[(externalOrganizations.length + 1) % PLAYER_COLORS.length] || PLAYER_COLORS[0];
    setNewOrgColor(nextColor);
  };

  const updateExternalOrganization = (orgId: string, updates: Partial<ExternalOrganization>) => {
    try {
      setExternalOrganizations((prev) => {
        const orgExists = prev.some(org => org.id === orgId);
        if (!orgExists) {
          console.warn(`Attempted to update non-existent organization: ${orgId}`);
          return prev;
        }
        return prev.map((org) => (org.id === orgId ? { ...org, ...updates } : org));
      });
    } catch (error) {
      console.error('Error updating external organization:', error);
    }
  };

  const removeExternalOrganization = (orgId: string) => {
    setExternalOrganizations((prev) => prev.filter((org) => org.id !== orgId));
  };

  const handleOrgFileUpload = async (orgId: string, file: File) => {
    if (!isValidImageFile(file)) {
      alert('Please select a valid image file (JPEG, PNG, GIF, WebP) under 5MB.');
      return;
    }
    
    try {
      const pictureData = await readFileAsDataURL(file);
      updateExternalOrganization(orgId, {
        picture: pictureData,
        pictureFile: file,
      });
    } catch (error) {
      console.error('Error reading image file:', error);
      alert('Failed to read the selected image file.');
    }
  };

  // External organization drag/resize handlers
  const handleOrgPointerMove = useCallback((event: PointerEvent) => {
    const state = orgDragStateRef.current;
    const map = mapRef.current;
    if (!state || !map || !map.getContainer()) return;
    
    event.preventDefault();
    const dx = event.clientX - state.originX;
    const dy = event.clientY - state.originY;
    
    try {
      if (state.mode === "drag") {
        // Convert pixel movement to lat/lng movement
        const startPoint = map.containerPointToLatLng([state.originX, state.originY]);
        const endPoint = map.containerPointToLatLng([event.clientX, event.clientY]);
        const deltaLat = endPoint.lat - startPoint.lat;
        const deltaLng = endPoint.lng - startPoint.lng;
        
        updateExternalOrganization(state.id, {
          position: {
            lat: state.startY + deltaLat,
            lng: state.startX + deltaLng,
          },
        });
      } else if (state.mode === "resize") {
        const newWidth = Math.max(120, state.startWidth + dx);
        const newHeight = Math.max(80, state.startHeight + dy);
        updateExternalOrganization(state.id, {
        width: newWidth,
        height: newHeight,
      });
    } else if (state.mode === "image-resize") {
      const newImageHeight = Math.max(50, Math.min(200, state.startImageHeight + dy));
      updateExternalOrganization(state.id, {
        imageHeight: newImageHeight,
      });
    }
  } catch (error) {
    console.warn('Error during organization drag/resize:', error);
  }
  }, []);

  const handleOrgPointerUp = useCallback(() => {
    orgDragStateRef.current = null;
    setDraggingOrg(null);
    window.removeEventListener("pointermove", handleOrgPointerMove);
    window.removeEventListener("pointerup", handleOrgPointerUp);
  }, [handleOrgPointerMove]);

  const startOrgDrag = useCallback((orgId: string, event: React.PointerEvent) => {
    try {
      event.preventDefault();
      event.stopPropagation();
      
      const org = externalOrganizations.find(o => o.id === orgId);
      if (!org || !mapRef.current || !mapRef.current.getContainer()) return;
      
      orgDragStateRef.current = {
        id: orgId,
        mode: "drag",
        startX: org.position.lng,
        startY: org.position.lat,
        originX: event.clientX,
        originY: event.clientY,
        startWidth: org.width,
        startHeight: org.height,
        startImageHeight: org.imageHeight || 60,
      };
      
      setDraggingOrg(orgId);
      window.addEventListener("pointermove", handleOrgPointerMove);
      window.addEventListener("pointerup", handleOrgPointerUp);
    } catch (error) {
      console.warn('Error starting organization drag:', error);
    }
  }, [externalOrganizations, handleOrgPointerMove, handleOrgPointerUp]);

  const startOrgResize = useCallback((orgId: string, event: React.PointerEvent) => {
    try {
      event.preventDefault();
      event.stopPropagation();
      
      const org = externalOrganizations.find(o => o.id === orgId);
      if (!org || !mapRef.current || !mapRef.current.getContainer()) return;
      
      orgDragStateRef.current = {
        id: orgId,
        mode: "resize",
        startX: org.position.lng,
        startY: org.position.lat,
        originX: event.clientX,
        originY: event.clientY,
        startWidth: org.width,
        startHeight: org.height,
        startImageHeight: org.imageHeight || 60,
      };
      
      setDraggingOrg(orgId);
      window.addEventListener("pointermove", handleOrgPointerMove);
      window.addEventListener("pointerup", handleOrgPointerUp);
    } catch (error) {
      console.warn('Error starting organization resize:', error);
    }
  }, [externalOrganizations, handleOrgPointerMove, handleOrgPointerUp]);

  const startOrgImageResize = useCallback((orgId: string, event: React.PointerEvent) => {
    try {
      event.preventDefault();
      event.stopPropagation();
      
      const org = externalOrganizations.find(o => o.id === orgId);
      if (!org || !mapRef.current || !mapRef.current.getContainer()) return;
      
      orgDragStateRef.current = {
        id: orgId,
        mode: "image-resize",
        startX: org.position.lng,
        startY: org.position.lat,
        originX: event.clientX,
        originY: event.clientY,
        startWidth: org.width,
        startHeight: org.height,
        startImageHeight: org.imageHeight || 60,
      };
      
      setDraggingOrg(orgId);
      window.addEventListener("pointermove", handleOrgPointerMove);
      window.addEventListener("pointerup", handleOrgPointerUp);
    } catch (error) {
      console.warn('Error starting organization image resize:', error);
    }
  }, [externalOrganizations, handleOrgPointerMove, handleOrgPointerUp]);
  
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleOrgPointerMove);
      window.removeEventListener("pointerup", handleOrgPointerUp);
    };
  }, [handleOrgPointerMove, handleOrgPointerUp]);


  // ────────────────────────────────────────────────────────────────────────────
  // Title / Pause Overlay (ported from the updated file)
  // ────────────────────────────────────────────────────────────────────────────

  const startNewGame = () => {
    // Reset most game state
    setPlayers([]);
    setOwnership({});
    setSelectedCountry(null);
    setDiscoveredAreas([]);
    setLastRoll(null);
    setPhaseIndex(0);
    setSeconds(phaseDurations[0]);
    setRunning(false);
    setShowTitle(false);
    setShowPauseMenu(false);
    setRoundNumber(1);
    const parsed = parseDateInput(startDateInput);
    setGameDate(parsed ?? new Date());
    setCountryActors({});
    setExternalOrganizations([]);
    setNewActorName("");
    setNewActorNotes("");
    setNewActorColor(PLAYER_COLORS[0]);
    setNewOrgName("");
    setNewOrgNotes("");
    setNewOrgColor(PLAYER_COLORS[0]);
    setNewOrgPicture("");
    setNewOrgPictureFile(null);
    setPlayerTokens({});
    setCountryTokens({});
    setActorTokens({});
    setNationalInterests({});
    setInterestLevelCount(DEFAULT_INTEREST_LEVEL_COUNT);
    setVaccineProgress(0);
    setInitialOutbreak(null);
    setOutbreakRoll(null);
    setMapReady(false);
  };

  const selectedCountryActors = selectedCountry ? getLocalActors(selectedCountry) : [];
  const selectedCountryActorCount = selectedCountryActors.length;

  // Hotkeys: Enter to start, Escape to toggle pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showTitle && e.key === "Enter") {
        e.preventDefault();
        setShowTitle(false);
      } else if (!showTitle && e.key === "Escape") {
        e.preventDefault();
        setShowPauseMenu((v) => !v);
        setRunning(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showTitle]);


  useEffect(() => {
    if (!selectedCountry) {
      setNewActorName("");
      setNewActorNotes("");
      setNewActorColor(PLAYER_COLORS[0]);
      return;
    }
    ensureCountryTokens(selectedCountry);
    const nextColor = PLAYER_COLORS[selectedCountryActorCount % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];
    setNewActorName("");
    setNewActorNotes("");
    setNewActorColor(nextColor);
  }, [selectedCountry, selectedCountryActorCount]);

  useEffect(() => {
    return () => {
      const markers = actorMarkersRef.current;
      Object.keys(markers).forEach((id) => {
        markers[id].remove();
        delete markers[id];
      });
    };
  }, []);
  
  // Force re-render of organization boxes when map view changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getContainer()) return;
    
    const handleMapUpdate = () => {
      try {
        // Force re-render by updating a dummy state
        setDraggingOrg(prev => prev);
      } catch (error) {
        console.warn('Error during map update:', error);
      }
    };
    
    map.on('zoomend', handleMapUpdate);
    map.on('moveend', handleMapUpdate);
    
    return () => {
      if (map && map.off) {
        map.off('zoomend', handleMapUpdate);
        map.off('moveend', handleMapUpdate);
      }
    };
  }, []);

  const selectedOwnerDetails = selectedCountry
    ? getOwnersForCountry(selectedCountry).map((id) => {
        const player = findPlayerById(id);
        return {
          id,
          name: player?.name ?? id,
          color: player?.color ?? NEUTRAL_COLOR,
        };
      })
    : [];

  return (
    <div className="app-shell">
      <section className="app-map-area">
        <div ref={mapElRef} className="map-surface" />
        <canvas ref={fogCanvasRef} className="map-fog" />
        
        {/* External Organization Boxes */}
        {mapReady && mapRef.current && externalOrganizations.map((org) => {
          const map = mapRef.current;
          if (!map || !map.getContainer()) return null;
          
          try {
            const point = map.latLngToContainerPoint([org.position.lat, org.position.lng]);
            const isDragging = draggingOrg === org.id && orgDragStateRef.current?.mode === "drag";
            const isResizing = draggingOrg === org.id && orgDragStateRef.current?.mode === "resize";
            const isImageResizing = draggingOrg === org.id && orgDragStateRef.current?.mode === "image-resize";
            
            return (
              <div
                key={org.id}
                className={[
                  "external-org-box",
                  isDragging ? "dragging" : "",
                  isResizing ? "resizing" : "",
                  isImageResizing ? "resizing" : ""
                ].filter(Boolean).join(" ")}
                style={{
                  left: Math.max(0, point.x - org.width / 2),
                  top: Math.max(0, point.y - org.height / 2),
                  width: org.width,
                  height: org.height,
                  borderColor: org.color + "66", // Add transparency
                }}
                onPointerDown={(e) => {
                  const target = e.target as HTMLElement;
                  if (!target.closest('.external-org-resize-handle') && !target.closest('.external-org-remove')) {
                    startOrgDrag(org.id, e);
                  }
                }}
              >
                <div className="external-org-header" style={{ backgroundColor: org.color + "33" }}>
                  <span title={org.name}>{org.name}</span>
                  <button
                    className="external-org-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeExternalOrganization(org.id);
                    }}
                    title="Remove organization"
                  >
                    ✕
                  </button>
                </div>
              <div className="external-org-content">
                <div 
                  className="external-org-picture-container"
                  style={{ height: org.imageHeight || 60 }}
                >
                  {org.picture ? (
                    <img
                      src={org.picture}
                      alt={org.name}
                      className="external-org-picture"
                      draggable={false}
                      onError={(e) => {
                        // Hide image if it fails to load and show placeholder
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                        const container = img.parentElement;
                        if (container) {
                          container.innerHTML = '<div class="external-org-picture-placeholder">Image failed to load</div>';
                        }
                      }}
                    />
                  ) : (
                    <div className="external-org-picture-placeholder">
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div 
                    className="external-org-image-resize-handle"
                    title="Resize image height"
                    onPointerDown={(e) => startOrgImageResize(org.id, e)}
                  >⋮</div>
                </div>
                {org.notes && (
                  <div className="external-org-notes">{org.notes}</div>
                )}
              </div>
                <div
                  className="external-org-resize-handle"
                  onPointerDown={(e) => startOrgResize(org.id, e)}
                  title="Resize organization"
                />
              </div>
            );
          } catch (error) {
            console.warn('Error rendering organization box:', error);
            return null;
          }
        })}

        {showTimerOverlay && (
          <OverlayPanel
            id="timer"
            title="Phase Timer"
            layout={overlayLayouts.timer}
            minimized={overlayLayouts.timer.minimized}
            interaction={activeInteraction}
            onFocus={focusOverlay}
            onStartDrag={startDrag}
            onStartResize={startResize}
            onToggleMinimize={toggleOverlayMinimize}
            onReset={resetOverlayLayout}
            registerRef={setOverlayRef}
            allowResize={false}
            className="timer-panel"
            showHeader={false}
          >
          <div className="hud-timer">
            <div
              className={["hud-timer-value", seconds < 60 && running && seconds % 2 === 0 ? "hud-timer-value-alert" : ""].filter(Boolean).join(" ")}
              onClick={handleTimerToggle}
              onKeyDown={handleTimerKeyDown}
              role="button"
              tabIndex={0}
              aria-pressed={running}
              title={running ? "Pause timer" : "Start timer"}
            >
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </div>
            <div className="hud-timer-phase-row">
              <button
                type="button"
                className="hud-timer-phase-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  prevPhase();
                }}
              >
                ‹
              </button>
              <span className="hud-timer-subtext">{PHASES[phaseIndex]}</span>
              <button
                type="button"
                className="hud-timer-phase-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  nextPhase();
                }}
              >
                ›
              </button>
            </div>
            <div className="hud-timer-subtext">{formatGameDate(gameDate)}</div>
          </div>
          </OverlayPanel>
        )}

        {showInterestOverlay && (
          <OverlayPanel
            id="interest"
            title="National Interest Track"
            layout={overlayLayouts.interest}
            minimized={overlayLayouts.interest.minimized}
            interaction={activeInteraction}
            onFocus={focusOverlay}
            onStartDrag={startDrag}
            onStartResize={startResize}
            onToggleMinimize={toggleOverlayMinimize}
            onReset={resetOverlayLayout}
            registerRef={setOverlayRef}
            headerExtra={(
              <label className="overlay-level-control">
                Levels
                <input
                  type="number"
                  min={1}
                  value={interestLevelCount}
                  onChange={(event) => setInterestLevelCount(Math.max(1, parseInt(event.target.value || "1", 10)))}
                />
              </label>
            )}
          >
          <NationalInterestTrack
            levels={interestLevelCount}
            participants={participants}
            positions={nationalInterests}
            onMove={adjustNationalInterest}
          />
        </OverlayPanel>
        )}

        {/* Player Assignment Button */}
        {!showTitle && showPlayerAssignmentButton && (
          <button
            type="button"
            className="player-assignment-toggle"
            onClick={() => setShowPlayerAssignment((prev) => !prev)}
            aria-expanded={showPlayerAssignment}
          >
            👥 Player Assignment
          </button>
        )}

        {/* Player Assignment Panel */}
        {showPlayerAssignment && !showTitle && (
          <div className="player-assignment-panel">
            <div className="player-assignment-header">
              <h3 className="player-assignment-title">Player Assignment</h3>
              <button
                type="button"
                className="player-assignment-close"
                onClick={() => setShowPlayerAssignment(false)}
              >
                ×
              </button>
            </div>
            <div className="player-assignment-content">
              {/* Selected Country Display */}
              {selectedCountry && (
                <div className="player-assignment-section">
                  <div className="player-assignment-section-title">Selected Country</div>
                  <div className="selected-country-display">
                    <span className="selected-country-name">{selectedCountry}</span>
                  </div>
                </div>
              )}
              
              {/* External Organizations Section */}
              <div className="player-assignment-section">
                <div className="player-assignment-section-header">
                  <div className="player-assignment-section-title">External Organizations</div>
                </div>
                <div className="mb-3">
                  <div className="space-y-2">
                    <input
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="Organization name"
                      className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                    />
                    
                    {/* Image Upload Section */}
                    <div className="space-y-2">
                      <div className="text-xs opacity-80">Organization Picture:</div>
                      <div className="flex gap-2">
                        <input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setNewOrgPictureFile(file);
                              setNewOrgPicture(""); // Clear URL when file is selected
                            } else {
                              setNewOrgPictureFile(null);
                            }
                          }}
                          className="hidden"
                          id="org-file-input"
                        />
                        <label
                          htmlFor="org-file-input"
                          className={[
                            "flex-1 rounded px-2 py-1 text-xs cursor-pointer transition-colors text-center file-upload-label",
                            newOrgPictureFile ? "file-upload-selected" : "bg-white/10 border-white/10"
                          ].join(" ")}
                        >
                          {newOrgPictureFile ? `📁 ${newOrgPictureFile.name}` : '📁 Choose Image File'}
                        </label>
                        {newOrgPictureFile && (
                          <button
                            onClick={() => {
                              setNewOrgPictureFile(null);
                              const fileInput = document.getElementById('org-file-input') as HTMLInputElement;
                              if (fileInput) fileInput.value = '';
                            }}
                            className="button-ghost text-xs"
                            title="Clear selected file"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      
                      {/* Or URL Input */}
                      {!newOrgPictureFile && (
                        <>
                          <div className="text-xs opacity-60 text-center">or</div>
                          <input
                            value={newOrgPicture}
                            onChange={(e) => setNewOrgPicture(e.target.value)}
                            placeholder="Picture URL (optional)"
                            className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                          />
                        </>
                      )}
                    </div>
                    
                    <textarea
                      value={newOrgNotes}
                      onChange={(e) => setNewOrgNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      className="w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                    />
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={newOrgColor}
                        onChange={(e) => setNewOrgColor(e.target.value)}
                        className="w-8 h-8 rounded border border-white/10"
                      />
                      <button
                        onClick={addExternalOrganization}
                        disabled={!newOrgName.trim()}
                        className="button-primary text-xs flex-1"
                      >
                        Add External Organization
                      </button>
                    </div>
                  </div>
                  {externalOrganizations.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {externalOrganizations.map((org) => (
                        <div key={org.id} className="flex items-center gap-2 py-1 px-2 bg-white/5 rounded text-xs">
                          <span className="w-3 h-3 rounded-full" style={{ background: org.color }}></span>
                          <span className="flex-1">{org.name}</span>
                          <button
                            onClick={() => removeExternalOrganization(org.id)}
                            className="button-ghost text-xs"
                            title={`Remove ${org.name}`}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Players Section */}
              <div className="player-assignment-section">
                <div className="player-assignment-section-header">
                  <div className="player-assignment-section-title">Players</div>
                  <button onClick={addPlayer} className="button-primary text-xs">+ Add Player</button>
                </div>
                <div className="player-assignment-players">
                  {players.length === 0 ? (
                    <div className="player-assignment-empty">
                      <span className="text-xs opacity-70">No players added yet</span>
                    </div>
                  ) : (
                    players.map((p) => (
                      <div key={p.id} className="player-assignment-player">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-3 h-3 rounded-full" style={{ background: p.color }}></span>
                          <input
                            value={p.name}
                            onChange={(e) => renamePlayer(p.id, e.target.value)}
                            className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                            placeholder="Player name"
                          />
                          <button
                            onClick={() => removePlayer(p.id)}
                            className="button-ghost text-xs"
                            title={`Remove ${p.name}`}
                          >
                            ✕
                          </button>
                        </div>
                        
                        {/* Assignment Controls for each player */}
                        <div className="player-assignment-controls">
                          <button
                            onClick={() => assignSelectedTo(p.id)}
                            disabled={!selectedCountry}
                            className="button-soft text-xs"
                            title={selectedCountry ? `Assign ${selectedCountry} to ${p.name}` : "Select a country first"}
                          >
                            Assign Selected
                          </button>
                          {Object.keys(PRESET_GROUPS).map((group) => (
                            <button
                              key={group}
                              onClick={() => assignGroupToPlayer(group, p.id)}
                              className="button-ghost text-xs"
                              title={`Assign ${group} countries to ${p.name}`}
                            >
                              {group}
                            </button>
                          ))}
                        </div>
                        
                        {/* Bulk Assignment */}
                        <div className="bulk-assignment">
                          <textarea
                            id={`player-assignment-bulk-${p.id}`}
                            placeholder="Countries separated by commas or new lines"
                            className="w-full h-16 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs mb-1"
                          />
                          <div className="flex gap-2">
                            <input
                              id={`player-assignment-label-${p.id}`}
                              type="text"
                              placeholder="Optional: rename player"
                              className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                            />
                            <button
                              onClick={() => {
                                const textarea = document.getElementById(`player-assignment-bulk-${p.id}`) as HTMLTextAreaElement;
                                const labelInput = document.getElementById(`player-assignment-label-${p.id}`) as HTMLInputElement;
                                if (!textarea) return;
                                
                                const countries = textarea.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
                                if (countries.length) {
                                  assignCountriesToPlayer(countries, p.id);
                                  if (labelInput.value.trim()) {
                                    renamePlayer(p.id, labelInput.value.trim());
                                  }
                                  textarea.value = "";
                                  labelInput.value = "";
                                }
                              }}
                              className="button-soft text-xs"
                            >
                              Assign List
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {showMapLockButton && (
          <button
            type="button"
            className="map-lock-toggle"
            onClick={() => setMapLocked((prev) => !prev)}
            aria-pressed={mapLocked}
          >
            {mapLocked ? "Unlock Map" : "Lock Map"}
          </button>
        )}

        {!showTitle && showRoundIndicator && (
          <div className="hud-round">
            <button
              type="button"
              className="hud-round-btn"
              onClick={rewindTime}
              disabled={roundNumber <= 1}
            >
              ‹
            </button>
            <div className="hud-round-label">Round {roundNumber}</div>
            <button type="button" className="hud-round-btn" onClick={advanceTime}>
              ›
            </button>
          </div>
        )}

        {/* ── Title Screen Overlay ───────────────────────────────────────────── */}
        {showTitle && (
          <div className="title-overlay">
            <div className="overlay-card">
              <div className="space-y-1 text-center">
                <h2 className="text-3xl font-bold tracking-tight">Geopolitics: Adjudicator</h2>
                <p className="text-sm opacity-80">A world-map sandbox for team-based grand strategy sessions.</p>
              </div>

              <div className="grid gap-2">
                <button
                  onClick={() => setShowTitle(false)}
                  className="h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 shadow"
                >Start</button>
                <button
                  onClick={startNewGame}
                  className="h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10"
                >New Game</button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10"
                >Settings</button>
              </div>

              <div className="grid-columns-two text-xs">
                <div className="rounded-xl border border-white/10 p-3" style={{ background: "rgba(0,0,0,0.2)", borderRadius: "16px" }}>
                  <div className="font-semibold mb-1">Controls</div>
                  <ul className="space-y-1 opacity-80 list-disc list-inside">
                    <li>Click a country to select.</li>
                    <li>Assign players via Pause Menu → Settings.</li>
                    <li>Esc opens Pause Menu.</li>
                    <li>Enter closes this screen.</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-white/10 p-3" style={{ background: "rgba(0,0,0,0.2)", borderRadius: "16px" }}>
                  <div className="font-semibold mb-1">Session Tips</div>
                  <ul className="space-y-1 opacity-80 list-disc list-inside">
                    <li>Rename players to faction/country names.</li>
                    <li>Tune phase timers before starting.</li>
                  </ul>
                </div>
              </div>

              <div className="text-center text-xs opacity-70">v0.3</div>
            </div>
          </div>
        )}

        {/* ── Pause Menu Overlay ─────────────────────────────────────────────── */}
        {showPauseMenu && !showTitle && (
          <div className="pause-overlay">
            <div className="overlay-card" style={{ width: "min(420px, 90%)" }}>
              <div className="text-lg font-bold">Paused</div>
              <div className="grid gap-2">
                <button onClick={() => setShowPauseMenu(false)} className="h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10">Resume</button>
                <button onClick={startNewGame} className="h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10">Start New Game</button>
                <button onClick={() => setShowSettings(true)} className="h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10">Settings</button>
                <button onClick={() => setShowTitle(true)} className="h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10">Back to Title</button>
              </div>
              <div className="text-xs opacity-70">Tip: You can open this menu anytime with <span className="font-semibold">Esc</span>.</div>
            </div>
          </div>
        )}

        {/* ── Settings Modal Overlay ─────────────────────────────────────────────── */}
        {showSettings && (() => {
          console.log('Settings modal should be showing now!');
          return (
            <div className="pause-overlay">
              <div className="overlay-card" style={{ width: "min(800px, 95%)", maxHeight: "90vh", overflow: "auto" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Settings</h2>
                <button 
                  onClick={() => setShowSettings(false)} 
                  className="text-2xl hover:opacity-70"
                >×</button>
              </div>
              
              {/* Debug test content */}
              <div style={{ color: 'white', padding: '20px', background: 'red' }}>
                TEST CONTENT - If you can see this, the modal is rendering!
              </div>
              
              {/* Adjudicator Control Content */}
              <div className="space-y-6">
                {/* Phase tracker */}
                <section className="border border-white/10 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">Phase Control</h3>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm opacity-80">Current Phase:</span>
                    <span className="font-medium">{PHASES[phaseIndex]}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={prevPhase} className="button-soft">Previous</button>
                    <button onClick={nextPhase} className="button-soft">Next</button>
                  </div>
                </section>

                {/* Players */}
                <section className="border border-white/10 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">Players</h3>
                    <button onClick={addPlayer} className="button-primary">+ Add Player</button>
                  </div>
                  <div className="space-y-3">
                    {players.map((p) => (
                      <div key={p.id} className="border border-white/5 rounded p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-4 h-4 rounded-full" style={{ background: p.color }}></span>
                          <input
                            value={p.name}
                            onChange={(e) => renamePlayer(p.id, e.target.value)}
                            className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        {(() => {
                          const pool = playerTokens[p.id] ?? { allowance: DEFAULT_PLAYER_TOKENS, available: DEFAULT_PLAYER_TOKENS };
                          return (
                            <div className="token-controls text-xs">
                              <span className="pill">Tokens {pool.available}/{pool.allowance}</span>
                              <button
                                onClick={() => adjustPlayerTokens(p.id, -1)}
                                className="button-ghost"
                                disabled={pool.available <= 0}
                              >Spend</button>
                              <button
                                onClick={() => adjustPlayerTokens(p.id, 1)}
                                className="button-ghost"
                                disabled={pool.available >= pool.allowance}
                              >Refund</button>
                              <label className="label-inline">
                                Allowance
                                <input
                                  type="number"
                                  min={0}
                                  value={pool.allowance}
                                  onChange={(e) => setPlayerAllowance(p.id, parseInt(e.target.value || "0", 10))}
                                  className="w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5"
                                />
                              </label>
                            </div>
                          );
                        })()}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => assignSelectedTo(p.id)}
                            disabled={!selectedCountry}
                            className="button-soft text-xs"
                          >Assign selected</button>
                          {Object.keys(PRESET_GROUPS).map((g) => (
                            <button
                              key={g}
                              onClick={() => assignGroupToPlayer(g, p.id)}
                              className="button-ghost text-xs"
                            >{g}</button>
                          ))}
                        </div>
                        <div className="mt-2">
                          <textarea
                            id={`bulk-${p.id}`}
                            placeholder="Countries separated by commas or new lines"
                            className="w-full h-16 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                          />
                          <div className="token-controls mt-1">
                            <input
                              id={`label-${p.id}`}
                              type="text"
                              placeholder="Optional label (renames player)"
                              className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                            />
                            <button
                              onClick={() => {
                                const textarea = document.getElementById(`bulk-${p.id}`) as HTMLTextAreaElement;
                                const labelInput = document.getElementById(`label-${p.id}`) as HTMLInputElement;
                                const countries = textarea.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
                                if (countries.length) {
                                  assignCountriesToPlayer(countries, p.id);
                                  if (labelInput.value.trim()) {
                                    renamePlayer(p.id, labelInput.value.trim());
                                  }
                                  textarea.value = "";
                                  labelInput.value = "";
                                }
                              }}
                              className="button-soft text-xs"
                            >Assign list</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Scenario Tools */}
                <section className="border border-white/10 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3">Scenario Tools</h3>
                  <div className="space-y-3 text-xs">
                    <div className="token-controls">
                      <span className="label-inline">Initial outbreak</span>
                      <span className="pill">{initialOutbreak ?? "Pending"}</span>
                      <button onClick={rollInitialOutbreak} className="button-ghost">Randomize Selected</button>
                      {outbreakRoll !== null && <span>Roll: {outbreakRoll}</span>}
                    </div>
                    <div className="space-y-2">
                      <div className="label-inline">Eligible countries</div>
                      <div className="outbreak-grid">
                        {availableOutbreakCountries.map((location) => (
                          <label key={location} className="outbreak-option">
                            <input
                              type="checkbox"
                              checked={selectedOutbreakCandidates.includes(location)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedOutbreakCandidates([...selectedOutbreakCandidates, location]);
                                } else {
                                  setSelectedOutbreakCandidates(selectedOutbreakCandidates.filter(c => c !== location));
                                }
                              }}
                            />
                            {location}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => setSelectedOutbreakCandidates(availableOutbreakCountries)}
                        >Select All</button>
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => setSelectedOutbreakCandidates([])}
                        >Clear</button>
                      </div>
                    </div>
                    <div className="token-controls">
                      <label className="label-inline" htmlFor="manual-outbreak-select">Manual set</label>
                      <select
                        id="manual-outbreak-select"
                        value={manualOutbreakChoice}
                        onChange={(event) => setManualOutbreakChoice(event.target.value)}
                        className="px-2 py-1 rounded bg-white/10 border border-white/10"
                      >
                        <option value="">Select country…</option>
                        {availableOutbreakCountries.map((location) => (
                          <option key={location} value={location}>{location}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          if (manualOutbreakChoice) {
                            setInitialOutbreak(manualOutbreakChoice);
                            setManualOutbreakChoice("");
                          }
                        }}
                        disabled={!manualOutbreakChoice}
                        className="button-ghost"
                      >Set</button>
                    </div>
                    <div className="token-controls">
                      <span className="label-inline">Vaccine progress</span>
                      <span className="pill">{vaccineProgress}/{VACCINE_TRACK_MAX}</span>
                      <button onClick={() => adjustVaccineProgress(1)} className="button-soft" disabled={vaccineProgress >= VACCINE_TRACK_MAX}>+1</button>
                      <button onClick={() => adjustVaccineProgress(-1)} className="button-ghost" disabled={vaccineProgress <= 0}>-1</button>
                    </div>
                    <button onClick={resetAllOverlayLayouts} className="button-ghost">Reset HUD layout</button>
                  </div>
                </section>

                {/* Territory Management */}
                {selectedCountry && (
                  <section className="border border-white/10 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-3">Territory: {selectedCountry}</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-semibold mb-2">Owners</div>
                        {selectedOwnerDetails.length > 0 ? (
                          <div className="space-y-1">
                            {selectedOwnerDetails.map((owner) => (
                              <div key={owner.id} className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ background: owner.color }}></span>
                                <span className="flex-1">{owner.name}</span>
                                <button
                                  onClick={() => removePlayerFromCountry(selectedCountry, owner.id)}
                                  className="button-ghost text-xs"
                                >Remove</button>
                              </div>
                            ))}
                            <button
                              onClick={() => clearCountryOwners(selectedCountry)}
                              className="button-ghost text-xs"
                            >Clear all</button>
                          </div>
                        ) : (
                          <div className="text-xs opacity-70">No owners assigned.</div>
                        )}
                      </div>
                      <div className="token-controls">
                        <span className="label-inline">Country tokens</span>
                        <span className="pill">
                          {(() => {
                            const pool = countryTokens[selectedCountry] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
                            return `${pool.available}/${pool.allowance}`;
                          })()}
                        </span>
                        <button
                          onClick={() => adjustCountryTokens(selectedCountry, -1)}
                          className="button-ghost"
                          disabled={(() => {
                            const pool = countryTokens[selectedCountry] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
                            return pool.available <= 0;
                          })()}
                        >Spend</button>
                        <button
                          onClick={() => adjustCountryTokens(selectedCountry, 1)}
                          className="button-ghost"
                          disabled={(() => {
                            const pool = countryTokens[selectedCountry] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
                            return pool.available >= pool.allowance;
                          })()}
                        >Refund</button>
                        <label className="label-inline">
                          Allowance
                          <input
                            type="number"
                            min={0}
                            value={(() => {
                              const pool = countryTokens[selectedCountry] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
                              return pool.allowance;
                            })()}
                            onChange={(e) => setCountryAllowance(selectedCountry, parseInt(e.target.value || "0", 10))}
                            className="w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5"
                          />
                        </label>
                      </div>
                    </div>
                  </section>
                )}

                {/* Local Actors */}
                {selectedCountry && (
                  <section className="border border-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">Local Actors - {selectedCountry}</h3>
                    </div>
                    <div className="space-y-3">
                      {selectedCountryActors.map((actor) => (
                        <div key={actor.id} className="border border-white/5 rounded p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="color"
                              value={actor.color}
                              onChange={(e) => updateLocalActor(selectedCountry, actor.id, { color: e.target.value })}
                              className="w-6 h-6 rounded border border-white/10"
                            />
                            <input
                              value={actor.name}
                              onChange={(e) => updateLocalActor(selectedCountry, actor.id, { name: e.target.value })}
                              className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                            />
                            <button
                              onClick={() => removeLocalActor(selectedCountry, actor.id)}
                              className="button-ghost text-xs"
                            >Remove</button>
                          </div>
                          <textarea
                            value={actor.notes}
                            onChange={(e) => updateLocalActor(selectedCountry, actor.id, { notes: e.target.value })}
                            placeholder="Notes..."
                            className="w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                          />
                          {(() => {
                            const pool = actorTokens[actor.id] ?? { allowance: DEFAULT_ACTOR_TOKENS, available: DEFAULT_ACTOR_TOKENS };
                            return (
                              <div className="token-controls token-controls-small">
                                <span className="pill">{pool.available}/{pool.allowance}</span>
                                <button
                                  onClick={() => adjustActorTokens(actor.id, -1)}
                                  className="button-ghost"
                                  disabled={pool.available <= 0}
                                >Spend</button>
                                <button
                                  onClick={() => adjustActorTokens(actor.id, 1)}
                                  className="button-ghost"
                                  disabled={pool.available >= pool.allowance}
                                >Refund</button>
                                <label className="label-inline">
                                  Allowance
                                  <input
                                    type="number"
                                    min={0}
                                    value={pool.allowance}
                                    onChange={(e) => setActorAllowance(actor.id, parseInt(e.target.value || "0", 10))}
                                    className="w-14 bg-white/10 border border-white/10 rounded px-1 py-0.5"
                                  />
                                </label>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                      <div className="border border-white/5 rounded p-3 bg-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="color"
                            value={newActorColor}
                            onChange={(e) => setNewActorColor(e.target.value)}
                            className="w-6 h-6 rounded border border-white/10"
                          />
                          <input
                            value={newActorName}
                            onChange={(e) => setNewActorName(e.target.value)}
                            placeholder="New actor name"
                            className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                          />
                          <button
                            onClick={addLocalActor}
                            className="button-soft text-xs"
                            disabled={!newActorName.trim()}
                          >Add</button>
                        </div>
                        <textarea
                          value={newActorNotes}
                          onChange={(e) => setNewActorNotes(e.target.value)}
                          placeholder="Notes..."
                          className="w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* External Organizations */}
                <section className="border border-white/10 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">External Organizations</h3>
                  </div>
                  <div className="space-y-3">
                    {externalOrganizations.map((org) => (
                      <div key={org.id} className="border border-white/5 rounded p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="color"
                            value={org.color}
                            onChange={(e) => updateExternalOrganization(org.id, { color: e.target.value })}
                            className="w-6 h-6 rounded border border-white/10"
                          />
                          <input
                            value={org.name}
                            onChange={(e) => updateExternalOrganization(org.id, { name: e.target.value })}
                            className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                          />
                          <button
                            onClick={() => removeExternalOrganization(org.id)}
                            className="button-ghost text-xs"
                          >Remove</button>
                        </div>
                        {/* Image Upload/URL Section */}
                        <div className="mb-2">
                          <div className="text-xs opacity-80 mb-1">Organization Picture:</div>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="file"
                              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleOrgFileUpload(org.id, file);
                                }
                                // Clear the input so the same file can be selected again
                                e.target.value = '';
                              }}
                              className="hidden"
                              id={`org-edit-file-input-${org.id}`}
                            />
                            <label
                              htmlFor={`org-edit-file-input-${org.id}`}
                              className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs cursor-pointer transition-colors text-center file-upload-label"
                            >
                              📁 Upload New Image
                            </label>
                            {org.picture && (
                              <button
                                onClick={() => updateExternalOrganization(org.id, { picture: undefined, pictureFile: undefined })}
                                className="button-ghost text-xs"
                                title="Remove current image"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <input
                            value={org.picture?.startsWith('data:') ? '' : (org.picture || "")}
                            onChange={(e) => updateExternalOrganization(org.id, { picture: e.target.value || undefined })}
                            placeholder="Or paste image URL..."
                            className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                            disabled={org.picture?.startsWith('data:')}
                          />
                          {org.picture?.startsWith('data:') && (
                            <div className="text-xs opacity-60 mt-1">
                              Uploaded file: {org.pictureFile?.name || 'Unknown file'}
                            </div>
                          )}
                        </div>
                        <textarea
                          value={org.notes}
                          onChange={(e) => updateExternalOrganization(org.id, { notes: e.target.value })}
                          placeholder="Notes..."
                          className="w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                        />
                        <div className="flex gap-2 mt-2 text-xs">
                          <div className="flex items-center gap-1">
                            <span>Size:</span>
                            <input
                              type="number"
                              value={org.width}
                              onChange={(e) => updateExternalOrganization(org.id, { width: Math.max(120, parseInt(e.target.value || "200", 10)) })}
                              className="w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5"
                              min="120"
                            />
                            <span>×</span>
                            <input
                              type="number"
                              value={org.height}
                              onChange={(e) => updateExternalOrganization(org.id, { height: Math.max(80, parseInt(e.target.value || "150", 10)) })}
                              className="w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5"
                              min="80"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="border border-white/5 rounded p-3 bg-white/5">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="color"
                          value={newOrgColor}
                          onChange={(e) => setNewOrgColor(e.target.value)}
                          className="w-6 h-6 rounded border border-white/10"
                        />
                        <input
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                          placeholder="New organization name"
                          className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                        />
                        <button
                          onClick={addExternalOrganization}
                          className="button-soft text-xs"
                          disabled={!newOrgName.trim()}
                        >Add</button>
                      </div>
                      {/* Image Upload Section */}
                      <div className="mb-2">
                        <div className="text-xs opacity-80 mb-1">Organization Picture:</div>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setNewOrgPictureFile(file);
                                setNewOrgPicture(""); // Clear URL when file is selected
                              } else {
                                setNewOrgPictureFile(null);
                              }
                            }}
                            className="hidden"
                            id="settings-org-file-input"
                          />
                          <label
                            htmlFor="settings-org-file-input"
                            className={[
                              "flex-1 rounded px-2 py-1 text-xs cursor-pointer transition-colors text-center file-upload-label",
                              newOrgPictureFile ? "file-upload-selected" : "bg-white/10 border-white/10"
                            ].join(" ")}
                          >
                            {newOrgPictureFile ? `📁 ${newOrgPictureFile.name}` : '📁 Choose Image File'}
                          </label>
                          {newOrgPictureFile && (
                            <button
                              onClick={() => {
                                setNewOrgPictureFile(null);
                                const fileInput = document.getElementById('settings-org-file-input') as HTMLInputElement;
                                if (fileInput) fileInput.value = '';
                              }}
                              className="button-ghost text-xs"
                              title="Clear selected file"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        
                        {/* Or URL Input */}
                        {!newOrgPictureFile && (
                          <>
                            <div className="text-xs opacity-60 text-center mb-1">or</div>
                            <input
                              value={newOrgPicture}
                              onChange={(e) => setNewOrgPicture(e.target.value)}
                              placeholder="Picture URL (optional)..."
                              className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                            />
                          </>
                        )}
                      </div>
                      <textarea
                        value={newOrgNotes}
                        onChange={(e) => setNewOrgNotes(e.target.value)}
                        placeholder="Notes..."
                        className="w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                </section>

                {/* Dice */}
                <section className="border border-white/10 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3">Dice</h3>
                  <div className="space-y-3">
                    <div className="token-controls">
                      <label className="label-inline" htmlFor="die-select-settings">Sides</label>
                      <select
                        id="die-select-settings"
                        value={dieSides}
                        onChange={(e) => setDieSides(parseInt(e.target.value, 10))}
                        className="px-2 py-1 rounded bg-white/10 border border-white/10"
                      >
                        {DIE_OPTIONS.map((sides) => (
                          <option key={sides} value={sides}>
                            d{sides}
                          </option>
                        ))}
                      </select>
                      <button onClick={rollDie} className="button-primary">Roll</button>
                    </div>
                    {lastRoll !== null && (
                      <div className="text-lg font-bold">Result: {lastRoll} (d{dieSides})</div>
                    )}
                  </div>
                </section>

                {/* Timeline */}
                <section className="border border-white/10 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3">Timeline</h3>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <span className="font-medium">Round {roundNumber}:</span> {formatGameDate(gameDate)}
                    </div>
                    <div className="token-controls">
                      <label className="label-inline" htmlFor="time-advance-value-settings">Advance by</label>
                      <input
                        id="time-advance-value-settings"
                        type="number"
                        min={1}
                        value={Number.isNaN(timeAdvanceValue) ? "" : timeAdvanceValue}
                        onChange={(e) => {
                          const nextValue = parseInt(e.target.value || "0", 10);
                          setTimeAdvanceValue(Number.isNaN(nextValue) ? 1 : Math.max(1, nextValue));
                        }}
                        className="w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5"
                      />
                      <select
                        value={timeAdvanceUnit}
                        onChange={(e) => setTimeAdvanceUnit(e.target.value as TimeUnit)}
                        className="px-2 py-1 rounded bg-white/10 border border-white/10"
                      >
                        <option value="days">Days</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={advanceTime} className="button-soft">Advance round</button>
                      <button onClick={rewindTime} disabled={roundNumber <= 1} className="button-ghost">Rewind</button>
                    </div>
                    <div className="token-controls">
                      <label className="label-inline" htmlFor="start-date-settings">Start date</label>
                      <input
                        id="start-date-settings"
                        type="date"
                        value={startDateInput}
                        onChange={(e) => setStartDateInput(e.target.value)}
                        className="bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                      />
                      <button onClick={applyStartDate} className="button-ghost">Set</button>
                    </div>
                    <div className="text-xs opacity-70">Time automatically advances when you loop past the final phase.</div>
                  </div>
                </section>

                {/* UI Display Toggles */}
                <section className="border border-white/10 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3">UI Display Controls</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showPlayerAssignmentButton}
                          onChange={(e) => setShowPlayerAssignmentButton(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Player Assignment Button</span>
                      </label>
                      
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showTimerOverlay}
                          onChange={(e) => setShowTimerOverlay(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Timer Overlay</span>
                      </label>
                      
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showInterestOverlay}
                          onChange={(e) => setShowInterestOverlay(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Interest Track</span>
                      </label>
                      
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showRoundIndicator}
                          onChange={(e) => setShowRoundIndicator(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Round Indicator</span>
                      </label>
                      
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showMapLockButton}
                          onChange={(e) => setShowMapLockButton(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Map Lock Button</span>
                      </label>
                    </div>
                    <div className="text-xs opacity-70">Toggle which UI elements are visible on the screen</div>
                  </div>
                </section>

                {/* Timer */}
                <section className="border border-white/10 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3">Timer</h3>
                  <div className="space-y-3">
                    <div className="text-lg font-mono">
                      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setRunning(true)} className="button-soft">Start</button>
                      <button onClick={() => setRunning(false)} className="button-soft">Pause</button>
                      <button onClick={resetTimer} className="button-ghost">Reset</button>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-semibold mb-1">Phase Durations</div>
                      {PHASES.map((ph, idx) => (
                        <div key={ph} className="flex items-center gap-2 text-xs">
                          <span className="w-32 text-xs">{ph}</span>
                          <input 
                            type="number" 
                            min={0} 
                            value={Math.floor(phaseDurations[idx]/60)} 
                            onChange={(e)=>setDurationForPhase(idx, parseInt(e.target.value||'0',10), phaseDurations[idx]%60)} 
                            className="w-12 bg-white/10 border border-white/10 rounded px-1 py-0.5" 
                          />m
                          <input 
                            type="number" 
                            min={0} 
                            max={59} 
                            value={phaseDurations[idx]%60} 
                            onChange={(e)=>setDurationForPhase(idx, Math.floor(phaseDurations[idx]/60), parseInt(e.target.value||'0',10))} 
                            className="w-12 bg-white/10 border border-white/10 rounded px-1 py-0.5" 
                          />s
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
          );
        })()}
      </section>
    </div>
  );
}
