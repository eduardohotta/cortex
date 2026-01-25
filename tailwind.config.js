/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx,html}",
        "./index.html"
    ],
    theme: {
        extend: {
            colors: {
                primary: '#3b82f6', // blue-500
                secondary: '#1f2937', // gray-800
                background: '#0a0a0c', // gray-950 approx
                surface: '#111827', // gray-900
            }
        },
    },
    plugins: [],
}
