import type { Scene } from './types'
import { sceneToReact } from './exporters'
import { zipStore } from './zip'
import { slug } from './utils'

/** A ready-to-run React + Vite + Tailwind + framer-motion project for a scene. */
export function reactProjectZip(s: Scene): Blob {
  const name = slug(s.name) || 'shear-scene'
  const component = sceneToReact(s)

  const files = [
    {
      path: 'package.json',
      data: JSON.stringify(
        {
          name,
          private: true,
          version: '0.1.0',
          type: 'module',
          scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
            'framer-motion': '^11.11.9',
            'lucide-react': '^0.453.0',
          },
          devDependencies: {
            '@types/react': '^18.3.11',
            '@types/react-dom': '^18.3.1',
            '@vitejs/plugin-react': '^4.3.2',
            autoprefixer: '^10.4.20',
            postcss: '^8.4.47',
            tailwindcss: '^3.4.14',
            typescript: '^5.6.3',
            vite: '^5.4.9',
          },
        },
        null,
        2,
      ),
    },
    {
      path: 'vite.config.ts',
      data: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,
    },
    {
      path: 'tailwind.config.js',
      data: `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
`,
    },
    {
      path: 'postcss.config.js',
      data: `export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
`,
    },
    { path: 'tsconfig.json', data: `{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
` },
    {
      path: 'index.html',
      data: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${s.name.replace(/</g, '&lt;')}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'src/index.css',
      data: `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-neutral-900 text-neutral-100 antialiased;
}
`,
    },
    {
      path: 'src/main.tsx',
      data: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
    },
    {
      path: 'src/App.tsx',
      data: `import Scene from './Scene'

export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Scene />
    </main>
  )
}
`,
    },
    { path: 'src/Scene.tsx', data: component },
    {
      path: 'README.md',
      data: `# ${s.name}

Exported from Shear as a React project.

\`\`\`
npm install
npm run dev
\`\`\`

Stack: Vite + React + Tailwind + framer-motion (+ lucide-react for icons).
`,
    },
  ]

  return zipStore(files)
}
