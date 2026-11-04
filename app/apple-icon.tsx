import { ImageResponse } from "next/og";
import { Mark } from "./mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iPhones use this for "Add to Home Screen" and some chat apps use it as the link icon.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#6a32d1",
        }}
      >
        <Mark size={120} />
      </div>
    ),
    size,
  );
}
