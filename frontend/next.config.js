const path = require("path");

const nextConfig = {
    turbopack: {
        root: path.resolve(__dirname),
    },
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: "http://localhost:8000/api/:path*",
            },
            {
                source: "/vault/:path*",
                destination: "http://localhost:8001/:path*",
            },
        ];
    },
};

module.exports = nextConfig;
