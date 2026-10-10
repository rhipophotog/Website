import { ImageResponse } from "next/og";

/** Placeholder app icon (an "R" monogram) rendered to PNG. Swap for the real logo later. */
export function brandIconResponse(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#17140f",
          color: "#c9a46a",
          fontSize: size * 0.6,
          fontWeight: 700,
          fontFamily: "serif",
        }}
      >
        R
      </div>
    ),
    { width: size, height: size },
  );
}
