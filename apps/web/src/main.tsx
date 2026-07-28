import "@fontsource/bodoni-moda/400.css";
import "@fontsource/bodoni-moda/400-italic.css";
import "@fontsource/inter/400.css";
import React, { useEffect, useRef, useState } from "react";
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

function App() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const version = useRef(-1);
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
      if (!active || state.version === version.current) return;
      version.current = state.version;
      setSummaries(state.carousels);
      setErrors(state.errors);
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
    return (
      <main>
        <header className="project-header">
          <a href="/" className="back">← All carousels</a>
          <div>
            <p className="kicker">Read-only preview</p>
            <h1>{preview.title}</h1>
            <p>{preview.slideCount} {preview.slideCount === 1 ? "slide" : "slides"} · updated {formatTime(preview.updatedAt)}</p>
            <div className="downloads">
              <a
                className="download"
                href={`/api/carousels/${encodeURIComponent(preview.slug)}/instagram.zip`}
                download={`${preview.slug}-instagram.zip`}
              >
                Download Instagram PNGs
              </a>
              <a
                className="download download-secondary"
                href={`/api/carousels/${encodeURIComponent(preview.slug)}/linkedin.pdf`}
                download={`${preview.slug}-linkedin.pdf`}
              >
                Download LinkedIn PDF
              </a>
            </div>
          </div>
        </header>
        {errors.map((error) => (
          <div className="error" role="alert" key={`${error.file}:${error.path}`}>
            <strong>{error.file}:{error.path}</strong>
            <span>{error.message}</span>
            <small>The last valid preview is still shown.</small>
          </div>
        ))}
        <section className="slides" aria-label="Slides">
          {preview.slides.map((slide, index) => (
            <article className="slide-row" key={slide.id}>
              <span className="slide-number">{String(index + 1).padStart(2, "0")}</span>
              <div
                className="slide"
                data-testid="slide"
                aria-label={`Slide ${index + 1}: ${slide.headline}`}
                dangerouslySetInnerHTML={{ __html: slide.svg }}
              />
            </article>
          ))}
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="index-header">
        <div>
          <p className="kicker">Local carousel studio</p>
          <h1>Slip</h1>
        </div>
        <p className="intro">Edit YAML in your own editor. Preview every slide here.</p>
      </header>
      {errors.map((error) => (
        <div className="error" role="alert" key={`${error.file}:${error.path}`}>
          <strong>{error.file}:{error.path}</strong><span>{error.message}</span>
        </div>
      ))}
      <section className="grid" aria-label="Carousels">
        {summaries.map((carousel) => (
          <a className="card" href={`/?carousel=${encodeURIComponent(carousel.slug)}`} key={carousel.slug}>
            <div className="thumbnail"><span>{carousel.title}</span></div>
            <div className="card-copy">
              <h2>{carousel.title}</h2>
              <p>{carousel.slideCount} {carousel.slideCount === 1 ? "slide" : "slides"}</p>
              <time dateTime={carousel.updatedAt}>Updated {formatTime(carousel.updatedAt)}</time>
            </div>
          </a>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
