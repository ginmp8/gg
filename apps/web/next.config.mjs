const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  transpilePackages: ["@gita/core"],
  // Preserve the existing Next.js server workflow for web use.
  // Tauri builds ship only statically exported HTML/CSS/JS.
  ...(process.env.GITA_DESKTOP === "1" ? { output: "export" } : {})
};

export default nextConfig;
