import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

/** Tab favicon — Clinexa "C" mark (matches BrandMark gold / ink). */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#efd56a",
          borderRadius: 8,
          color: "#1c1c1c",
          fontSize: 20,
          fontWeight: 700,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          letterSpacing: "-0.04em",
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
