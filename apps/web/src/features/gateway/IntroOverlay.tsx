import { INTRO_SRC } from "./introConfig";

interface IntroOverlayProps {
  onFinish: () => void;
}

export function IntroOverlay({ onFinish }: IntroOverlayProps) {
  return (
    <div id="intro" role="dialog" aria-modal="true" aria-label="Trace intro">
      <video
        id="introVideo"
        muted
        playsInline
        autoPlay
        src={INTRO_SRC}
        onEnded={onFinish}
        onError={onFinish}
      />
      <button type="button" className="intro-skip" onClick={onFinish} aria-label="Skip intro">
        Skip
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 5l9 7-9 7V5zM19 5v14" />
        </svg>
      </button>
    </div>
  );
}
