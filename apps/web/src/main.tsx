import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/newsreader/600.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

interface Summary {
  slug: string;
  title: string;
  slideCount: number;
  updatedAt: string;
}

interface Preview extends Summary {
  slides: Array<{ id: string; headline: string; svg: string }>;
}

interface ValidationError {
  file: string;
  path: string;
  message: string;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? "slide" : "slides"}`;
}

function Errors({ errors }: { errors: ValidationError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="errors">
      {errors.map((error) => (
        <div className="error" role="alert" key={`${error.file}:${error.path}`}>
          <span className="error-source">{error.file}:<span className="error-path">{error.path}</span></span>
          <p className="error-message">{error.message}</p>
          <p className="error-note">The last valid preview is still shown.</p>
        </div>
      ))}
    </div>
  );
}

function Lightbox({
  preview,
  index,
  onClose,
  onStep
}: {
  preview: Preview;
  index: number;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onStep(1);
      if (event.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("is-locked");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("is-locked");
    };
  }, [onClose, onStep]);

  const slide = preview.slides[index];
  if (!slide) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Slide ${index + 1}`} onClick={onClose}>
      <div className="lightbox-stage" onClick={(event) => event.stopPropagation()}>
        <div
          className="lightbox-slide"
          data-testid="lightbox-slide"
          dangerouslySetInnerHTML={{ __html: slide.svg }}
        />
        <div className="lightbox-bar">
          <button type="button" className="icon-button" onClick={() => onStep(-1)} aria-label="Previous slide">←</button>
          <span className="lightbox-count">{index + 1} / {preview.slides.length}</span>
          <button type="button" className="icon-button" onClick={() => onStep(1)} aria-label="Next slide">→</button>
        </div>
      </div>
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}

function CarouselView({ preview, errors }: { preview: Preview; errors: ValidationError[] }) {
  const [zoomed, setZoomed] = useState<number>();

  const step = useCallback(
    (delta: number) => {
      setZoomed((current) => {
        if (current === undefined) return current;
        const next = (current + delta + preview.slides.length) % preview.slides.length;
        return next;
      });
    },
    [preview.slides.length]
  );

  return (
    <>
      <header className="topbar">
        <a href="/" className="topbar-back">
          <span aria-hidden="true">←</span> All carousels
        </a>
        <div className="topbar-title">
          <h1>{preview.title}</h1>
          <p className="topbar-meta">
            {countLabel(preview.slideCount)} <span className="dot" /> updated {formatTime(preview.updatedAt)}
          </p>
        </div>
        <div className="topbar-actions">
          <a
            className="button"
            href={`/api/carousels/${encodeURIComponent(preview.slug)}/instagram.zip`}
            download={`${preview.slug}-instagram.zip`}
          >
            Download Instagram PNGs
          </a>
          <a
            className="button button-primary"
            href={`/api/carousels/${encodeURIComponent(preview.slug)}/linkedin.pdf`}
            download={`${preview.slug}-linkedin.pdf`}
          >
            Download LinkedIn PDF
          </a>
        </div>
      </header>
      <main className="page">
        <Errors errors={errors} />
        <section className="slides" aria-label="Slides">
          {preview.slides.map((slide, index) => (
            <article className="slide-cell" key={slide.id}>
              <button
                type="button"
                className="slide-button"
                onClick={() => setZoomed(index)}
                aria-label={`Slide ${index + 1}: ${slide.headline}`}
              >
                <div
                  className="slide"
                  data-testid="slide"
                  dangerouslySetInnerHTML={{ __html: slide.svg }}
                />
              </button>
              <p className="slide-caption">
                <span className="slide-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="slide-id">{slide.id}</span>
              </p>
            </article>
          ))}
        </section>
      </main>
      {zoomed !== undefined && (
        <Lightbox preview={preview} index={zoomed} onClose={() => setZoomed(undefined)} onStep={step} />
      )}
    </>
  );
}

function IndexView({
  summaries,
  errors,
  version
}: {
  summaries: Summary[];
  errors: ValidationError[];
  version: number;
}) {
  return (
    <>
      <header className="topbar">
        <span className="wordmark">Slip</span>
        <p className="topbar-note">Edit YAML in your editor. This preview follows along.</p>
      </header>
      <main className="page">
        <Errors errors={errors} />
        {summaries.length === 0 ? (
          <div className="empty">
            <h2>No carousels yet</h2>
            <p>
              Run <code>slip new my-carousel</code> in your workspace to create one.
            </p>
          </div>
        ) : (
          <section className="grid" aria-label="Carousels">
            {summaries.map((carousel) => (
              <a className="card" href={`/?carousel=${encodeURIComponent(carousel.slug)}`} key={carousel.slug}>
                <span className="card-cover">
                  <img
                    src={`/api/carousels/${encodeURIComponent(carousel.slug)}/cover.svg?v=${version}`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className="card-copy">
                  <h2>{carousel.title}</h2>
                  <span className="card-meta">
                    {countLabel(carousel.slideCount)} <span className="dot" /> updated{" "}
                    <time dateTime={carousel.updatedAt}>{formatTime(carousel.updatedAt)}</time>
                  </span>
                </span>
              </a>
            ))}
          </section>
        )}
      </main>
    </>
  );
}

function App() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [version, setVersion] = useState(0);
  const seen = useRef(-1);
  const selectedSlug = new URLSearchParams(window.location.search).get("carousel");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const stateResponse = await fetch("/api/state");
      const state = (await stateResponse.json()) as {
        version: number;
        carousels: Summary[];
        errors: ValidationError[];
      };
      if (!active || state.version === seen.current) return;
      seen.current = state.version;
      setSummaries(state.carousels);
      setErrors(state.errors);
      setVersion(state.version);
      if (selectedSlug) {
        const response = await fetch(`/api/carousels/${encodeURIComponent(selectedSlug)}`);
        if (response.ok) {
          const detail = (await response.json()) as { carousel: Preview; error?: ValidationError };
          setPreview(detail.carousel);
          setErrors(detail.error ? [detail.error] : []);
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 300);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedSlug]);

  if (selectedSlug && preview) {
    return <CarouselView preview={preview} errors={errors} />;
  }

  return <IndexView summaries={summaries} errors={errors} version={version} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
