import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
const NEUTRAL_COLOR = "#94a3b8";
const hexToRgb = (hex) => {
    const normalized = hex.replace(/[^0-9a-f]/gi, "");
    if (normalized.length !== 6)
        return null;
    const bigint = parseInt(normalized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
};
const rgbToHex = (r, g, b) => `#${[r, g, b]
    .map((v) => {
    const clamped = Math.max(0, Math.min(255, Math.round(v)));
    return clamped.toString(16).padStart(2, "0");
})
    .join("")}`;
const blendHexColors = (colors) => {
    if (!colors.length)
        return NEUTRAL_COLOR;
    const valid = colors
        .map((hex) => ({ hex, rgb: hexToRgb(hex) }))
        .filter((entry) => entry.rgb !== null);
    if (!valid.length)
        return NEUTRAL_COLOR;
    const totals = valid.reduce((acc, { rgb }) => {
        acc.r += rgb.r;
        acc.g += rgb.g;
        acc.b += rgb.b;
        return acc;
    }, { r: 0, g: 0, b: 0 });
    const count = valid.length;
    return rgbToHex(totals.r / count, totals.g / count, totals.b / count);
};
const getActorInitials = (name) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length)
        return "?";
    const initials = parts.slice(0, 2).map((segment) => segment[0].toUpperCase());
    return initials.join("");
};
const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result && typeof event.target.result === 'string') {
                resolve(event.target.result);
            }
            else {
                reject(new Error('Failed to read file as data URL'));
            }
        };
        reader.onerror = () => reject(new Error('File reading error'));
        reader.readAsDataURL(file);
    });
};
const isValidImageFile = (file) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB limit
    return validTypes.includes(file.type) && file.size <= maxSize;
};
const createActorIcon = (color, name, highlight) => L.divIcon({
    className: "actor-marker",
    html: `<div class="actor-marker-bubble${highlight ? " actor-marker-bubble-active" : ""}" style="background:${color}"><span>${getActorInitials(name)}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    tooltipAnchor: [0, -20],
});
function NationalInterestTrack({ levels, participants, positions, onMove }) {
    const maxLevel = Math.max(1, levels);
    const sorted = [...participants].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const buckets = {};
    for (let level = 0; level <= maxLevel; level += 1) {
        buckets[level] = [];
    }
    sorted.forEach((participant) => {
        const raw = positions[participant.id] ?? 1;
        const level = Math.max(0, Math.min(maxLevel, raw));
        buckets[level].push(participant);
    });
    const levelOrder = Array.from({ length: maxLevel + 1 }, (_, index) => index).reverse();
    return (_jsx("div", { className: "national-interest-track", children: levelOrder.map((level) => {
            const entries = buckets[level] ?? [];
            const isTop = level === maxLevel;
            const labelClasses = ["interest-tier-label"];
            if (isTop) {
                labelClasses.push("interest-tier-label-top");
            }
            if (level === 0) {
                labelClasses.push("interest-tier-label-start");
            }
            return (_jsxs("div", { className: "interest-tier", children: [_jsxs("div", { className: labelClasses.join(" "), children: [isTop && _jsx("span", { className: "interest-tier-heading", children: "National Interest" }), _jsx("span", { className: "interest-tier-number", children: level === 0 ? "Start" : level })] }), _jsx("div", { className: "interest-tier-slots", children: entries.map((participant) => {
                            const currentLevel = Math.max(0, Math.min(maxLevel, positions[participant.id] ?? 1));
                            const canLevelUp = currentLevel < maxLevel;
                            const canLevelDown = currentLevel > 0;
                            return (_jsxs("div", { className: "interest-participant", children: [_jsx("div", { className: "interest-participant-avatar", style: { background: participant.color }, children: getActorInitials(participant.name) }), _jsxs("div", { className: "interest-participant-body", children: [_jsx("span", { className: "interest-participant-name", children: participant.name }), participant.kind === "actor" && participant.territory && (_jsx("span", { className: "interest-participant-subtext", children: participant.territory }))] }), _jsxs("div", { className: "interest-participant-controls", children: [_jsx("button", { type: "button", className: "interest-control", onClick: () => onMove(participant.id, 1), disabled: !canLevelUp, "aria-label": `Advance ${participant.name}`, children: "^" }), _jsx("button", { type: "button", className: "interest-control", onClick: () => onMove(participant.id, -1), disabled: !canLevelDown, "aria-label": `Revert ${participant.name}`, children: "v" })] })] }, participant.id));
                        }) })] }, level));
        }) }));
}
function OverlayPanel({ id, title, layout, minimized, headerExtra, allowResize = true, className, showHeader = true, interaction, onFocus, onStartDrag, onStartResize, onToggleMinimize, onReset, registerRef, children, }) {
    const isDragging = interaction?.id === id && interaction.mode === "drag";
    const isResizing = interaction?.id === id && interaction.mode === "resize";
    const handleContainerPointerDown = (event) => {
        const target = event.target;
        if (target.closest(".overlay-action-button") || target.closest(".overlay-resize-handle")) {
            return;
        }
        onFocus(id);
    };
    return (_jsxs("div", { ref: (node) => registerRef(id, node), className: [
            "overlay-panel",
            className ?? "",
            minimized ? "overlay-panel-minimized" : "",
            isDragging ? "overlay-panel-dragging" : "",
            isResizing ? "overlay-panel-resizing" : "",
        ].filter(Boolean).join(" "), style: {
            left: layout.x,
            top: layout.y,
            width: layout.width,
            ...(minimized ? {} : layout.height ? { height: layout.height } : {}),
            zIndex: layout.zIndex,
        }, onPointerDown: handleContainerPointerDown, children: [showHeader && (_jsxs("div", { className: "overlay-header", children: [_jsx("div", { className: "overlay-handle", onPointerDown: (event) => onStartDrag(id, event), children: _jsx("span", { className: "overlay-title", children: title }) }), headerExtra && _jsx("div", { className: "overlay-header-extra", children: headerExtra }), _jsxs("div", { className: "overlay-actions", children: [onReset && (_jsx("button", { type: "button", className: "overlay-action-button", onClick: (event) => {
                                    event.stopPropagation();
                                    onFocus(id);
                                    onReset(id);
                                }, "aria-label": `Reset ${title} layout`, children: "\u21BA" })), _jsx("button", { type: "button", className: "overlay-action-button", onClick: (event) => {
                                    event.stopPropagation();
                                    onFocus(id);
                                    onToggleMinimize(id);
                                }, "aria-label": minimized ? `Restore ${title}` : `Minimize ${title}`, children: minimized ? "▢" : "–" })] })] })), !minimized && _jsx("div", { className: "overlay-body", children: children }), !minimized && allowResize && (_jsx("div", { className: "overlay-resize-handle", onPointerDown: (event) => onStartResize(id, event), role: "separator", "aria-label": `Resize ${title}`, children: _jsx("span", { className: "overlay-resize-icon", children: "\u22F0" }) }))] }));
}
const PLAYER_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#14b8a6", "#f97316", "#f5f5f5"];
const PANDEMIC_OUTBREAK_LOCATIONS = ["China", "Japan", "South Korea", "Vietnam", "Thailand", "Singapore"];
const VACCINE_TRACK_MAX = 6;
const DEFAULT_PLAYER_TOKENS = 5;
const DEFAULT_COUNTRY_TOKENS = 3;
const DEFAULT_ACTOR_TOKENS = 3;
const DEFAULT_INTEREST_LEVEL_COUNT = 4;
const getDefaultOverlayLayouts = () => {
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
const PRESET_GROUPS = {
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
    const mapRef = useRef(null);
    const mapElRef = useRef(null);
    const fogCanvasRef = useRef(null);
    const countriesLayerRef = useRef(null);
    const countryLayerIndex = useRef({});
    const actorMarkersRef = useRef({});
    const orgBoxesRef = useRef({});
    const overlayRefs = useRef({ timer: null, interest: null });
    const [overlayLayouts, setOverlayLayouts] = useState(getDefaultOverlayLayouts);
    const zCounterRef = useRef(Math.max(...Object.values(overlayLayouts).map((layout) => layout.zIndex)));
    const dragStateRef = useRef(null);
    const [activeInteraction, setActiveInteraction] = useState(null);
    const orgDragStateRef = useRef(null);
    const [draggingOrg, setDraggingOrg] = useState(null);
    const [mapReady, setMapReady] = useState(false);
    const [mapLocked, setMapLocked] = useState(false);
    const lockedViewRef = useRef(null);
    const [showTimerOverlay, setShowTimerOverlay] = useState(true);
    const [showInterestOverlay, setShowInterestOverlay] = useState(true);
    const [showRoundIndicator, setShowRoundIndicator] = useState(true);
    const [showMapLockButton, setShowMapLockButton] = useState(true);
    const [showPlayerAssignmentButton, setShowPlayerAssignmentButton] = useState(true);
    const [showTitle, setShowTitle] = useState(true);
    const [showPauseMenu, setShowPauseMenu] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showPlayerAssignment, setShowPlayerAssignment] = useState(false);
    const setOverlayRef = useCallback((id, node) => {
        overlayRefs.current[id] = node;
    }, []);
    const bringOverlayToFront = useCallback((id) => {
        setOverlayLayouts((prev) => {
            const current = prev[id];
            if (!current)
                return prev;
            const nextZ = zCounterRef.current + 1;
            zCounterRef.current = nextZ;
            if (current.zIndex === nextZ)
                return prev;
            return { ...prev, [id]: { ...current, zIndex: nextZ } };
        });
    }, []);
    const handlePointerMove = useCallback((event) => {
        const state = dragStateRef.current;
        if (!state)
            return;
        event.preventDefault();
        const dx = event.clientX - state.originX;
        const dy = event.clientY - state.originY;
        if (state.mode === "drag") {
            setOverlayLayouts((prev) => {
                const current = prev[state.id];
                if (!current)
                    return prev;
                const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
                const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;
                const currentWidth = current.width ?? state.startWidth;
                const currentHeight = current.height ?? state.startHeight;
                const maxX = viewportWidth - Math.max(120, currentWidth * 0.35);
                const maxY = viewportHeight - Math.max(120, currentHeight * 0.35);
                const nextX = Math.min(Math.max(-50, state.startX + dx), maxX);
                const nextY = Math.min(Math.max(-50, state.startY + dy), maxY);
                if (current.x === nextX && current.y === nextY)
                    return prev;
                return { ...prev, [state.id]: { ...current, x: nextX, y: nextY } };
            });
        }
        else {
            const minWidth = 220;
            const minHeight = 140;
            const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
            const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;
            const width = Math.min(Math.max(minWidth, state.startWidth + dx), viewportWidth - 48);
            const height = Math.min(Math.max(minHeight, state.startHeight + dy), viewportHeight - 96);
            setOverlayLayouts((prev) => {
                const current = prev[state.id];
                if (!current)
                    return prev;
                if (current.width === width && (current.height ?? height) === height)
                    return prev;
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
    const beginInteraction = useCallback((id, mode, event) => {
        event.preventDefault();
        event.stopPropagation();
        const layout = overlayLayouts[id];
        if (!layout)
            return;
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
    }, [overlayLayouts, bringOverlayToFront, handlePointerMove, handlePointerUp]);
    const focusOverlay = useCallback((id) => {
        bringOverlayToFront(id);
    }, [bringOverlayToFront]);
    const startDrag = useCallback((id, event) => {
        beginInteraction(id, "drag", event);
    }, [beginInteraction]);
    const startResize = useCallback((id, event) => {
        beginInteraction(id, "resize", event);
    }, [beginInteraction]);
    const toggleOverlayMinimize = useCallback((id) => {
        setOverlayLayouts((prev) => {
            const current = prev[id];
            if (!current)
                return prev;
            return { ...prev, [id]: { ...current, minimized: !current.minimized } };
        });
    }, []);
    const resetOverlayLayout = useCallback((id) => {
        const defaults = getDefaultOverlayLayouts();
        const layout = defaults[id];
        if (!layout)
            return;
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
            if (dragStateRef.current)
                return;
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
    const [players, setPlayers] = useState([]);
    const [ownership, setOwnership] = useState({});
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [countryActors, setCountryActors] = useState({});
    const [externalOrganizations, setExternalOrganizations] = useState([]);
    const [newActorName, setNewActorName] = useState("");
    const [newActorNotes, setNewActorNotes] = useState("");
    const [newActorColor, setNewActorColor] = useState(PLAYER_COLORS[0]);
    const [newOrgName, setNewOrgName] = useState("");
    const [newOrgNotes, setNewOrgNotes] = useState("");
    const [newOrgColor, setNewOrgColor] = useState(PLAYER_COLORS[0]);
    const [newOrgPicture, setNewOrgPicture] = useState("");
    const [newOrgPictureFile, setNewOrgPictureFile] = useState(null);
    const [playerTokens, setPlayerTokens] = useState({});
    const [countryTokens, setCountryTokens] = useState({});
    const [actorTokens, setActorTokens] = useState({});
    const [discoveredAreas, setDiscoveredAreas] = useState([]);
    const [fogRadius, setFogRadius] = useState(110);
    const [fogOpacity, setFogOpacity] = useState(0.75);
    const [vaccineProgress, setVaccineProgress] = useState(0);
    const [nationalInterests, setNationalInterests] = useState({});
    const [interestLevelCount, setInterestLevelCount] = useState(DEFAULT_INTEREST_LEVEL_COUNT);
    const [initialOutbreak, setInitialOutbreak] = useState(null);
    const [selectedOutbreakCandidates, setSelectedOutbreakCandidates] = useState(PANDEMIC_OUTBREAK_LOCATIONS);
    const [availableOutbreakCountries, setAvailableOutbreakCountries] = useState(PANDEMIC_OUTBREAK_LOCATIONS);
    const [manualOutbreakChoice, setManualOutbreakChoice] = useState("");
    const [outbreakRoll, setOutbreakRoll] = useState(null);
    const participants = useMemo(() => {
        const actorEntries = [];
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
        const playerEntries = players.map((player) => ({
            id: player.id,
            name: player.name,
            color: player.color,
            kind: "player",
        }));
        const organizationEntries = externalOrganizations.map((org) => ({
            id: org.id,
            name: org.name,
            color: org.color,
            kind: "organization",
        }));
        return [...playerEntries, ...actorEntries, ...organizationEntries];
    }, [players, countryActors, externalOrganizations]);
    const getOwnersForCountry = (country) => ownership[country] ?? [];
    const findPlayerById = (pid) => players.find((p) => p.id === pid);
    const removePlayer = (playerId) => {
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
    const getLocalActors = (country) => countryActors[country] ?? [];
    const ensurePlayerTokens = (pid) => {
        setPlayerTokens((prev) => {
            if (prev[pid])
                return prev;
            return { ...prev, [pid]: { allowance: DEFAULT_PLAYER_TOKENS, available: DEFAULT_PLAYER_TOKENS } };
        });
    };
    const ensureCountryTokens = (country) => {
        setCountryTokens((prev) => {
            if (prev[country])
                return prev;
            return { ...prev, [country]: { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS } };
        });
    };
    const ensureActorTokens = (actorId) => {
        setActorTokens((prev) => {
            if (prev[actorId])
                return prev;
            return { ...prev, [actorId]: { allowance: DEFAULT_ACTOR_TOKENS, available: DEFAULT_ACTOR_TOKENS } };
        });
    };
    const replenishAllTokens = () => {
        setPlayerTokens((prev) => Object.fromEntries(Object.entries(prev).map(([id, pool]) => [id, { ...pool, available: pool.allowance }])));
        setCountryTokens((prev) => Object.fromEntries(Object.entries(prev).map(([name, pool]) => [name, { ...pool, available: pool.allowance }])));
        setActorTokens((prev) => Object.fromEntries(Object.entries(prev).map(([id, pool]) => [id, { ...pool, available: pool.allowance }])));
    };
    const normalizedAllowance = (value, fallback) => {
        if (Number.isNaN(value) || !Number.isFinite(value))
            return fallback;
        return Math.max(0, value);
    };
    const setPlayerAllowance = (pid, allowance) => {
        setPlayerTokens((prev) => {
            const pool = prev[pid] ?? { allowance: DEFAULT_PLAYER_TOKENS, available: DEFAULT_PLAYER_TOKENS };
            const normalized = normalizedAllowance(allowance, DEFAULT_PLAYER_TOKENS);
            return {
                ...prev,
                [pid]: { allowance: normalized, available: Math.min(pool.available, normalized) },
            };
        });
    };
    const adjustPlayerTokens = (pid, delta) => {
        setPlayerTokens((prev) => {
            const pool = prev[pid];
            if (!pool)
                return prev;
            const next = Math.max(0, Math.min(pool.allowance, pool.available + delta));
            if (next === pool.available)
                return prev;
            return { ...prev, [pid]: { ...pool, available: next } };
        });
    };
    const setCountryAllowance = (country, allowance) => {
        setCountryTokens((prev) => {
            const pool = prev[country] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
            const normalized = normalizedAllowance(allowance, DEFAULT_COUNTRY_TOKENS);
            return {
                ...prev,
                [country]: { allowance: normalized, available: Math.min(pool.available, normalized) },
            };
        });
    };
    const adjustCountryTokens = (country, delta) => {
        setCountryTokens((prev) => {
            const pool = prev[country];
            if (!pool)
                return prev;
            const next = Math.max(0, Math.min(pool.allowance, pool.available + delta));
            if (next === pool.available)
                return prev;
            return { ...prev, [country]: { ...pool, available: next } };
        });
    };
    const setActorAllowance = (actorId, allowance) => {
        setActorTokens((prev) => {
            const pool = prev[actorId] ?? { allowance: DEFAULT_ACTOR_TOKENS, available: DEFAULT_ACTOR_TOKENS };
            const normalized = normalizedAllowance(allowance, DEFAULT_ACTOR_TOKENS);
            return {
                ...prev,
                [actorId]: { allowance: normalized, available: Math.min(pool.available, normalized) },
            };
        });
    };
    const adjustActorTokens = (actorId, delta) => {
        setActorTokens((prev) => {
            const pool = prev[actorId];
            if (!pool)
                return prev;
            const next = Math.max(0, Math.min(pool.allowance, pool.available + delta));
            if (next === pool.available)
                return prev;
            return { ...prev, [actorId]: { ...pool, available: next } };
        });
    };
    const adjustNationalInterest = (pid, delta) => {
        setNationalInterests((prev) => {
            const current = prev[pid] ?? 0;
            const maxLevel = Math.max(1, interestLevelCount);
            const next = Math.max(0, Math.min(maxLevel, current + delta));
            if (next === current)
                return prev;
            return { ...prev, [pid]: next };
        });
    };
    const chooseRandomOutbreakLocation = (pool) => {
        if (pool.length === 0)
            return null;
        const roll = Math.floor(Math.random() * pool.length);
        return { location: pool[roll], roll: roll + 1 };
    };
    const applyOutbreakLocation = (location, rollValue = null) => {
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
    const setOutbreakManually = (location) => {
        if (!location)
            return;
        applyOutbreakLocation(location, null);
    };
    const adjustVaccineProgress = (delta) => {
        setVaccineProgress((prev) => {
            const next = Math.max(0, Math.min(VACCINE_TRACK_MAX, prev + delta));
            return next;
        });
    };
    // Timekeeping state
    const [gameDate, setGameDate] = useState(() => new Date("2030-01-01"));
    const [roundNumber, setRoundNumber] = useState(1);
    const [timeAdvanceValue, setTimeAdvanceValue] = useState(7);
    const [timeAdvanceUnit, setTimeAdvanceUnit] = useState("days");
    const [startDateInput, setStartDateInput] = useState("2030-01-01");
    // Dice state
    const DIE_OPTIONS = [4, 6, 8, 10, 12, 20];
    const [dieSides, setDieSides] = useState(6);
    const [lastRoll, setLastRoll] = useState(null);
    const rollDie = () => {
        const sides = Math.max(2, dieSides);
        const result = Math.floor(Math.random() * sides) + 1;
        setLastRoll(result);
    };
    // Timer state per phase
    const [phaseDurations, setPhaseDurations] = useState([180, 120, 150, 90, 120]);
    const [seconds, setSeconds] = useState(phaseDurations[0]);
    const [running, setRunning] = useState(false);
    // Phase state
    const [phaseIndex, setPhaseIndex] = useState(0);
    const adjustDate = (base, amount, unit) => {
        const next = new Date(base.getTime());
        if (unit === "days") {
            next.setDate(next.getDate() + amount);
        }
        else if (unit === "months") {
            next.setMonth(next.getMonth() + amount);
        }
        else {
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
        if (roundNumber <= 1)
            return;
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
    const parseDateInput = (value) => {
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
    const formatGameDate = (date) => date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
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
    const handleTimerKeyDown = useCallback((event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleTimerToggle();
        }
    }, [handleTimerToggle]);
    useEffect(() => {
        if (!running)
            return;
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
        if (!map)
            return;
        const enforceLockedView = () => {
            if (!mapLocked || !lockedViewRef.current)
                return;
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
            map.tap?.disable?.();
            map.on("moveend", enforceLockedView);
            map.on("zoomend", enforceLockedView);
            enforceLockedView();
        }
        else {
            map.dragging.enable();
            map.scrollWheelZoom.enable();
            map.doubleClickZoom.enable();
            map.boxZoom?.enable();
            map.keyboard?.enable();
            map.touchZoom?.enable();
            map.tap?.enable?.();
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
    const setDurationForPhase = (index, minutes, seconds) => {
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
        if (mapRef.current || !mapElRef.current)
            return;
        // Define world bounds to prevent dragging beyond the map
        const worldBounds = L.latLngBounds(L.latLng(-85, -180), // Southwest corner
        L.latLng(85, 180) // Northeast corner
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
                style: (f) => baseCountryStyle(f?.properties?.name),
                onEachFeature: (feature, lyr) => {
                    const name = feature.properties.name;
                    countryLayerIndex.current[name] = lyr;
                    lyr.on({
                        click: () => setSelectedCountry(name),
                        mouseover: () => onHover(lyr, true),
                        mouseout: () => onHover(lyr, false)
                    });
                    lyr.bindTooltip(name, { sticky: true });
                },
            }).addTo(map);
            countriesLayerRef.current = layer;
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
            const worldBoundsForFit = L.latLngBounds(L.latLng(-60, -180), // Exclude extreme polar regions for better fit
            L.latLng(75, 180));
            map.fitBounds(worldBoundsForFit, {
                padding: [20, 20], // Small padding
                maxZoom: 4 // Limit initial zoom to prevent being too zoomed in
            });
        }
        else {
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
        const g = countriesLayerRef.current;
        if (!g)
            return;
        g.eachLayer((l) => { const n = l.feature?.properties?.name; l.setStyle(baseCountryStyle(n)); });
    }, [ownership, players, countryActors]);
    useEffect(() => {
        players.forEach((player) => {
            ensurePlayerTokens(player.id);
        });
    }, [players]);
    useEffect(() => {
        const countries = new Set();
        players.forEach((player, index) => {
            if (player.name.trim()) {
                countries.add(player.name.trim());
            }
            else {
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
            if (!prev.length)
                return derivedList;
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
            const next = { ...prev };
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
        const handleClickOutside = (event) => {
            if (showPlayerAssignment) {
                const target = event.target;
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
            const next = {};
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
        if (!map)
            return;
        const markers = actorMarkersRef.current;
        const activeIds = new Set();
        Object.entries(countryActors).forEach(([country, actors]) => {
            actors.forEach((actor) => {
                const position = actor.position ?? getCountryCenter(country);
                if (!position)
                    return;
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
                        const target = event.target;
                        const { lat, lng } = target.getLatLng();
                        setCountryActors((prev) => {
                            const list = prev[actorCountry] ?? [];
                            const idx = list.findIndex((item) => item.id === actorId);
                            if (idx === -1)
                                return prev;
                            const updatedList = [...list];
                            updatedList[idx] = { ...updatedList[idx], position: { lat, lng } };
                            return { ...prev, [actorCountry]: updatedList };
                        });
                    });
                    marker.addTo(map);
                    marker.bindTooltip(actor.name, { direction: "top", offset: [0, -28], opacity: 0.85 });
                    markers[actor.id] = marker;
                }
                else {
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
                }
                else {
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
    const baseCountryStyle = (name) => {
        if (!name) {
            return { color: NEUTRAL_COLOR, weight: 1, fillColor: NEUTRAL_COLOR, fillOpacity: 0.1 };
        }
        const ownerIds = getOwnersForCountry(name);
        const ownerPalette = ownerIds
            .map((id) => findPlayerById(id)?.color)
            .filter((color) => Boolean(color));
        const actorPalette = getLocalActors(name)
            .map((actor) => actor.color)
            .filter((color) => Boolean(color));
        const palette = [...ownerPalette, ...actorPalette];
        const hasOwners = palette.length > 0;
        const blendedColor = palette.length === 1 ? palette[0] : blendHexColors(palette);
        const color = hasOwners ? blendedColor : NEUTRAL_COLOR;
        const fillOpacity = hasOwners ? (palette.length > 1 ? 0.45 : 0.35) : 0.1;
        return { color, weight: hasOwners ? 1.5 : 1, fillColor: color, fillOpacity };
    };
    const onHover = (layer, enter) => {
        if (!layer.setStyle)
            return;
        layer.setStyle({ weight: enter ? 2 : 1 });
    };
    const revealAt = (pos) => setDiscoveredAreas((prev) => [...prev, pos]);
    const getCountryCenter = (country) => {
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
        const newPlayer = { id, name: `Player ${players.length + 1}`, color: PLAYER_COLORS[players.length % PLAYER_COLORS.length] };
        setPlayers((prev) => [...prev, newPlayer]);
        ensurePlayerTokens(id);
    };
    const renamePlayer = (pid, name) => {
        setPlayers(prev => prev.map(p => p.id === pid ? { ...p, name } : p));
    };
    const assignSelectedTo = (pid) => {
        if (!selectedCountry)
            return;
        setOwnership((prev) => {
            const current = prev[selectedCountry] ?? [];
            if (current.includes(pid))
                return prev;
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
    const assignGroupToPlayer = (group, pid) => {
        const countries = PRESET_GROUPS[group] || [];
        const updated = { ...ownership };
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
    const assignCountriesToPlayer = (countries, pid, label) => {
        const updated = { ...ownership };
        countries.forEach((country) => {
            if (!country)
                return;
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
    const removePlayerFromCountry = (country, pid) => {
        setOwnership((prev) => {
            const current = prev[country] ?? [];
            if (!current.includes(pid))
                return prev;
            const next = current.filter((id) => id !== pid);
            const updated = { ...prev };
            if (next.length) {
                updated[country] = next;
            }
            else {
                delete updated[country];
            }
            return updated;
        });
    };
    const clearCountryOwners = (country) => {
        setOwnership((prev) => {
            if (!prev[country])
                return prev;
            const updated = { ...prev };
            delete updated[country];
            return updated;
        });
    };
    const addLocalActor = () => {
        if (!selectedCountry)
            return;
        const trimmedName = newActorName.trim();
        if (!trimmedName)
            return;
        const existing = countryActors[selectedCountry] ?? [];
        const colorToUse = newActorColor || PLAYER_COLORS[existing.length % PLAYER_COLORS.length] || NEUTRAL_COLOR;
        const initialPos = getCountryCenter(selectedCountry) ?? { lat: 0, lng: 0 };
        const actor = {
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
    const updateLocalActor = (country, actorId, updates) => {
        setCountryActors((prev) => {
            const list = prev[country] ?? [];
            if (!list.length)
                return prev;
            const updatedList = list.map((actor) => (actor.id === actorId ? { ...actor, ...updates } : actor));
            return { ...prev, [country]: updatedList };
        });
    };
    const removeLocalActor = (country, actorId) => {
        setCountryActors((prev) => {
            const list = prev[country] ?? [];
            if (!list.length)
                return prev;
            const updatedList = list.filter((actor) => actor.id !== actorId);
            if (!updatedList.length) {
                const copy = { ...prev };
                delete copy[country];
                return copy;
            }
            return { ...prev, [country]: updatedList };
        });
        setActorTokens((prev) => {
            if (!prev[actorId])
                return prev;
            const copy = { ...prev };
            delete copy[actorId];
            return copy;
        });
    };
    const addExternalOrganization = async () => {
        const trimmedName = newOrgName.trim();
        if (!trimmedName)
            return;
        const map = mapRef.current;
        if (!map)
            return;
        const center = map.getCenter();
        let pictureData = undefined;
        // Handle file upload if present
        if (newOrgPictureFile) {
            if (!isValidImageFile(newOrgPictureFile)) {
                alert('Please select a valid image file (JPEG, PNG, GIF, WebP) under 5MB.');
                return;
            }
            try {
                pictureData = await readFileAsDataURL(newOrgPictureFile);
            }
            catch (error) {
                console.error('Error reading image file:', error);
                alert('Failed to read the selected image file.');
                return;
            }
        }
        else if (newOrgPicture.trim()) {
            // Fallback to URL if no file but URL provided
            pictureData = newOrgPicture.trim();
        }
        const org = {
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
    const updateExternalOrganization = (orgId, updates) => {
        try {
            setExternalOrganizations((prev) => {
                const orgExists = prev.some(org => org.id === orgId);
                if (!orgExists) {
                    console.warn(`Attempted to update non-existent organization: ${orgId}`);
                    return prev;
                }
                return prev.map((org) => (org.id === orgId ? { ...org, ...updates } : org));
            });
        }
        catch (error) {
            console.error('Error updating external organization:', error);
        }
    };
    const removeExternalOrganization = (orgId) => {
        setExternalOrganizations((prev) => prev.filter((org) => org.id !== orgId));
    };
    const handleOrgFileUpload = async (orgId, file) => {
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
        }
        catch (error) {
            console.error('Error reading image file:', error);
            alert('Failed to read the selected image file.');
        }
    };
    // External organization drag/resize handlers
    const handleOrgPointerMove = useCallback((event) => {
        const state = orgDragStateRef.current;
        const map = mapRef.current;
        if (!state || !map || !map.getContainer())
            return;
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
            }
            else if (state.mode === "resize") {
                const newWidth = Math.max(120, state.startWidth + dx);
                const newHeight = Math.max(80, state.startHeight + dy);
                updateExternalOrganization(state.id, {
                    width: newWidth,
                    height: newHeight,
                });
            }
            else if (state.mode === "image-resize") {
                const newImageHeight = Math.max(50, Math.min(200, state.startImageHeight + dy));
                updateExternalOrganization(state.id, {
                    imageHeight: newImageHeight,
                });
            }
        }
        catch (error) {
            console.warn('Error during organization drag/resize:', error);
        }
    }, []);
    const handleOrgPointerUp = useCallback(() => {
        orgDragStateRef.current = null;
        setDraggingOrg(null);
        window.removeEventListener("pointermove", handleOrgPointerMove);
        window.removeEventListener("pointerup", handleOrgPointerUp);
    }, [handleOrgPointerMove]);
    const startOrgDrag = useCallback((orgId, event) => {
        try {
            event.preventDefault();
            event.stopPropagation();
            const org = externalOrganizations.find(o => o.id === orgId);
            if (!org || !mapRef.current || !mapRef.current.getContainer())
                return;
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
        }
        catch (error) {
            console.warn('Error starting organization drag:', error);
        }
    }, [externalOrganizations, handleOrgPointerMove, handleOrgPointerUp]);
    const startOrgResize = useCallback((orgId, event) => {
        try {
            event.preventDefault();
            event.stopPropagation();
            const org = externalOrganizations.find(o => o.id === orgId);
            if (!org || !mapRef.current || !mapRef.current.getContainer())
                return;
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
        }
        catch (error) {
            console.warn('Error starting organization resize:', error);
        }
    }, [externalOrganizations, handleOrgPointerMove, handleOrgPointerUp]);
    const startOrgImageResize = useCallback((orgId, event) => {
        try {
            event.preventDefault();
            event.stopPropagation();
            const org = externalOrganizations.find(o => o.id === orgId);
            if (!org || !mapRef.current || !mapRef.current.getContainer())
                return;
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
        }
        catch (error) {
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
        const onKey = (e) => {
            if (showTitle && e.key === "Enter") {
                e.preventDefault();
                setShowTitle(false);
            }
            else if (!showTitle && e.key === "Escape") {
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
        if (!map || !map.getContainer())
            return;
        const handleMapUpdate = () => {
            try {
                // Force re-render by updating a dummy state
                setDraggingOrg(prev => prev);
            }
            catch (error) {
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
    return (_jsx("div", { className: "app-shell", children: _jsxs("section", { className: "app-map-area", children: [_jsx("div", { ref: mapElRef, className: "map-surface" }), _jsx("canvas", { ref: fogCanvasRef, className: "map-fog" }), mapReady && mapRef.current && externalOrganizations.map((org) => {
                    const map = mapRef.current;
                    if (!map || !map.getContainer())
                        return null;
                    try {
                        const point = map.latLngToContainerPoint([org.position.lat, org.position.lng]);
                        const isDragging = draggingOrg === org.id && orgDragStateRef.current?.mode === "drag";
                        const isResizing = draggingOrg === org.id && orgDragStateRef.current?.mode === "resize";
                        const isImageResizing = draggingOrg === org.id && orgDragStateRef.current?.mode === "image-resize";
                        return (_jsxs("div", { className: [
                                "external-org-box",
                                isDragging ? "dragging" : "",
                                isResizing ? "resizing" : "",
                                isImageResizing ? "resizing" : ""
                            ].filter(Boolean).join(" "), style: {
                                left: Math.max(0, point.x - org.width / 2),
                                top: Math.max(0, point.y - org.height / 2),
                                width: org.width,
                                height: org.height,
                                borderColor: org.color + "66", // Add transparency
                            }, onPointerDown: (e) => {
                                const target = e.target;
                                if (!target.closest('.external-org-resize-handle') && !target.closest('.external-org-remove')) {
                                    startOrgDrag(org.id, e);
                                }
                            }, children: [_jsxs("div", { className: "external-org-header", style: { backgroundColor: org.color + "33" }, children: [_jsx("span", { title: org.name, children: org.name }), _jsx("button", { className: "external-org-remove", onClick: (e) => {
                                                e.stopPropagation();
                                                removeExternalOrganization(org.id);
                                            }, title: "Remove organization", children: "\u2715" })] }), _jsxs("div", { className: "external-org-content", children: [_jsxs("div", { className: "external-org-picture-container", style: { height: org.imageHeight || 60 }, children: [org.picture ? (_jsx("img", { src: org.picture, alt: org.name, className: "external-org-picture", draggable: false, onError: (e) => {
                                                        // Hide image if it fails to load and show placeholder
                                                        const img = e.target;
                                                        img.style.display = 'none';
                                                        const container = img.parentElement;
                                                        if (container) {
                                                            container.innerHTML = '<div class="external-org-picture-placeholder">Image failed to load</div>';
                                                        }
                                                    } })) : (_jsx("div", { className: "external-org-picture-placeholder", children: org.name.charAt(0).toUpperCase() })), _jsx("div", { className: "external-org-image-resize-handle", title: "Resize image height", onPointerDown: (e) => startOrgImageResize(org.id, e), children: "\u22EE" })] }), org.notes && (_jsx("div", { className: "external-org-notes", children: org.notes }))] }), _jsx("div", { className: "external-org-resize-handle", onPointerDown: (e) => startOrgResize(org.id, e), title: "Resize organization" })] }, org.id));
                    }
                    catch (error) {
                        console.warn('Error rendering organization box:', error);
                        return null;
                    }
                }), showTimerOverlay && (_jsx(OverlayPanel, { id: "timer", title: "Phase Timer", layout: overlayLayouts.timer, minimized: overlayLayouts.timer.minimized, interaction: activeInteraction, onFocus: focusOverlay, onStartDrag: startDrag, onStartResize: startResize, onToggleMinimize: toggleOverlayMinimize, onReset: resetOverlayLayout, registerRef: setOverlayRef, allowResize: false, className: "timer-panel", showHeader: false, children: _jsxs("div", { className: "hud-timer", children: [_jsxs("div", { className: ["hud-timer-value", seconds < 60 && running && seconds % 2 === 0 ? "hud-timer-value-alert" : ""].filter(Boolean).join(" "), onClick: handleTimerToggle, onKeyDown: handleTimerKeyDown, role: "button", tabIndex: 0, "aria-pressed": running, title: running ? "Pause timer" : "Start timer", children: [Math.floor(seconds / 60), ":", String(seconds % 60).padStart(2, '0')] }), _jsxs("div", { className: "hud-timer-phase-row", children: [_jsx("button", { type: "button", className: "hud-timer-phase-btn", onClick: (event) => {
                                            event.stopPropagation();
                                            prevPhase();
                                        }, children: "\u2039" }), _jsx("span", { className: "hud-timer-subtext", children: PHASES[phaseIndex] }), _jsx("button", { type: "button", className: "hud-timer-phase-btn", onClick: (event) => {
                                            event.stopPropagation();
                                            nextPhase();
                                        }, children: "\u203A" })] }), _jsx("div", { className: "hud-timer-subtext", children: formatGameDate(gameDate) })] }) })), showInterestOverlay && (_jsx(OverlayPanel, { id: "interest", title: "National Interest Track", layout: overlayLayouts.interest, minimized: overlayLayouts.interest.minimized, interaction: activeInteraction, onFocus: focusOverlay, onStartDrag: startDrag, onStartResize: startResize, onToggleMinimize: toggleOverlayMinimize, onReset: resetOverlayLayout, registerRef: setOverlayRef, headerExtra: (_jsxs("label", { className: "overlay-level-control", children: ["Levels", _jsx("input", { type: "number", min: 1, value: interestLevelCount, onChange: (event) => setInterestLevelCount(Math.max(1, parseInt(event.target.value || "1", 10))) })] })), children: _jsx(NationalInterestTrack, { levels: interestLevelCount, participants: participants, positions: nationalInterests, onMove: adjustNationalInterest }) })), !showTitle && showPlayerAssignmentButton && (_jsx("button", { type: "button", className: "player-assignment-toggle", onClick: () => setShowPlayerAssignment((prev) => !prev), "aria-expanded": showPlayerAssignment, children: "\uD83D\uDC65 Player Assignment" })), showPlayerAssignment && !showTitle && (_jsxs("div", { className: "player-assignment-panel", children: [_jsxs("div", { className: "player-assignment-header", children: [_jsx("h3", { className: "player-assignment-title", children: "Player Assignment" }), _jsx("button", { type: "button", className: "player-assignment-close", onClick: () => setShowPlayerAssignment(false), children: "\u00D7" })] }), _jsxs("div", { className: "player-assignment-content", children: [selectedCountry && (_jsxs("div", { className: "player-assignment-section", children: [_jsx("div", { className: "player-assignment-section-title", children: "Selected Country" }), _jsx("div", { className: "selected-country-display", children: _jsx("span", { className: "selected-country-name", children: selectedCountry }) })] })), _jsxs("div", { className: "player-assignment-section", children: [_jsx("div", { className: "player-assignment-section-header", children: _jsx("div", { className: "player-assignment-section-title", children: "External Organizations" }) }), _jsxs("div", { className: "mb-3", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("input", { value: newOrgName, onChange: (e) => setNewOrgName(e.target.value), placeholder: "Organization name", className: "w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" }), _jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "text-xs opacity-80", children: "Organization Picture:" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "file", accept: "image/jpeg,image/jpg,image/png,image/gif,image/webp", onChange: (e) => {
                                                                                const file = e.target.files?.[0];
                                                                                if (file) {
                                                                                    setNewOrgPictureFile(file);
                                                                                    setNewOrgPicture(""); // Clear URL when file is selected
                                                                                }
                                                                                else {
                                                                                    setNewOrgPictureFile(null);
                                                                                }
                                                                            }, className: "hidden", id: "org-file-input" }), _jsx("label", { htmlFor: "org-file-input", className: [
                                                                                "flex-1 rounded px-2 py-1 text-xs cursor-pointer transition-colors text-center file-upload-label",
                                                                                newOrgPictureFile ? "file-upload-selected" : "bg-white/10 border-white/10"
                                                                            ].join(" "), children: newOrgPictureFile ? `📁 ${newOrgPictureFile.name}` : '📁 Choose Image File' }), newOrgPictureFile && (_jsx("button", { onClick: () => {
                                                                                setNewOrgPictureFile(null);
                                                                                const fileInput = document.getElementById('org-file-input');
                                                                                if (fileInput)
                                                                                    fileInput.value = '';
                                                                            }, className: "button-ghost text-xs", title: "Clear selected file", children: "\u2715" }))] }), !newOrgPictureFile && (_jsxs(_Fragment, { children: [_jsx("div", { className: "text-xs opacity-60 text-center", children: "or" }), _jsx("input", { value: newOrgPicture, onChange: (e) => setNewOrgPicture(e.target.value), placeholder: "Picture URL (optional)", className: "w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" })] }))] }), _jsx("textarea", { value: newOrgNotes, onChange: (e) => setNewOrgNotes(e.target.value), placeholder: "Notes (optional)", className: "w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" }), _jsxs("div", { className: "flex gap-2 items-center", children: [_jsx("input", { type: "color", value: newOrgColor, onChange: (e) => setNewOrgColor(e.target.value), className: "w-8 h-8 rounded border border-white/10" }), _jsx("button", { onClick: addExternalOrganization, disabled: !newOrgName.trim(), className: "button-primary text-xs flex-1", children: "Add External Organization" })] })] }), externalOrganizations.length > 0 && (_jsx("div", { className: "mt-3 space-y-1", children: externalOrganizations.map((org) => (_jsxs("div", { className: "flex items-center gap-2 py-1 px-2 bg-white/5 rounded text-xs", children: [_jsx("span", { className: "w-3 h-3 rounded-full", style: { background: org.color } }), _jsx("span", { className: "flex-1", children: org.name }), _jsx("button", { onClick: () => removeExternalOrganization(org.id), className: "button-ghost text-xs", title: `Remove ${org.name}`, children: "\u2715" })] }, org.id))) }))] })] }), _jsxs("div", { className: "player-assignment-section", children: [_jsxs("div", { className: "player-assignment-section-header", children: [_jsx("div", { className: "player-assignment-section-title", children: "Players" }), _jsx("button", { onClick: addPlayer, className: "button-primary text-xs", children: "+ Add Player" })] }), _jsx("div", { className: "player-assignment-players", children: players.length === 0 ? (_jsx("div", { className: "player-assignment-empty", children: _jsx("span", { className: "text-xs opacity-70", children: "No players added yet" }) })) : (players.map((p) => (_jsxs("div", { className: "player-assignment-player", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("span", { className: "w-3 h-3 rounded-full", style: { background: p.color } }), _jsx("input", { value: p.name, onChange: (e) => renamePlayer(p.id, e.target.value), className: "flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs", placeholder: "Player name" }), _jsx("button", { onClick: () => removePlayer(p.id), className: "button-ghost text-xs", title: `Remove ${p.name}`, children: "\u2715" })] }), _jsxs("div", { className: "player-assignment-controls", children: [_jsx("button", { onClick: () => assignSelectedTo(p.id), disabled: !selectedCountry, className: "button-soft text-xs", title: selectedCountry ? `Assign ${selectedCountry} to ${p.name}` : "Select a country first", children: "Assign Selected" }), Object.keys(PRESET_GROUPS).map((group) => (_jsx("button", { onClick: () => assignGroupToPlayer(group, p.id), className: "button-ghost text-xs", title: `Assign ${group} countries to ${p.name}`, children: group }, group)))] }), _jsxs("div", { className: "bulk-assignment", children: [_jsx("textarea", { id: `player-assignment-bulk-${p.id}`, placeholder: "Countries separated by commas or new lines", className: "w-full h-16 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs mb-1" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { id: `player-assignment-label-${p.id}`, type: "text", placeholder: "Optional: rename player", className: "flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" }), _jsx("button", { onClick: () => {
                                                                            const textarea = document.getElementById(`player-assignment-bulk-${p.id}`);
                                                                            const labelInput = document.getElementById(`player-assignment-label-${p.id}`);
                                                                            if (!textarea)
                                                                                return;
                                                                            const countries = textarea.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
                                                                            if (countries.length) {
                                                                                assignCountriesToPlayer(countries, p.id);
                                                                                if (labelInput.value.trim()) {
                                                                                    renamePlayer(p.id, labelInput.value.trim());
                                                                                }
                                                                                textarea.value = "";
                                                                                labelInput.value = "";
                                                                            }
                                                                        }, className: "button-soft text-xs", children: "Assign List" })] })] })] }, p.id)))) })] })] })] })), showMapLockButton && (_jsx("button", { type: "button", className: "map-lock-toggle", onClick: () => setMapLocked((prev) => !prev), "aria-pressed": mapLocked, children: mapLocked ? "Unlock Map" : "Lock Map" })), !showTitle && showRoundIndicator && (_jsxs("div", { className: "hud-round", children: [_jsx("button", { type: "button", className: "hud-round-btn", onClick: rewindTime, disabled: roundNumber <= 1, children: "\u2039" }), _jsxs("div", { className: "hud-round-label", children: ["Round ", roundNumber] }), _jsx("button", { type: "button", className: "hud-round-btn", onClick: advanceTime, children: "\u203A" })] })), showTitle && (_jsx("div", { className: "title-overlay", children: _jsxs("div", { className: "overlay-card", children: [_jsxs("div", { className: "space-y-1 text-center", children: [_jsx("h2", { className: "text-3xl font-bold tracking-tight", children: "Geopolitics: Adjudicator" }), _jsx("p", { className: "text-sm opacity-80", children: "A world-map sandbox for team-based grand strategy sessions." })] }), _jsxs("div", { className: "grid gap-2", children: [_jsx("button", { onClick: () => setShowTitle(false), className: "h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 shadow", children: "Start" }), _jsx("button", { onClick: startNewGame, className: "h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10", children: "New Game" }), _jsx("button", { onClick: () => setShowSettings(true), className: "h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10", children: "Settings" })] }), _jsxs("div", { className: "grid-columns-two text-xs", children: [_jsxs("div", { className: "rounded-xl border border-white/10 p-3", style: { background: "rgba(0,0,0,0.2)", borderRadius: "16px" }, children: [_jsx("div", { className: "font-semibold mb-1", children: "Controls" }), _jsxs("ul", { className: "space-y-1 opacity-80 list-disc list-inside", children: [_jsx("li", { children: "Click a country to select." }), _jsx("li", { children: "Assign players via Pause Menu \u2192 Settings." }), _jsx("li", { children: "Esc opens Pause Menu." }), _jsx("li", { children: "Enter closes this screen." })] })] }), _jsxs("div", { className: "rounded-xl border border-white/10 p-3", style: { background: "rgba(0,0,0,0.2)", borderRadius: "16px" }, children: [_jsx("div", { className: "font-semibold mb-1", children: "Session Tips" }), _jsxs("ul", { className: "space-y-1 opacity-80 list-disc list-inside", children: [_jsx("li", { children: "Rename players to faction/country names." }), _jsx("li", { children: "Tune phase timers before starting." })] })] })] }), _jsx("div", { className: "text-center text-xs opacity-70", children: "v0.3" })] }) })), showPauseMenu && !showTitle && (_jsx("div", { className: "pause-overlay", children: _jsxs("div", { className: "overlay-card", style: { width: "min(420px, 90%)" }, children: [_jsx("div", { className: "text-lg font-bold", children: "Paused" }), _jsxs("div", { className: "grid gap-2", children: [_jsx("button", { onClick: () => setShowPauseMenu(false), className: "h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10", children: "Resume" }), _jsx("button", { onClick: startNewGame, className: "h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10", children: "Start New Game" }), _jsx("button", { onClick: () => setShowSettings(true), className: "h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10", children: "Settings" }), _jsx("button", { onClick: () => setShowTitle(true), className: "h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10", children: "Back to Title" })] }), _jsxs("div", { className: "text-xs opacity-70", children: ["Tip: You can open this menu anytime with ", _jsx("span", { className: "font-semibold", children: "Esc" }), "."] })] }) })), showSettings && (() => {
                    console.log('Settings modal should be showing now!');
                    return (_jsx("div", { className: "pause-overlay", children: _jsxs("div", { className: "overlay-card", style: { width: "min(800px, 95%)", maxHeight: "90vh", overflow: "auto" }, children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h2", { className: "text-xl font-bold", children: "Settings" }), _jsx("button", { onClick: () => setShowSettings(false), className: "text-2xl hover:opacity-70", children: "\u00D7" })] }), _jsx("div", { style: { color: 'white', padding: '20px', background: 'red' }, children: "TEST CONTENT - If you can see this, the modal is rendering!" }), _jsxs("div", { className: "space-y-6", children: [_jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsx("div", { className: "flex items-center justify-between mb-3", children: _jsx("h3", { className: "text-lg font-semibold", children: "Phase Control" }) }), _jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx("span", { className: "text-sm opacity-80", children: "Current Phase:" }), _jsx("span", { className: "font-medium", children: PHASES[phaseIndex] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: prevPhase, className: "button-soft", children: "Previous" }), _jsx("button", { onClick: nextPhase, className: "button-soft", children: "Next" })] })] }), _jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h3", { className: "text-lg font-semibold", children: "Players" }), _jsx("button", { onClick: addPlayer, className: "button-primary", children: "+ Add Player" })] }), _jsx("div", { className: "space-y-3", children: players.map((p) => (_jsxs("div", { className: "border border-white/5 rounded p-3", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("span", { className: "w-4 h-4 rounded-full", style: { background: p.color } }), _jsx("input", { value: p.name, onChange: (e) => renamePlayer(p.id, e.target.value), className: "flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm" })] }), (() => {
                                                                const pool = playerTokens[p.id] ?? { allowance: DEFAULT_PLAYER_TOKENS, available: DEFAULT_PLAYER_TOKENS };
                                                                return (_jsxs("div", { className: "token-controls text-xs", children: [_jsxs("span", { className: "pill", children: ["Tokens ", pool.available, "/", pool.allowance] }), _jsx("button", { onClick: () => adjustPlayerTokens(p.id, -1), className: "button-ghost", disabled: pool.available <= 0, children: "Spend" }), _jsx("button", { onClick: () => adjustPlayerTokens(p.id, 1), className: "button-ghost", disabled: pool.available >= pool.allowance, children: "Refund" }), _jsxs("label", { className: "label-inline", children: ["Allowance", _jsx("input", { type: "number", min: 0, value: pool.allowance, onChange: (e) => setPlayerAllowance(p.id, parseInt(e.target.value || "0", 10)), className: "w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5" })] })] }));
                                                            })(), _jsxs("div", { className: "flex gap-2 mt-2", children: [_jsx("button", { onClick: () => assignSelectedTo(p.id), disabled: !selectedCountry, className: "button-soft text-xs", children: "Assign selected" }), Object.keys(PRESET_GROUPS).map((g) => (_jsx("button", { onClick: () => assignGroupToPlayer(g, p.id), className: "button-ghost text-xs", children: g }, g)))] }), _jsxs("div", { className: "mt-2", children: [_jsx("textarea", { id: `bulk-${p.id}`, placeholder: "Countries separated by commas or new lines", className: "w-full h-16 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" }), _jsxs("div", { className: "token-controls mt-1", children: [_jsx("input", { id: `label-${p.id}`, type: "text", placeholder: "Optional label (renames player)", className: "flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" }), _jsx("button", { onClick: () => {
                                                                                    const textarea = document.getElementById(`bulk-${p.id}`);
                                                                                    const labelInput = document.getElementById(`label-${p.id}`);
                                                                                    const countries = textarea.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
                                                                                    if (countries.length) {
                                                                                        assignCountriesToPlayer(countries, p.id);
                                                                                        if (labelInput.value.trim()) {
                                                                                            renamePlayer(p.id, labelInput.value.trim());
                                                                                        }
                                                                                        textarea.value = "";
                                                                                        labelInput.value = "";
                                                                                    }
                                                                                }, className: "button-soft text-xs", children: "Assign list" })] })] })] }, p.id))) })] }), _jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsx("h3", { className: "text-lg font-semibold mb-3", children: "Scenario Tools" }), _jsxs("div", { className: "space-y-3 text-xs", children: [_jsxs("div", { className: "token-controls", children: [_jsx("span", { className: "label-inline", children: "Initial outbreak" }), _jsx("span", { className: "pill", children: initialOutbreak ?? "Pending" }), _jsx("button", { onClick: rollInitialOutbreak, className: "button-ghost", children: "Randomize Selected" }), outbreakRoll !== null && _jsxs("span", { children: ["Roll: ", outbreakRoll] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "label-inline", children: "Eligible countries" }), _jsx("div", { className: "outbreak-grid", children: availableOutbreakCountries.map((location) => (_jsxs("label", { className: "outbreak-option", children: [_jsx("input", { type: "checkbox", checked: selectedOutbreakCandidates.includes(location), onChange: (e) => {
                                                                                    if (e.target.checked) {
                                                                                        setSelectedOutbreakCandidates([...selectedOutbreakCandidates, location]);
                                                                                    }
                                                                                    else {
                                                                                        setSelectedOutbreakCandidates(selectedOutbreakCandidates.filter(c => c !== location));
                                                                                    }
                                                                                } }), location] }, location))) }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "button-ghost", onClick: () => setSelectedOutbreakCandidates(availableOutbreakCountries), children: "Select All" }), _jsx("button", { type: "button", className: "button-ghost", onClick: () => setSelectedOutbreakCandidates([]), children: "Clear" })] })] }), _jsxs("div", { className: "token-controls", children: [_jsx("label", { className: "label-inline", htmlFor: "manual-outbreak-select", children: "Manual set" }), _jsxs("select", { id: "manual-outbreak-select", value: manualOutbreakChoice, onChange: (event) => setManualOutbreakChoice(event.target.value), className: "px-2 py-1 rounded bg-white/10 border border-white/10", children: [_jsx("option", { value: "", children: "Select country\u2026" }), availableOutbreakCountries.map((location) => (_jsx("option", { value: location, children: location }, location)))] }), _jsx("button", { onClick: () => {
                                                                        if (manualOutbreakChoice) {
                                                                            setInitialOutbreak(manualOutbreakChoice);
                                                                            setManualOutbreakChoice("");
                                                                        }
                                                                    }, disabled: !manualOutbreakChoice, className: "button-ghost", children: "Set" })] }), _jsxs("div", { className: "token-controls", children: [_jsx("span", { className: "label-inline", children: "Vaccine progress" }), _jsxs("span", { className: "pill", children: [vaccineProgress, "/", VACCINE_TRACK_MAX] }), _jsx("button", { onClick: () => adjustVaccineProgress(1), className: "button-soft", disabled: vaccineProgress >= VACCINE_TRACK_MAX, children: "+1" }), _jsx("button", { onClick: () => adjustVaccineProgress(-1), className: "button-ghost", disabled: vaccineProgress <= 0, children: "-1" })] }), _jsx("button", { onClick: resetAllOverlayLayouts, className: "button-ghost", children: "Reset HUD layout" })] })] }), selectedCountry && (_jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsxs("h3", { className: "text-lg font-semibold mb-3", children: ["Territory: ", selectedCountry] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm font-semibold mb-2", children: "Owners" }), selectedOwnerDetails.length > 0 ? (_jsxs("div", { className: "space-y-1", children: [selectedOwnerDetails.map((owner) => (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-3 h-3 rounded-full", style: { background: owner.color } }), _jsx("span", { className: "flex-1", children: owner.name }), _jsx("button", { onClick: () => removePlayerFromCountry(selectedCountry, owner.id), className: "button-ghost text-xs", children: "Remove" })] }, owner.id))), _jsx("button", { onClick: () => clearCountryOwners(selectedCountry), className: "button-ghost text-xs", children: "Clear all" })] })) : (_jsx("div", { className: "text-xs opacity-70", children: "No owners assigned." }))] }), _jsxs("div", { className: "token-controls", children: [_jsx("span", { className: "label-inline", children: "Country tokens" }), _jsx("span", { className: "pill", children: (() => {
                                                                        const pool = countryTokens[selectedCountry] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
                                                                        return `${pool.available}/${pool.allowance}`;
                                                                    })() }), _jsx("button", { onClick: () => adjustCountryTokens(selectedCountry, -1), className: "button-ghost", disabled: (() => {
                                                                        const pool = countryTokens[selectedCountry] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
                                                                        return pool.available <= 0;
                                                                    })(), children: "Spend" }), _jsx("button", { onClick: () => adjustCountryTokens(selectedCountry, 1), className: "button-ghost", disabled: (() => {
                                                                        const pool = countryTokens[selectedCountry] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
                                                                        return pool.available >= pool.allowance;
                                                                    })(), children: "Refund" }), _jsxs("label", { className: "label-inline", children: ["Allowance", _jsx("input", { type: "number", min: 0, value: (() => {
                                                                                const pool = countryTokens[selectedCountry] ?? { allowance: DEFAULT_COUNTRY_TOKENS, available: DEFAULT_COUNTRY_TOKENS };
                                                                                return pool.allowance;
                                                                            })(), onChange: (e) => setCountryAllowance(selectedCountry, parseInt(e.target.value || "0", 10)), className: "w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5" })] })] })] })] })), selectedCountry && (_jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsx("div", { className: "flex items-center justify-between mb-3", children: _jsxs("h3", { className: "text-lg font-semibold", children: ["Local Actors - ", selectedCountry] }) }), _jsxs("div", { className: "space-y-3", children: [selectedCountryActors.map((actor) => (_jsxs("div", { className: "border border-white/5 rounded p-3", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("input", { type: "color", value: actor.color, onChange: (e) => updateLocalActor(selectedCountry, actor.id, { color: e.target.value }), className: "w-6 h-6 rounded border border-white/10" }), _jsx("input", { value: actor.name, onChange: (e) => updateLocalActor(selectedCountry, actor.id, { name: e.target.value }), className: "flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm" }), _jsx("button", { onClick: () => removeLocalActor(selectedCountry, actor.id), className: "button-ghost text-xs", children: "Remove" })] }), _jsx("textarea", { value: actor.notes, onChange: (e) => updateLocalActor(selectedCountry, actor.id, { notes: e.target.value }), placeholder: "Notes...", className: "w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" }), (() => {
                                                                    const pool = actorTokens[actor.id] ?? { allowance: DEFAULT_ACTOR_TOKENS, available: DEFAULT_ACTOR_TOKENS };
                                                                    return (_jsxs("div", { className: "token-controls token-controls-small", children: [_jsxs("span", { className: "pill", children: [pool.available, "/", pool.allowance] }), _jsx("button", { onClick: () => adjustActorTokens(actor.id, -1), className: "button-ghost", disabled: pool.available <= 0, children: "Spend" }), _jsx("button", { onClick: () => adjustActorTokens(actor.id, 1), className: "button-ghost", disabled: pool.available >= pool.allowance, children: "Refund" }), _jsxs("label", { className: "label-inline", children: ["Allowance", _jsx("input", { type: "number", min: 0, value: pool.allowance, onChange: (e) => setActorAllowance(actor.id, parseInt(e.target.value || "0", 10)), className: "w-14 bg-white/10 border border-white/10 rounded px-1 py-0.5" })] })] }));
                                                                })()] }, actor.id))), _jsxs("div", { className: "border border-white/5 rounded p-3 bg-white/5", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("input", { type: "color", value: newActorColor, onChange: (e) => setNewActorColor(e.target.value), className: "w-6 h-6 rounded border border-white/10" }), _jsx("input", { value: newActorName, onChange: (e) => setNewActorName(e.target.value), placeholder: "New actor name", className: "flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm" }), _jsx("button", { onClick: addLocalActor, className: "button-soft text-xs", disabled: !newActorName.trim(), children: "Add" })] }), _jsx("textarea", { value: newActorNotes, onChange: (e) => setNewActorNotes(e.target.value), placeholder: "Notes...", className: "w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" })] })] })] })), _jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsx("div", { className: "flex items-center justify-between mb-3", children: _jsx("h3", { className: "text-lg font-semibold", children: "External Organizations" }) }), _jsxs("div", { className: "space-y-3", children: [externalOrganizations.map((org) => (_jsxs("div", { className: "border border-white/5 rounded p-3", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("input", { type: "color", value: org.color, onChange: (e) => updateExternalOrganization(org.id, { color: e.target.value }), className: "w-6 h-6 rounded border border-white/10" }), _jsx("input", { value: org.name, onChange: (e) => updateExternalOrganization(org.id, { name: e.target.value }), className: "flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm" }), _jsx("button", { onClick: () => removeExternalOrganization(org.id), className: "button-ghost text-xs", children: "Remove" })] }), _jsxs("div", { className: "mb-2", children: [_jsx("div", { className: "text-xs opacity-80 mb-1", children: "Organization Picture:" }), _jsxs("div", { className: "flex gap-2 mb-2", children: [_jsx("input", { type: "file", accept: "image/jpeg,image/jpg,image/png,image/gif,image/webp", onChange: (e) => {
                                                                                        const file = e.target.files?.[0];
                                                                                        if (file) {
                                                                                            handleOrgFileUpload(org.id, file);
                                                                                        }
                                                                                        // Clear the input so the same file can be selected again
                                                                                        e.target.value = '';
                                                                                    }, className: "hidden", id: `org-edit-file-input-${org.id}` }), _jsx("label", { htmlFor: `org-edit-file-input-${org.id}`, className: "flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs cursor-pointer transition-colors text-center file-upload-label", children: "\uD83D\uDCC1 Upload New Image" }), org.picture && (_jsx("button", { onClick: () => updateExternalOrganization(org.id, { picture: undefined, pictureFile: undefined }), className: "button-ghost text-xs", title: "Remove current image", children: "\u2715" }))] }), _jsx("input", { value: org.picture?.startsWith('data:') ? '' : (org.picture || ""), onChange: (e) => updateExternalOrganization(org.id, { picture: e.target.value || undefined }), placeholder: "Or paste image URL...", className: "w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs", disabled: org.picture?.startsWith('data:') }), org.picture?.startsWith('data:') && (_jsxs("div", { className: "text-xs opacity-60 mt-1", children: ["Uploaded file: ", org.pictureFile?.name || 'Unknown file'] }))] }), _jsx("textarea", { value: org.notes, onChange: (e) => updateExternalOrganization(org.id, { notes: e.target.value }), placeholder: "Notes...", className: "w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" }), _jsx("div", { className: "flex gap-2 mt-2 text-xs", children: _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { children: "Size:" }), _jsx("input", { type: "number", value: org.width, onChange: (e) => updateExternalOrganization(org.id, { width: Math.max(120, parseInt(e.target.value || "200", 10)) }), className: "w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5", min: "120" }), _jsx("span", { children: "\u00D7" }), _jsx("input", { type: "number", value: org.height, onChange: (e) => updateExternalOrganization(org.id, { height: Math.max(80, parseInt(e.target.value || "150", 10)) }), className: "w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5", min: "80" })] }) })] }, org.id))), _jsxs("div", { className: "border border-white/5 rounded p-3 bg-white/5", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("input", { type: "color", value: newOrgColor, onChange: (e) => setNewOrgColor(e.target.value), className: "w-6 h-6 rounded border border-white/10" }), _jsx("input", { value: newOrgName, onChange: (e) => setNewOrgName(e.target.value), placeholder: "New organization name", className: "flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm" }), _jsx("button", { onClick: addExternalOrganization, className: "button-soft text-xs", disabled: !newOrgName.trim(), children: "Add" })] }), _jsxs("div", { className: "mb-2", children: [_jsx("div", { className: "text-xs opacity-80 mb-1", children: "Organization Picture:" }), _jsxs("div", { className: "flex gap-2 mb-2", children: [_jsx("input", { type: "file", accept: "image/jpeg,image/jpg,image/png,image/gif,image/webp", onChange: (e) => {
                                                                                        const file = e.target.files?.[0];
                                                                                        if (file) {
                                                                                            setNewOrgPictureFile(file);
                                                                                            setNewOrgPicture(""); // Clear URL when file is selected
                                                                                        }
                                                                                        else {
                                                                                            setNewOrgPictureFile(null);
                                                                                        }
                                                                                    }, className: "hidden", id: "settings-org-file-input" }), _jsx("label", { htmlFor: "settings-org-file-input", className: [
                                                                                        "flex-1 rounded px-2 py-1 text-xs cursor-pointer transition-colors text-center file-upload-label",
                                                                                        newOrgPictureFile ? "file-upload-selected" : "bg-white/10 border-white/10"
                                                                                    ].join(" "), children: newOrgPictureFile ? `📁 ${newOrgPictureFile.name}` : '📁 Choose Image File' }), newOrgPictureFile && (_jsx("button", { onClick: () => {
                                                                                        setNewOrgPictureFile(null);
                                                                                        const fileInput = document.getElementById('settings-org-file-input');
                                                                                        if (fileInput)
                                                                                            fileInput.value = '';
                                                                                    }, className: "button-ghost text-xs", title: "Clear selected file", children: "\u2715" }))] }), !newOrgPictureFile && (_jsxs(_Fragment, { children: [_jsx("div", { className: "text-xs opacity-60 text-center mb-1", children: "or" }), _jsx("input", { value: newOrgPicture, onChange: (e) => setNewOrgPicture(e.target.value), placeholder: "Picture URL (optional)...", className: "w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" })] }))] }), _jsx("textarea", { value: newOrgNotes, onChange: (e) => setNewOrgNotes(e.target.value), placeholder: "Notes...", className: "w-full h-12 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" })] })] })] }), _jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsx("h3", { className: "text-lg font-semibold mb-3", children: "Dice" }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "token-controls", children: [_jsx("label", { className: "label-inline", htmlFor: "die-select-settings", children: "Sides" }), _jsx("select", { id: "die-select-settings", value: dieSides, onChange: (e) => setDieSides(parseInt(e.target.value, 10)), className: "px-2 py-1 rounded bg-white/10 border border-white/10", children: DIE_OPTIONS.map((sides) => (_jsxs("option", { value: sides, children: ["d", sides] }, sides))) }), _jsx("button", { onClick: rollDie, className: "button-primary", children: "Roll" })] }), lastRoll !== null && (_jsxs("div", { className: "text-lg font-bold", children: ["Result: ", lastRoll, " (d", dieSides, ")"] }))] })] }), _jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsx("h3", { className: "text-lg font-semibold mb-3", children: "Timeline" }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "text-sm", children: [_jsxs("span", { className: "font-medium", children: ["Round ", roundNumber, ":"] }), " ", formatGameDate(gameDate)] }), _jsxs("div", { className: "token-controls", children: [_jsx("label", { className: "label-inline", htmlFor: "time-advance-value-settings", children: "Advance by" }), _jsx("input", { id: "time-advance-value-settings", type: "number", min: 1, value: Number.isNaN(timeAdvanceValue) ? "" : timeAdvanceValue, onChange: (e) => {
                                                                        const nextValue = parseInt(e.target.value || "0", 10);
                                                                        setTimeAdvanceValue(Number.isNaN(nextValue) ? 1 : Math.max(1, nextValue));
                                                                    }, className: "w-16 bg-white/10 border border-white/10 rounded px-1 py-0.5" }), _jsxs("select", { value: timeAdvanceUnit, onChange: (e) => setTimeAdvanceUnit(e.target.value), className: "px-2 py-1 rounded bg-white/10 border border-white/10", children: [_jsx("option", { value: "days", children: "Days" }), _jsx("option", { value: "months", children: "Months" }), _jsx("option", { value: "years", children: "Years" })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: advanceTime, className: "button-soft", children: "Advance round" }), _jsx("button", { onClick: rewindTime, disabled: roundNumber <= 1, className: "button-ghost", children: "Rewind" })] }), _jsxs("div", { className: "token-controls", children: [_jsx("label", { className: "label-inline", htmlFor: "start-date-settings", children: "Start date" }), _jsx("input", { id: "start-date-settings", type: "date", value: startDateInput, onChange: (e) => setStartDateInput(e.target.value), className: "bg-white/10 border border-white/10 rounded px-2 py-1 text-xs" }), _jsx("button", { onClick: applyStartDate, className: "button-ghost", children: "Set" })] }), _jsx("div", { className: "text-xs opacity-70", children: "Time automatically advances when you loop past the final phase." })] })] }), _jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsx("h3", { className: "text-lg font-semibold mb-3", children: "UI Display Controls" }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: showPlayerAssignmentButton, onChange: (e) => setShowPlayerAssignmentButton(e.target.checked), className: "w-4 h-4" }), _jsx("span", { className: "text-sm", children: "Player Assignment Button" })] }), _jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: showTimerOverlay, onChange: (e) => setShowTimerOverlay(e.target.checked), className: "w-4 h-4" }), _jsx("span", { className: "text-sm", children: "Timer Overlay" })] }), _jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: showInterestOverlay, onChange: (e) => setShowInterestOverlay(e.target.checked), className: "w-4 h-4" }), _jsx("span", { className: "text-sm", children: "Interest Track" })] }), _jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: showRoundIndicator, onChange: (e) => setShowRoundIndicator(e.target.checked), className: "w-4 h-4" }), _jsx("span", { className: "text-sm", children: "Round Indicator" })] }), _jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: showMapLockButton, onChange: (e) => setShowMapLockButton(e.target.checked), className: "w-4 h-4" }), _jsx("span", { className: "text-sm", children: "Map Lock Button" })] })] }), _jsx("div", { className: "text-xs opacity-70", children: "Toggle which UI elements are visible on the screen" })] })] }), _jsxs("section", { className: "border border-white/10 rounded-lg p-4", children: [_jsx("h3", { className: "text-lg font-semibold mb-3", children: "Timer" }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "text-lg font-mono", children: [Math.floor(seconds / 60), ":", String(seconds % 60).padStart(2, '0')] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => setRunning(true), className: "button-soft", children: "Start" }), _jsx("button", { onClick: () => setRunning(false), className: "button-soft", children: "Pause" }), _jsx("button", { onClick: resetTimer, className: "button-ghost", children: "Reset" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "text-sm font-semibold mb-1", children: "Phase Durations" }), PHASES.map((ph, idx) => (_jsxs("div", { className: "flex items-center gap-2 text-xs", children: [_jsx("span", { className: "w-32 text-xs", children: ph }), _jsx("input", { type: "number", min: 0, value: Math.floor(phaseDurations[idx] / 60), onChange: (e) => setDurationForPhase(idx, parseInt(e.target.value || '0', 10), phaseDurations[idx] % 60), className: "w-12 bg-white/10 border border-white/10 rounded px-1 py-0.5" }), "m", _jsx("input", { type: "number", min: 0, max: 59, value: phaseDurations[idx] % 60, onChange: (e) => setDurationForPhase(idx, Math.floor(phaseDurations[idx] / 60), parseInt(e.target.value || '0', 10)), className: "w-12 bg-white/10 border border-white/10 rounded px-1 py-0.5" }), "s"] }, ph)))] })] })] })] })] }) }));
                })()] }) }));
}
