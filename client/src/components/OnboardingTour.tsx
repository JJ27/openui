import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  GitFork,
  Search,
  LayoutGrid,
  ArrowRight,
} from "lucide-react";

// --- Welcome Phase Data ---
const features = [
  {
    icon: RefreshCw,
    title: "Persist & Resume",
    desc: "Sessions survive restarts. Resume any agent right where you left off.",
    color: "#22C55E",
  },
  {
    icon: GitFork,
    title: "Fork Conversations",
    desc: "Branch an agent's conversation to explore different approaches.",
    color: "#8B5CF6",
  },
  {
    icon: Search,
    title: "Search History",
    desc: "Find any past session instantly with full-text search. Press Cmd+K.",
    color: "#3B82F6",
  },
  {
    icon: LayoutGrid,
    title: "Visual Canvas",
    desc: "Organize agents on a canvas. Use tabs for different projects.",
    color: "#F97316",
  },
];

// --- Tour Phase Data ---
interface TourStep {
  target: string;
  title: string;
  message: string;
  placement: "bottom" | "top" | "center";
}

const STEPS: TourStep[] = [
  {
    target: "new-agent",
    title: "Create an Agent",
    message:
      "Start here. Create a blank agent, pick a GitHub issue, or resume a past conversation.",
    placement: "bottom",
  },
  {
    target: "status-badges",
    title: "Live Status",
    message:
      "See all your agents at a glance. Green = working, orange = needs input, yellow = idle.",
    placement: "bottom",
  },
  {
    target: "canvas-tabs",
    title: "Workspaces",
    message:
      "Organize agents into canvases \u2014 one per project, feature, or team.",
    placement: "top",
  },
  {
    target: "canvas-area",
    title: "Your Canvas",
    message:
      "Agents appear as cards. Click to open the terminal. Right-click to fork or delete.",
    placement: "center",
  },
];

// --- Tooltip positioning ---
function getTooltipStyle(
  rect: DOMRect,
  placement: "bottom" | "top" | "center"
): React.CSSProperties {
  const pad = 12;
  const tooltipWidth = 296;
  const tooltipHeight = 160; // approximate

  // Center tooltip horizontally on the target
  let left = rect.left + rect.width / 2 - tooltipWidth / 2;
  // Clamp to viewport
  left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));

  if (placement === "bottom") {
    return { position: "fixed", top: rect.bottom + pad, left, width: tooltipWidth };
  }
  if (placement === "top") {
    // Place above the target, clamped so it doesn't go off-screen
    const top = Math.max(16, rect.top - pad - tooltipHeight);
    return { position: "fixed", top, left, width: tooltipWidth };
  }
  // "center" — centered within the target area
  const top = rect.top + rect.height / 2 - tooltipHeight / 2;
  return { position: "fixed", top, left, width: tooltipWidth };
}

type Phase = "welcome" | "tour";

export function OnboardingTour() {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Check server-side config on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((config) => {
        if (config.tourCompleted) return;
        setTimeout(() => setVisible(true), 400);
      })
      .catch(() => {});
  }, []);

  // Measure target element for current step; returns true if found
  const measureTarget = useCallback((target: string): boolean => {
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
      return true;
    }
    return false;
  }, []);

  // Re-measure on resize during tour phase
  useEffect(() => {
    if (phase !== "tour") return;
    const handler = () => measureTarget(STEPS[step].target);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [phase, step, measureTarget]);

  // Find the next step whose target element exists in the DOM
  const findNextVisible = (from: number): number => {
    for (let i = from; i < STEPS.length; i++) {
      if (document.querySelector(`[data-tour="${STEPS[i].target}"]`)) return i;
    }
    return -1; // no visible steps remaining
  };

  const startTour = () => {
    setPhase("tour");
    const first = findNextVisible(0);
    if (first === -1) { complete(); return; }
    setStep(first);
    measureTarget(STEPS[first].target);
  };

  const nextStep = () => {
    const next = findNextVisible(step + 1);
    if (next === -1) {
      complete();
    } else {
      setStep(next);
      measureTarget(STEPS[next].target);
    }
  };

  const complete = () => {
    setVisible(false);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourCompleted: true }),
    }).catch(() => {});
  };

  if (!visible) return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {phase === "welcome" ? (
        <motion.div
          key="welcome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ backgroundColor: "rgba(10, 10, 10, 0.97)" }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-md w-full px-6"
          >
            {/* Logo */}
            <div className="flex flex-col items-center mb-10">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 25 }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center mb-4 shadow-lg"
              >
                <div className="w-5 h-5 rounded-full bg-white" />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="text-2xl font-bold text-white tracking-tight"
              >
                OpenUI
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="text-sm text-zinc-400 mt-1"
              >
                Manage your Claude Code agents
              </motion.p>
            </div>

            {/* Feature cards 2x2 */}
            <div className="grid grid-cols-2 gap-3 mb-8">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.08 }}
                  className="rounded-xl bg-surface border border-border p-4 hover:border-zinc-600 transition-colors"
                >
                  <f.icon
                    className="w-5 h-5 mb-2"
                    style={{ color: f.color }}
                  />
                  <h3 className="text-xs font-semibold text-white mb-1">
                    {f.title}
                  </h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    {f.desc}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Get Started button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.button
                onClick={startTour}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white text-canvas text-sm font-semibold hover:bg-zinc-100 transition-colors shadow-lg"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </motion.button>
              <button
                onClick={complete}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Skip tour
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : targetRect ? (
        <motion.div
          key="tour"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60]"
          onClick={complete}
        >
          {/* Spotlight cutout */}
          <div
            style={{
              position: "fixed",
              left: targetRect.x - 8,
              top: targetRect.y - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
              borderRadius: 12,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.65)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
              pointerEvents: "none",
            }}
          />

          {/* Tooltip */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: STEPS[step].placement === "bottom" ? -8 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: STEPS[step].placement === "bottom" ? 8 : -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={getTooltipStyle(targetRect, STEPS[step].placement)}
              className="rounded-xl bg-surface border border-border shadow-2xl p-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Arrow */}
              {STEPS[step].placement === "bottom" && (
                <div
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-surface border-l border-t border-border"
                />
              )}

              <p className="text-[10px] text-zinc-600 mb-1 font-medium uppercase tracking-wider">
                {step + 1} / {STEPS.length}
              </p>
              <h3 className="text-sm font-semibold text-white mb-1">
                {STEPS[step].title}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {STEPS[step].message}
              </p>

              <div className="flex items-center justify-between mt-4">
                {/* Step dots */}
                <div className="flex gap-1.5">
                  {STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === step
                          ? "w-4 bg-white"
                          : i < step
                          ? "w-1.5 bg-zinc-500"
                          : "w-1.5 bg-zinc-700"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={complete}
                    className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    Skip
                  </button>
                  <motion.button
                    onClick={nextStep}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="px-3 py-1.5 rounded-md bg-white text-canvas text-xs font-semibold hover:bg-zinc-100 transition-colors"
                  >
                    {step === STEPS.length - 1 ? "Done" : "Next"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
