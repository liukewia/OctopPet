import { windowCloseSide } from "../lib/platform";
import { hideCurrentWindow } from "../lib/tauriWindowApi";

export default function WindowCloseButton() {
  const side = windowCloseSide();

  return (
    <button
      type="button"
      className="window-close"
      data-close-side={side}
      aria-label="关闭"
      onClick={() => void hideCurrentWindow()}
    >
      <svg className="window-close-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
