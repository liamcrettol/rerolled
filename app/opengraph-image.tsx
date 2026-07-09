import { ImageResponse } from "next/og";

// Link-preview card, drawn from the design tokens rather than a committed PNG so
// it stays in sync with the palette. Rendered once at build time for the root
// route and reused for every link that unfurls to the app.
export const alt = "Rerolled: random Destiny 2 loadouts from your fireteam's shared pool";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#101216",
          border: "1px solid #2a2e36",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 12,
            textTransform: "uppercase",
            color: "#9aa1a9",
          }}
        >
          Destiny 2
        </div>
        <div style={{ display: "flex", marginTop: 16 }}>
          <div style={{ fontSize: 132, fontWeight: 800, color: "#00aeef" }}>Re</div>
          <div style={{ fontSize: 132, fontWeight: 800, color: "#ffffff" }}>rolled</div>
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 34,
            color: "#d3dae1",
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          Built from what your fireteam actually owns
        </div>
      </div>
    ),
    size
  );
}
