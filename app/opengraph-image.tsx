import { ImageResponse } from "next/og";
import { Mark } from "./mark";

export const alt = "Tabled: pick a place to eat together";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The preview card shown when a link is pasted into a messaging app.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "linear-gradient(160deg, #f7f4ff 0%, #e1d6ff 100%)",
          color: "#2b1a52",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <Mark size={96} />
          <div style={{ marginLeft: 28, fontSize: 72, fontWeight: 800, color: "#3d1d7a" }}>
            Tabled
          </div>
        </div>
        <div style={{ marginTop: 56, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
          Where should we eat?
        </div>
        <div style={{ marginTop: 28, fontSize: 40, color: "#6b6190" }}>
          Tell us what you’re into. Vote on a place together.
        </div>
      </div>
    ),
    size,
  );
}
