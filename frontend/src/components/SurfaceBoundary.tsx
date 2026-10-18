import { Component, type ErrorInfo, type ReactNode } from "react";
import { t, type DictKey, type Lang } from "../i18n";

/** The box a failed surface leaves behind. Both boundaries render this one. */
export function SurfaceFailed({
  lang,
  subject,
  body,
  retry,
  origin,
  className,
  onRetry,
}: {
  lang: Lang;
  subject: DictKey;
  body: DictKey;
  retry: DictKey;
  origin: string;
  className: string;
  onRetry: () => void;
}) {
  return (
    <div className={`surface-failed ${className}`} role="alert" data-surface-failed={origin}>
      <p className="surface-failed-title">{t(lang, subject)}</p>
      <p className="surface-failed-body">{t(lang, body)}</p>
      <button type="button" onClick={onRetry} className="surface-failed-retry">
        {t(lang, retry)}
      </button>
    </div>
  );
}

interface Props {
  lang: Lang;
  /** what the reader lost, e.g. `surface.worldGone` */
  subject: DictKey;
  /** what still stands — differs per surface, see the two keys in the dict */
  body: DictKey;
  /** the verb has to fit the surface: a city is drawn, a card answers */
  retry: DictKey;
  /** where the error came from; kept out of the sentence, in the log */
  origin: string;
  /** the fallback wears the geometry of the surface it replaces */
  className: string;
  children?: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * One surface's failure ends at that surface.
 *
 * What this DOM boundary genuinely covers: a WebGL context the machine cannot
 * give, and anything that throws while the subtree is first mounted. What it
 * does NOT cover is the scene graph itself — @react-three/fiber runs its
 * children through its own reconciler, and a throw from a `useFrame` callback
 * never reaches a DOM boundary. That gap is why `SceneBoundary` exists below
 * and why the world mount is paired with it in App.
 *
 * The error is still written to the console on purpose. The drives fail on a
 * console error, and a boundary that hushed a crash would turn a real defect
 * into a green run — the opposite of what this is for.
 */
export class SurfaceBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[surface:${this.props.origin}]`, error, info.componentStack);
  }

  private reset = (): void => this.setState({ failed: false });

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const { lang, subject, body, retry, origin, className } = this.props;
    return (
      <SurfaceFailed
        lang={lang}
        subject={subject}
        body={body}
        retry={retry}
        origin={origin}
        className={className}
        onRetry={this.reset}
      />
    );
  }
}

interface SceneProps {
  onFail: (error: unknown) => void;
  origin: string;
  children?: ReactNode;
}

/**
 * The scene-graph half of the world's failure path.
 *
 * Lives INSIDE `<Canvas>` because that is the only place the fiber reconciler
 * can be caught. It draws nothing — a three.js subtree has no fallback picture
 * worth showing, and a half-drawn city is worse than none — it reports the
 * error up, and the app replaces the whole canvas with `SurfaceFailed`.
 */
export class SceneBoundary extends Component<SceneProps, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[surface:${this.props.origin}]`, error, info.componentStack);
    this.props.onFail(error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
