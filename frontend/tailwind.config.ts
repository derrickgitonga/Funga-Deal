import type { Config } from "tailwindcss";

const config: Config = {
    content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
    theme: {
        extend: {
            colors: {
                navy: {
                    50: "#E8EAF0",
                    100: "#C5C9D6",
                    200: "#9DA3B8",
                    300: "#75799A",
                    400: "#505572",
                    500: "#2D3348",
                    600: "#252A3E",
                    700: "#1E2235",
                    800: "#1A202C",
                    900: "#111524",
                    950: "#0A0D16",
                },
                slate: {
                    350: "#9CA3AF",
                    450: "#6B7280",
                },
                success: {
                    50: "#ECFDF5",
                    100: "#D1FAE5",
                    200: "#A7F3D0",
                    300: "#6EE7B7",
                    400: "#34D399",
                    500: "#10B981",
                    600: "#059669",
                    700: "#047857",
                },
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
            },
        },
    },
    plugins: [],
};

export default config;
